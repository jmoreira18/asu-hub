import { describe, it, expect, vi } from 'vitest';

// Aísla el route handler de inicio de pago: parseo, validación de
// registrationId, status codes. El monto lo calcula el use case (su test).
// Sin beforeEach (ver register-route.test). El error específico distingue el
// 400 de validación (pre-handle) del 400 por fallo del use case.
const handle = vi.fn();

vi.mock('@adapters/factory', () => ({ buildPaymentDeps: vi.fn(() => ({})) }));
vi.mock('@core/usecases/start-payment', () => ({ startPayment: vi.fn(() => handle) }));

const { POST } = await import('@/app/api/payments/route');

const post = (body: string) =>
  POST(
    new Request('https://x/api/payments', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('POST /api/payments', () => {
  it('400 si el body no es JSON válido', async () => {
    const res = await post('no es json');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'JSON inválido' });
  });

  it('400 si falta registrationId (no llega al use case)', async () => {
    const res = await post(JSON.stringify({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'registrationId requerido' });
  });

  it('400 si registrationId es vacío', async () => {
    const res = await post(JSON.stringify({ registrationId: '' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'registrationId requerido' });
  });

  it('200 con checkoutUrl/amountCents/currency', async () => {
    handle.mockResolvedValue({
      paymentId: 'p1',
      checkoutUrl: 'https://mp/checkout',
      amountCents: 150000,
      currency: 'UYU',
    });
    const res = await post(JSON.stringify({ registrationId: 'r1' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      checkoutUrl: 'https://mp/checkout',
      amountCents: 150000,
      currency: 'UYU',
    });
    expect(handle).toHaveBeenCalledWith('r1');
  });

  it('400 si el use case lanza (ej: registración no confirmada)', async () => {
    handle.mockImplementation(() => {
      throw new Error('estado inválido');
    });
    const res = await post(JSON.stringify({ registrationId: 'r1' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No se pudo iniciar el pago' });
  });
});
