import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirmPayment, type ConfirmPaymentDeps } from './confirm-payment';
import type { PricingConfig } from '../domain/pricing';
import type { Registration, RegistrationStatus } from '../domain/types';
import type { VerifiedPayment } from '../ports/payment';

const PRICING: PricingConfig = {
  currency: 'UYU',
  tiers: [
    {
      id: 'única',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2027-01-01T00:00:00Z'),
      prices: { socio: 10000, 'no-socio': 30000 },
    },
  ],
};

// 1 no-socio => 30000 al precio de la tanda.
const registration = (status: RegistrationStatus = 'confirmed'): Registration => ({
  id: 'reg-1',
  buyerName: 'Ana',
  buyerEmail: 'ana@example.com',
  status,
  createdAt: new Date('2026-06-01T00:00:00Z'),
  attendees: [
    {
      fullName: 'Ana',
      country: 'Uruguay',
      documentNumber: '1',
      experience: 'beginner',
      emergencyContact: { name: 'A', phone: 'B', relation: 'C' },
      medicalInsurance: 'CASMU',
      waiverAccepted: true,
    },
  ],
});

const verified = (over: Partial<VerifiedPayment> = {}): VerifiedPayment => ({
  status: 'approved',
  registrationId: 'reg-1',
  amountCents: 30000,
  currency: 'UYU',
  ...over,
});

function makeDeps(
  over: { reg?: Registration | null; verified?: VerifiedPayment } = {},
): ConfirmPaymentDeps {
  return {
    storage: {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(over.reg === undefined ? registration() : over.reg),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      compareAndSetStatus: vi.fn().mockResolvedValue(true),
      setPaymentQuote: vi.fn().mockResolvedValue(undefined),
    },
    payment: {
      createPayment: vi.fn(),
      verifyPayment: vi.fn().mockResolvedValue(over.verified ?? verified()),
      parseWebhook: vi.fn(),
      verifyWebhook: vi.fn(),
    },
    emergency: { sync: vi.fn().mockResolvedValue(undefined) },
    email: { sendConfirmation: vi.fn().mockResolvedValue(undefined) },
    pricing: PRICING,
    // Sin clock inyectado: usa el reloj real. La tanda cubre el año 2026 entero, así el
    // cálculo es estable y se ejercita el default del reloj.
  };
}

describe('confirmPayment', () => {
  let deps: ConfirmPaymentDeps;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('confirma: transiciona a paid, manda email y sincroniza emergencia', async () => {
    const result = await confirmPayment(deps)('pay-1');
    expect(result).toMatchObject({ confirmed: true, alreadyProcessed: false });
    expect(deps.storage.compareAndSetStatus).toHaveBeenCalledWith('reg-1', 'confirmed', 'paid');
    expect(deps.email.sendConfirmation).toHaveBeenCalled();
    expect(deps.emergency.sync).toHaveBeenCalled();
    if (result.confirmed) expect(result.registration.status).toBe('paid');
  });

  it('compara contra el monto bloqueado, no recalcula con el reloj', async () => {
    // lockedAmountCents=30000 viene de startPayment; aunque la tanda cambiara,
    // se compara contra esto. verified paga 30000 => confirma.
    const d = makeDeps({
      reg: { ...registration(), lockedAmountCents: 30000, lockedCurrency: 'UYU' },
    });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toMatchObject({ confirmed: true, alreadyProcessed: false });
  });

  it('rechaza si lo pagado no coincide con el monto bloqueado', async () => {
    const d = makeDeps({
      reg: { ...registration(), lockedAmountCents: 99999, lockedCurrency: 'UYU' },
    });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toEqual({ confirmed: false, reason: 'amount-mismatch' });
  });

  it('reentrega en paralelo: si pierde la carrera, no reenvía email/sync', async () => {
    const d = makeDeps();
    d.storage.compareAndSetStatus = vi.fn().mockResolvedValue(false);
    const result = await confirmPayment(d)('pay-1');
    expect(result).toMatchObject({ confirmed: true, alreadyProcessed: true });
    expect(d.email.sendConfirmation).not.toHaveBeenCalled();
    expect(d.emergency.sync).not.toHaveBeenCalled();
  });

  it('no confirma si el pago no está aprobado', async () => {
    const d = makeDeps({ verified: verified({ status: 'pending' }) });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toEqual({ confirmed: false, reason: 'not-approved' });
    expect(d.storage.findById).not.toHaveBeenCalled();
  });

  it('no confirma si la registración no existe', async () => {
    const d = makeDeps({ reg: null });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toEqual({ confirmed: false, reason: 'registration-not-found' });
  });

  it('rechaza si el monto pagado no coincide con el esperado', async () => {
    const d = makeDeps({ verified: verified({ amountCents: 1 }) });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toEqual({ confirmed: false, reason: 'amount-mismatch' });
    expect(d.storage.compareAndSetStatus).not.toHaveBeenCalled();
  });

  it('rechaza si la moneda no coincide', async () => {
    const d = makeDeps({ verified: verified({ currency: 'USD' }) });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toEqual({ confirmed: false, reason: 'amount-mismatch' });
  });

  it('es idempotente: si ya está paid, no re-confirma', async () => {
    const d = makeDeps({ reg: registration('paid') });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toMatchObject({ confirmed: true, alreadyProcessed: true });
    expect(d.storage.compareAndSetStatus).not.toHaveBeenCalled();
  });

  it('rechaza un estado desde el que no se puede pagar (cancelled)', async () => {
    const d = makeDeps({ reg: registration('cancelled') });
    const result = await confirmPayment(d)('pay-1');
    expect(result).toEqual({ confirmed: false, reason: 'invalid-state' });
  });

  it('confirma igual aunque fallen email y sync (best-effort)', async () => {
    deps.email.sendConfirmation = vi.fn().mockRejectedValue(new Error('resend down'));
    deps.emergency.sync = vi.fn().mockRejectedValue(new Error('sheets down'));
    const result = await confirmPayment(deps)('pay-1');
    expect(result.confirmed).toBe(true);
    expect(deps.storage.compareAndSetStatus).toHaveBeenCalledWith('reg-1', 'confirmed', 'paid');
  });
});
