import { describe, it, expect, vi } from 'vitest';
import { MemoryStorage } from '@adapters/storage/memory-storage';
import { SupabaseStorage } from '@adapters/storage/supabase-storage';
import type { RegistrationInput } from '@core/domain/types';

const input: RegistrationInput = {
  buyerName: 'Ana',
  buyerEmail: 'ana@example.com',
  attendees: [
    {
      fullName: 'Ana',
      country: 'Uruguay',
      documentNumber: '123',
      experience: 'beginner',
      emergencyContact: { name: 'Luis', phone: '+598', relation: 'Hermano' },
      medicalInsurance: 'CASMU',
      waiverAccepted: true,
    },
  ],
};

describe('MemoryStorage', () => {
  it('guarda y recupera por id', async () => {
    const s = new MemoryStorage();
    const reg = await s.save(input, 'confirmed');
    expect(reg.id).toBeTruthy();
    expect(await s.findById(reg.id)).toEqual(reg);
  });

  it('devuelve null si no existe', async () => {
    expect(await new MemoryStorage().findById('nope')).toBeNull();
  });

  it('actualiza estado', async () => {
    const s = new MemoryStorage();
    const reg = await s.save(input, 'confirmed');
    await s.updateStatus(reg.id, 'paid');
    expect((await s.findById(reg.id))?.status).toBe('paid');
  });

  it('updateStatus lanza si no existe', async () => {
    await expect(new MemoryStorage().updateStatus('x', 'paid')).rejects.toThrow();
  });

  it('compareAndSetStatus aplica solo si el estado actual coincide', async () => {
    const s = new MemoryStorage();
    const reg = await s.save(input, 'confirmed');
    expect(await s.compareAndSetStatus(reg.id, 'confirmed', 'paid')).toBe(true);
    // Segunda reentrega: ya no está en 'confirmed' => no aplica.
    expect(await s.compareAndSetStatus(reg.id, 'confirmed', 'paid')).toBe(false);
    expect((await s.findById(reg.id))?.status).toBe('paid');
  });

  it('compareAndSetStatus lanza si no existe', async () => {
    await expect(
      new MemoryStorage().compareAndSetStatus('x', 'confirmed', 'paid'),
    ).rejects.toThrow();
  });

  it('setPaymentQuote persiste el monto bloqueado', async () => {
    const s = new MemoryStorage();
    const reg = await s.save(input, 'confirmed');
    await s.setPaymentQuote(reg.id, 30000, 'UYU');
    const found = await s.findById(reg.id);
    expect(found?.lockedAmountCents).toBe(30000);
    expect(found?.lockedCurrency).toBe('UYU');
  });

  it('setPaymentQuote lanza si no existe', async () => {
    await expect(new MemoryStorage().setPaymentQuote('x', 1, 'UYU')).rejects.toThrow();
  });
});

describe('SupabaseStorage (fetch mockeado)', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  it('save hace POST y mapea la fila devuelta', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok([
        {
          id: 'reg-1',
          buyer_name: 'Ana',
          buyer_email: 'ana@example.com',
          attendees: input.attendees,
          status: 'confirmed',
          created_at: '2026-06-14T00:00:00Z',
        },
      ]),
    );
    const s = new SupabaseStorage({ url: 'https://x.supabase.co', serviceKey: 'k', fetchImpl });
    const reg = await s.save(input, 'confirmed');
    expect(reg.id).toBe('reg-1');
    expect(reg.createdAt).toBeInstanceOf(Date);
    const [url, opts] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/rest/v1/registrations');
    expect((opts as RequestInit).method).toBe('POST');
  });

  it('save lanza si la respuesta no es ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await expect(s.save(input, 'confirmed')).rejects.toThrow('500');
  });

  it('save lanza si no devuelve fila', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]));
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await expect(s.save(input, 'confirmed')).rejects.toThrow('no devolvió fila');
  });

  it('findById devuelve la entidad', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok([
        {
          id: 'reg-1',
          buyer_name: 'Ana',
          buyer_email: 'a@a.com',
          attendees: input.attendees,
          status: 'confirmed',
          created_at: '2026-06-14T00:00:00Z',
        },
      ]),
    );
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    expect((await s.findById('reg-1'))?.id).toBe('reg-1');
  });

  it('findById devuelve null si no hay fila', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]));
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    expect(await s.findById('nope')).toBeNull();
  });

  it('findById lanza si no es ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await expect(s.findById('x')).rejects.toThrow('404');
  });

  it('updateStatus hace PATCH', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await s.updateStatus('reg-1', 'paid');
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).method).toBe('PATCH');
  });

  it('updateStatus lanza si no es ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await expect(s.updateStatus('x', 'paid')).rejects.toThrow('500');
  });

  it('compareAndSetStatus filtra por estado esperado y devuelve si aplicó', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ id: 'reg-1' }]));
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    expect(await s.compareAndSetStatus('reg-1', 'confirmed', 'paid')).toBe(true);
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toContain('status=eq.confirmed');
  });

  it('compareAndSetStatus devuelve false si no matcheó ninguna fila', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]));
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    expect(await s.compareAndSetStatus('reg-1', 'confirmed', 'paid')).toBe(false);
  });

  it('compareAndSetStatus lanza si no es ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await expect(s.compareAndSetStatus('x', 'confirmed', 'paid')).rejects.toThrow('500');
  });

  it('setPaymentQuote hace PATCH del monto bloqueado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await s.setPaymentQuote('reg-1', 30000, 'UYU');
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(init.body).toContain('locked_amount_cents');
  });

  it('setPaymentQuote lanza si no es ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const s = new SupabaseStorage({ url: 'https://x', serviceKey: 'k', fetchImpl });
    await expect(s.setPaymentQuote('x', 1, 'UYU')).rejects.toThrow('500');
  });
});
