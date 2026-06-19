import { describe, it, expect, vi } from 'vitest';

// Aísla la ruta read-only de estado: 404 si no existe, 200 con SOLO el status
// (nunca datos sensibles). El `params` es un Promise (App Router).
const findById = vi.fn();

vi.mock('@adapters/factory', () => ({ buildDeps: vi.fn(() => ({ storage: { findById } })) }));

const { GET } = await import('@/app/api/registrations/[id]/route');

const get = (id: string) =>
  GET(new Request('https://x/api/registrations/' + id), { params: Promise.resolve({ id }) });

describe('GET /api/registrations/[id]', () => {
  it('404 si la registración no existe', async () => {
    findById.mockResolvedValue(null);
    const res = await get('nope');
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'No encontrada' });
  });

  it('200 con solo el status (sin datos sensibles)', async () => {
    findById.mockResolvedValue({
      id: 'r1',
      status: 'paid',
      documentNumber: 'SECRETO',
      emergencyContact: { phone: 'SECRETO' },
    });
    const res = await get('r1');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'paid' });
  });
});
