import { describe, it, expect } from 'vitest';
import { buildDeps } from '@adapters/factory';
import { MemoryStorage } from '@adapters/storage/memory-storage';
import { SupabaseStorage } from '@adapters/storage/supabase-storage';
import { ConsoleEmail } from '@adapters/email/console-email';
import { ResendEmail } from '@adapters/email/resend-email';
import { MemoryEmergencyExport } from '@adapters/emergency/memory-export';
import { GoogleSheetsExport } from '@adapters/emergency/google-sheets-export';

describe('buildDeps', () => {
  it('cae en adapters de dev sin credenciales', () => {
    const deps = buildDeps({} as NodeJS.ProcessEnv);
    expect(deps.storage).toBeInstanceOf(MemoryStorage);
    expect(deps.email).toBeInstanceOf(ConsoleEmail);
    expect(deps.emergency).toBeInstanceOf(MemoryEmergencyExport);
  });

  it('usa adapters reales cuando hay credenciales', () => {
    const deps = buildDeps({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_KEY: 'k',
      RESEND_API_KEY: 'rk',
      RESEND_FROM: 'no-reply@asu.uy',
      SHEETS_WEBHOOK_URL: 'https://script/exec',
      SHEETS_WEBHOOK_SECRET: 's',
    } as unknown as NodeJS.ProcessEnv);
    expect(deps.storage).toBeInstanceOf(SupabaseStorage);
    expect(deps.email).toBeInstanceOf(ResendEmail);
    expect(deps.emergency).toBeInstanceOf(GoogleSheetsExport);
  });

  it('lanza si un grupo está configurado a medias (evita fallback silencioso)', () => {
    expect(() =>
      buildDeps({ SUPABASE_URL: 'https://x.supabase.co' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/SUPABASE_SERVICE_KEY/);
  });

  it('en producción lanza si falta un grupo en vez de caer en memoria', () => {
    expect(() =>
      buildDeps({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/producción/);
  });
});
