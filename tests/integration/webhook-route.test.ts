import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mockeamos las dependencias del route handler para aislar SU lógica (parseo,
// gate de firma, brancheo del resultado, status codes). El use case y el adapter
// tienen sus propios tests; acá probamos la ruta.
const verifyWebhook = vi.fn();
const parseWebhook = vi.fn();
const confirm = vi.fn();

vi.mock('@adapters/factory', () => ({
  buildPaymentDeps: vi.fn(() => ({ payment: { verifyWebhook, parseWebhook } })),
}));
vi.mock('@core/usecases/confirm-payment', () => ({
  confirmPayment: vi.fn(() => confirm),
}));

// Import después de los mocks (deps se cachean a nivel de módulo en la ruta).
const { POST } = await import('@/app/api/payments/webhook/route');

const post = (
  body: string,
  { url = 'https://x/api/payments/webhook', signature = 'ts=1,v1=ab' } = {},
) =>
  POST(
    new Request(url, {
      method: 'POST',
      body,
      headers: { 'x-signature': signature, 'x-request-id': 'req-1' },
    }),
  );

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    verifyWebhook.mockReset();
    parseWebhook.mockReset();
    confirm.mockReset();
    verifyWebhook.mockReturnValue(true);
  });

  it('400 si el body no es JSON válido (no llega a validar firma)', async () => {
    const res = await post('no es json');
    expect(res.status).toBe(400);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it('401 si la firma es inválida', async () => {
    verifyWebhook.mockReturnValue(false);
    const res = await post(JSON.stringify({ data: { id: '1' } }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Firma inválida' });
  });

  it('200 ignored cuando parseWebhook no encuentra id (ping)', async () => {
    parseWebhook.mockReturnValue(null);
    const res = await post(JSON.stringify({ type: 'ping' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ignored: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('200 confirmed:true cuando el pago se confirma', async () => {
    parseWebhook.mockReturnValue({ paymentId: 'pay-9' });
    confirm.mockResolvedValue({ confirmed: true });
    const res = await post(JSON.stringify({ data: { id: 'pay-9' } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ confirmed: true });
    expect(confirm).toHaveBeenCalledWith('pay-9');
  });

  it('200 confirmed:false (no reintentos infinitos) y loguea el motivo', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseWebhook.mockReturnValue({ paymentId: 'pay-9' });
    confirm.mockResolvedValue({ confirmed: false, reason: 'amount-mismatch' });
    const res = await post(JSON.stringify({ data: { id: 'pay-9' } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ confirmed: false });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('500 si confirmPayment lanza (para que el proveedor reintente)', async () => {
    parseWebhook.mockReturnValue({ paymentId: 'pay-9' });
    confirm.mockRejectedValue(new Error('boom'));
    const res = await post(JSON.stringify({ data: { id: 'pay-9' } }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Error interno' });
  });

  it('toma dataId del query param si está presente', async () => {
    parseWebhook.mockReturnValue(null);
    await post(JSON.stringify({ data: { id: 'del-body' } }), {
      url: 'https://x/api/payments/webhook?data.id=del-query',
    });
    expect(verifyWebhook).toHaveBeenCalledWith(expect.objectContaining({ dataId: 'del-query' }));
  });

  it('cae al data.id del body si no hay query param', async () => {
    parseWebhook.mockReturnValue(null);
    await post(JSON.stringify({ data: { id: 'del-body' } }));
    expect(verifyWebhook).toHaveBeenCalledWith(expect.objectContaining({ dataId: 'del-body' }));
  });
});
