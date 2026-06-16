import { describe, it, expect, vi } from 'vitest';
import { startPayment, type StartPaymentDeps } from './start-payment';
import type { PricingConfig } from '../domain/pricing';
import type { Registration, RegistrationStatus } from '../domain/types';

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

function makeDeps(reg: Registration | null = registration()): StartPaymentDeps {
  return {
    storage: {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(reg),
      updateStatus: vi.fn(),
      compareAndSetStatus: vi.fn().mockResolvedValue(true),
      setPaymentQuote: vi.fn().mockResolvedValue(undefined),
    },
    payment: {
      createPayment: vi
        .fn()
        .mockResolvedValue({ paymentId: 'pay-1', checkoutUrl: 'https://mp/checkout' }),
      verifyPayment: vi.fn(),
      parseWebhook: vi.fn(),
      verifyWebhook: vi.fn(),
    },
    pricing: PRICING,
    // Sin clock: usa el reloj real; la tanda cubre el año 2026 entero.
  };
}

describe('startPayment', () => {
  it('calcula el monto server-side y crea el pago', async () => {
    const deps = makeDeps();
    const result = await startPayment(deps)('reg-1');

    expect(deps.payment.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ registrationId: 'reg-1', amountCents: 30000, currency: 'UYU' }),
    );
    expect(result.checkoutUrl).toBe('https://mp/checkout');
    expect(result.amountCents).toBe(30000);
    // Bloquea el monto cotizado para que confirmPayment no recalcule con el reloj.
    expect(deps.storage.setPaymentQuote).toHaveBeenCalledWith('reg-1', 30000, 'UYU');
  });

  it('lanza si la registración no existe', async () => {
    const deps = makeDeps(null);
    await expect(startPayment(deps)('nope')).rejects.toThrow(/no encontrada/);
    expect(deps.payment.createPayment).not.toHaveBeenCalled();
  });

  it('lanza si la registración no está en un estado pagable', async () => {
    const deps = makeDeps(registration('draft'));
    await expect(startPayment(deps)('reg-1')).rejects.toThrow(/estado "draft"/);
    expect(deps.payment.createPayment).not.toHaveBeenCalled();
  });
});
