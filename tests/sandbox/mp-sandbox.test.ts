import { describe, test, expect } from 'vitest';
import { MercadoPagoPayment } from '@adapters/payment/mercadopago';
import type { PaymentStatus } from '@core/ports/payment';

// Smoke test contra la API REAL de MP sandbox — va a MP y vuelve. NO corre en
// `npm test` (vitest.config `include` solo cubre src/** y tests/integration/**),
// ni toca el gate de cobertura. Opt-in vía `npm run test:mp` y solo si hay
// credenciales de sandbox en el entorno. Sin token, se skipea entero.
//
// Token de sandbox: lo enruta MP automáticamente; baseUrl queda en producción.
const token = process.env.MP_ACCESS_TOKEN;

describe.skipIf(!token)('Mercado Pago sandbox (API real)', () => {
  const mp = new MercadoPagoPayment({
    accessToken: token!,
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
  });

  test('createPayment crea una preferencia real y devuelve checkoutUrl https', async () => {
    const { paymentId, checkoutUrl } = await mp.createPayment({
      registrationId: `smoke-${Date.now()}`,
      description: 'Smoke test highline ASU',
      amountCents: 50000,
      currency: 'UYU',
      payerEmail: 'test_user@testuser.com',
    });

    // paymentId = id de la preferencia; checkoutUrl = init_point real de MP.
    expect(paymentId).toBeTruthy();
    expect(checkoutUrl).toMatch(/^https:\/\//);
  });

  // Una preferencia recién creada no tiene pago aún. Para leer un pago real hace
  // falta el id de uno ya aprobado en sandbox (lo produce el E2E del navegador).
  // Gate extra: MP_TEST_PAYMENT_ID.
  test.skipIf(!process.env.MP_TEST_PAYMENT_ID)(
    'verifyPayment mapea la respuesta real de un pago de sandbox',
    async () => {
      const verified = await mp.verifyPayment(process.env.MP_TEST_PAYMENT_ID!);

      const statuses: PaymentStatus[] = ['approved', 'pending', 'rejected'];
      expect(statuses).toContain(verified.status);
      expect(Number.isInteger(verified.amountCents)).toBe(true);
      expect(verified.amountCents).toBeGreaterThan(0);
      expect(verified.currency).toBeTruthy();
      expect(verified.registrationId).toBeTruthy();
    },
  );
});
