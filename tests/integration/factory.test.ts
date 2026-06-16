import { describe, it, expect } from 'vitest';
import { buildDeps, buildPaymentDeps } from '@adapters/factory';
import { MemoryStorage } from '@adapters/storage/memory-storage';
import { SupabaseStorage } from '@adapters/storage/supabase-storage';
import { ConsoleEmail } from '@adapters/email/console-email';
import { ResendEmail } from '@adapters/email/resend-email';
import { MemoryEmergencyExport } from '@adapters/emergency/memory-export';
import { GoogleSheetsExport } from '@adapters/emergency/google-sheets-export';
import { MemoryPaymentProvider } from '@adapters/payment/memory-payment';
import { MercadoPagoPayment } from '@adapters/payment/mercadopago';
import { DEV_PRICING } from '@adapters/payment/default-pricing';

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
    expect(() => buildDeps({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /producción/,
    );
  });
});

describe('buildPaymentDeps', () => {
  it('sin credenciales cae en proveedor de pago dev y pricing de dev', () => {
    const deps = buildPaymentDeps({} as NodeJS.ProcessEnv);
    expect(deps.payment).toBeInstanceOf(MemoryPaymentProvider);
    expect(deps.pricing).toBe(DEV_PRICING);
    // Reusa los adapters base.
    expect(deps.storage).toBeInstanceOf(MemoryStorage);
  });

  it('usa Mercado Pago cuando hay credenciales', () => {
    const deps = buildPaymentDeps({
      MP_ACCESS_TOKEN: 'tok',
      MP_WEBHOOK_SECRET: 'shh',
      MP_NOTIFICATION_URL: 'https://x/api/payments/webhook',
      MP_RETURN_URL: 'https://x/pago/retorno',
    } as unknown as NodeJS.ProcessEnv);
    expect(deps.payment).toBeInstanceOf(MercadoPagoPayment);
  });

  it('lanza si la config de pago está a medias', () => {
    expect(() =>
      buildPaymentDeps({ MP_ACCESS_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MP_WEBHOOK_SECRET/);
  });

  it('lanza si faltan la URL de notificación (no se cobra sin vía de confirmación)', () => {
    expect(() =>
      buildPaymentDeps({
        MP_ACCESS_TOKEN: 'tok',
        MP_WEBHOOK_SECRET: 'shh',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MP_NOTIFICATION_URL/);
  });

  it('lanza si MP_NOTIFICATION_URL no es https (MP descarta el no-HTTPS en silencio)', () => {
    expect(() =>
      buildPaymentDeps({
        MP_ACCESS_TOKEN: 'tok',
        MP_WEBHOOK_SECRET: 'shh',
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- probamos justo que el http se rechaza
        MP_NOTIFICATION_URL: 'http://x/api/payments/webhook',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/https/);
  });

  it('lanza si falta la URL de retorno (el pagador quedaría varado en MP)', () => {
    expect(() =>
      buildPaymentDeps({
        MP_ACCESS_TOKEN: 'tok',
        MP_WEBHOOK_SECRET: 'shh',
        MP_NOTIFICATION_URL: 'https://x/api/payments/webhook',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MP_RETURN_URL/);
  });

  it('lanza si MP_RETURN_URL no es https', () => {
    expect(() =>
      buildPaymentDeps({
        MP_ACCESS_TOKEN: 'tok',
        MP_WEBHOOK_SECRET: 'shh',
        MP_NOTIFICATION_URL: 'https://x/api/payments/webhook',
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- probamos justo que el http se rechaza
        MP_RETURN_URL: 'http://x/pago/retorno',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/MP_RETURN_URL/);
  });

  it('carga PRICING_CONFIG desde la env cuando está definida', () => {
    const deps = buildPaymentDeps({
      PRICING_CONFIG: JSON.stringify({
        currency: 'USD',
        tiers: [
          { id: 't', from: '2026-01-01', to: '2026-12-31', prices: { socio: 1, 'no-socio': 2 } },
        ],
      }),
    } as unknown as NodeJS.ProcessEnv);
    expect(deps.pricing.currency).toBe('USD');
  });
});
