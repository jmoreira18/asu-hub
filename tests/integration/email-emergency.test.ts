import { describe, it, expect, vi } from 'vitest';
import { ResendEmail } from '@adapters/email/resend-email';
import { ConsoleEmail } from '@adapters/email/console-email';
import { GoogleSheetsExport, toEmergencyRows } from '@adapters/emergency/google-sheets-export';
import { MemoryEmergencyExport } from '@adapters/emergency/memory-export';
import type { Registration } from '@core/domain/types';

const reg: Registration = {
  id: 'reg-1',
  buyerName: 'Ana',
  buyerEmail: 'ana@example.com',
  quantity: 2,
  status: 'confirmed',
  createdAt: new Date('2026-06-14T00:00:00Z'),
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
    {
      fullName: 'Bob',
      country: 'Brasil',
      documentNumber: '456',
      experience: 'advanced',
      emergencyContact: { name: 'Eva', phone: '+55', relation: 'Madre' },
      medicalInsurance: 'SUS',
      waiverAccepted: true,
    },
  ],
};

describe('ResendEmail (fetch mockeado)', () => {
  it('hace POST a la API con el destinatario', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    await new ResendEmail({ apiKey: 'k', from: 'no-reply@asu.uy', fetchImpl }).sendConfirmation(reg);
    const [url, opts] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((opts as RequestInit).body).toContain('ana@example.com');
  });

  it('lanza si la API responde error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422 } as Response);
    await expect(
      new ResendEmail({ apiKey: 'k', from: 'x', fetchImpl }).sendConfirmation(reg),
    ).rejects.toThrow('422');
  });
});

describe('ConsoleEmail', () => {
  it('loguea en vez de enviar', async () => {
    const info = vi.fn();
    await new ConsoleEmail({ info }).sendConfirmation(reg);
    expect(info).toHaveBeenCalledOnce();
  });
});

describe('toEmergencyRows', () => {
  it('aplana a una fila por asistente', () => {
    const rows = toEmergencyRows(reg);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.attendeeName).toBe('Ana');
    expect(rows[1]!.emergencyContactPhone).toBe('+55');
  });
});

describe('GoogleSheetsExport (fetch mockeado)', () => {
  it('postea filas y el secret al webhook', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    await new GoogleSheetsExport({
      webhookUrl: 'https://script.google/exec',
      secret: 's3cr3t',
      fetchImpl,
    }).sync(reg);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.secret).toBe('s3cr3t');
    expect(body.rows).toHaveLength(2);
  });

  it('lanza si el webhook responde error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(
      new GoogleSheetsExport({ webhookUrl: 'x', secret: 's', fetchImpl }).sync(reg),
    ).rejects.toThrow('401');
  });
});

describe('MemoryEmergencyExport', () => {
  it('acumula filas en memoria', async () => {
    const e = new MemoryEmergencyExport();
    await e.sync(reg);
    expect(e.rows).toHaveLength(2);
  });
});
