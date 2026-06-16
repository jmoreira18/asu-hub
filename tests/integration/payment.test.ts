import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { MemoryPaymentProvider } from '@adapters/payment/memory-payment';
import { MercadoPagoPayment } from '@adapters/payment/mercadopago';
import { loadPricingConfig, DEV_PRICING } from '@adapters/payment/default-pricing';
import type { CreatePaymentRequest } from '@core/ports/payment';

const req: CreatePaymentRequest = {
  registrationId: 'reg-1',
  description: 'Registro highline',
  amountCents: 30000,
  currency: 'UYU',
  payerEmail: 'ana@example.com',
};

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

describe('MemoryPaymentProvider (dev)', () => {
  it('createPayment guarda y verifyPayment lo devuelve aprobado', async () => {
    const p = new MemoryPaymentProvider({ info: vi.fn() });
    const { paymentId, checkoutUrl } = await p.createPayment(req);
    expect(checkoutUrl).toContain(paymentId);

    const verified = await p.verifyPayment(paymentId);
    expect(verified).toEqual({
      status: 'approved',
      registrationId: 'reg-1',
      amountCents: 30000,
      currency: 'UYU',
    });
  });

  it('verifyPayment de un id desconocido devuelve rejected', async () => {
    const p = new MemoryPaymentProvider({ info: vi.fn() });
    expect((await p.verifyPayment('nope')).status).toBe('rejected');
  });

  it('parseWebhook extrae paymentId y rechaza payloads inválidos', () => {
    const p = new MemoryPaymentProvider({ info: vi.fn() });
    expect(p.parseWebhook({ paymentId: 'x' })).toEqual({ paymentId: 'x' });
    expect(p.parseWebhook({ paymentId: '' })).toBeNull();
    expect(p.parseWebhook({})).toBeNull();
    expect(p.parseWebhook(null)).toBeNull();
  });

  it('verifyWebhook siempre acepta (no hay firma en dev)', () => {
    const p = new MemoryPaymentProvider({ info: vi.fn() });
    expect(p.verifyWebhook()).toBe(true);
  });
});

describe('MercadoPagoPayment', () => {
  const baseUrl = 'https://api.test';
  // Secretos ficticios solo para los tests (no son credenciales reales).
  const webhookSecret = 'shh';
  const wrongSecret = 'otro';
  const make = (fetchImpl: typeof fetch) =>
    new MercadoPagoPayment({ accessToken: 'tok', webhookSecret, fetchImpl, baseUrl });

  it('createPayment crea preferencia con external_reference y monto en pesos', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'pref-1', init_point: 'https://mp/checkout' }));
    const result = await make(fetchImpl).createPayment(req);

    expect(result).toEqual({ paymentId: 'pref-1', checkoutUrl: 'https://mp/checkout' });
    const [, init] = fetchImpl.mock.calls[0]!;
    const sent = JSON.parse(init.body);
    expect(sent.external_reference).toBe('reg-1');
    expect(sent.items[0].unit_price).toBe(300); // 30000 centavos
  });

  it('createPayment lanza si la API falla', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    await expect(make(fetchImpl).createPayment(req)).rejects.toThrow(/createPayment/);
  });

  it('verifyPayment mapea estado, referencia y monto a centavos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'approved',
        external_reference: 'reg-1',
        transaction_amount: 300,
        currency_id: 'UYU',
      }),
    );
    const verified = await make(fetchImpl).verifyPayment('pay-9');
    expect(verified).toEqual({
      status: 'approved',
      registrationId: 'reg-1',
      amountCents: 30000,
      currency: 'UYU',
    });
  });

  it('verifyPayment mapea rejected/cancelled y otros a pending', async () => {
    const status = async (mp: string) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({
            status: mp,
            external_reference: 'r',
            transaction_amount: 1,
            currency_id: 'UYU',
          }),
        );
      return (await make(fetchImpl).verifyPayment('p')).status;
    };
    expect(await status('rejected')).toBe('rejected');
    expect(await status('cancelled')).toBe('rejected');
    expect(await status('in_process')).toBe('pending');
  });

  it('verifyPayment lanza si la API falla', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 404));
    await expect(make(fetchImpl).verifyPayment('p')).rejects.toThrow(/verifyPayment/);
  });

  it('parseWebhook extrae data.id (string o número) y rechaza el resto', () => {
    const p = make(vi.fn());
    expect(p.parseWebhook({ data: { id: '123' } })).toEqual({ paymentId: '123' });
    expect(p.parseWebhook({ data: { id: 123 } })).toEqual({ paymentId: '123' });
    expect(p.parseWebhook({ data: { id: '' } })).toBeNull();
    expect(p.parseWebhook({ data: {} })).toBeNull();
    expect(p.parseWebhook({})).toBeNull();
    expect(p.parseWebhook(null)).toBeNull();
  });

  it('verifyWebhook valida la firma HMAC y rechaza firmas falsas', () => {
    const p = make(vi.fn());
    const ts = '1700000000';
    const dataId = '123';
    const requestId = 'req-9';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', webhookSecret).update(manifest).digest('hex');

    expect(p.verifyWebhook({ signature: `ts=${ts},v1=${v1}`, requestId, dataId })).toBe(true);
    // Firma con secreto equivocado.
    const bad = createHmac('sha256', wrongSecret).update(manifest).digest('hex');
    expect(p.verifyWebhook({ signature: `ts=${ts},v1=${bad}`, requestId, dataId })).toBe(false);
  });

  it('verifyWebhook rechaza firma ausente o mal formada', () => {
    const p = make(vi.fn());
    expect(p.verifyWebhook({ signature: null, requestId: null, dataId: '1' })).toBe(false);
    expect(p.verifyWebhook({ signature: 'ts=1', requestId: null, dataId: '1' })).toBe(false);
    expect(p.verifyWebhook({ signature: 'garbage', requestId: null, dataId: '1' })).toBe(false);
    // v1 con largo distinto al esperado (no es hex de 32 bytes).
    expect(p.verifyWebhook({ signature: 'ts=1,v1=ab', requestId: null, dataId: '1' })).toBe(false);
  });

  it('verifyWebhook arma el manifest sin request-id cuando no viene', () => {
    const p = make(vi.fn());
    const ts = '1700000000';
    const dataId = '123';
    const manifest = `id:${dataId};ts:${ts};`;
    const v1 = createHmac('sha256', webhookSecret).update(manifest).digest('hex');
    expect(p.verifyWebhook({ signature: `ts=${ts},v1=${v1}`, requestId: null, dataId })).toBe(true);
  });
});

describe('loadPricingConfig', () => {
  it('sin env devuelve la config de desarrollo', () => {
    expect(loadPricingConfig(undefined)).toBe(DEV_PRICING);
  });

  it('parsea y valida JSON de la env', () => {
    const json = JSON.stringify({
      currency: 'USD',
      tiers: [
        { id: 't', from: '2026-01-01', to: '2026-12-31', prices: { socio: 1, 'no-socio': 2 } },
      ],
    });
    const cfg = loadPricingConfig(json);
    expect(cfg.currency).toBe('USD');
    expect(cfg.tiers[0]?.prices['no-socio']).toBe(2);
  });

  it('lanza si el JSON es inválido contra el schema', () => {
    const json = JSON.stringify({ currency: 'USD', tiers: [] });
    expect(() => loadPricingConfig(json)).toThrow();
  });

  it('lanza ValidationError (no SyntaxError) si el JSON está malformado', () => {
    expect(() => loadPricingConfig('{ no es json')).toThrow(/Configuración de precios inválida/);
  });
});
