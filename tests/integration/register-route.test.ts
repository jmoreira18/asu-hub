import { describe, it, expect, vi } from 'vitest';
import { ValidationError } from '@core/domain/errors';

// Aísla la lógica del route handler (parseo, status codes, brancheo del
// resultado). El use case y los adapters tienen sus propios tests.
// Sin beforeEach: cada test fija su propio mock. (Resetear el mock entre tests
// y luego rechazar dispara un falso "unhandled rejection" en vitest.)
const handle = vi.fn();

vi.mock('@adapters/factory', () => ({ buildDeps: vi.fn(() => ({})) }));
vi.mock('@core/usecases/register-attendees', () => ({
  registerAttendees: vi.fn(() => handle),
}));

const { POST } = await import('@/app/api/register/route');

const post = (body: string) =>
  POST(
    new Request('https://x/api/register', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('POST /api/register', () => {
  it('400 si el body no es JSON válido', async () => {
    const res = await post('no es json');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'JSON inválido' });
  });

  it('201 con id/emergencySynced/emailSent', async () => {
    handle.mockResolvedValue({
      registration: { id: 'r1' },
      emergencySynced: true,
      emailSent: true,
    });
    const res = await post(JSON.stringify({ ok: 1 }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: 'r1',
      emergencySynced: true,
      emailSent: true,
    });
  });

  it('201 pero loguea si la emergencia NO se sincronizó', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handle.mockResolvedValue({
      registration: { id: 'r2' },
      emergencySynced: false,
      emailSent: true,
    });
    const res = await post(JSON.stringify({}));
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('400 con issues ante ValidationError', async () => {
    handle.mockImplementation(() => {
      throw new ValidationError('inválido', { buyerEmail: ['requerido'] });
    });
    const res = await post(JSON.stringify({}));
    expect(res.status).toBe(400);
    expect((await res.json()).issues).toHaveProperty('buyerEmail');
  });

  it('500 ante error inesperado', async () => {
    handle.mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await post(JSON.stringify({}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Error interno' });
  });
});
