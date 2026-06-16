import type { RegisterAttendeesDeps } from '@core/usecases/register-attendees';
import type { StoragePort } from '@core/ports/storage';
import type { EmailPort } from '@core/ports/email';
import type { EmergencyExportPort } from '@core/ports/emergency-export';
import type { PaymentProvider } from '@core/ports/payment';
import type { PricingConfig } from '@core/domain/pricing';
import { MemoryStorage } from './storage/memory-storage';
import { SupabaseStorage } from './storage/supabase-storage';
import { ConsoleEmail } from './email/console-email';
import { ResendEmail } from './email/resend-email';
import { MemoryEmergencyExport } from './emergency/memory-export';
import { GoogleSheetsExport } from './emergency/google-sheets-export';
import { MemoryPaymentProvider } from './payment/memory-payment';
import { MercadoPagoPayment } from './payment/mercadopago';
import { loadPricingConfig } from './payment/default-pricing';

/**
 * Selecciona entre adapter real (todas las vars presentes) o de desarrollo
 * (ninguna presente). Si el grupo está configurado a medias lanza, en vez de
 * caer silenciosamente al adapter de memoria y perder datos en producción.
 *
 * El fallback de desarrollo solo se permite fuera de producción (`allowDev`):
 * en producción, un grupo SIN configurar lanza en vez de degradar a memoria,
 * que devolvería 201 y perdería el registro en el próximo reinicio del proceso.
 */
function pickGroup<T>(
  group: string,
  vars: Record<string, string | undefined>,
  real: () => T,
  dev: () => T,
  allowDev: boolean,
): T {
  const names = Object.keys(vars);
  const present = names.filter((n) => vars[n]);
  if (present.length === names.length) return real();
  if (present.length === 0) {
    if (allowDev) return dev();
    throw new Error(
      `Config de "${group}" ausente en producción: definí ${names.join(', ')}. ` +
        `El adapter de memoria solo se permite fuera de producción.`,
    );
  }
  const missing = names.filter((n) => !vars[n]);
  throw new Error(
    `Config de "${group}" incompleta: faltan ${missing.join(', ')}. ` +
      `Definí todas las variables o ninguna (modo desarrollo).`,
  );
}

/**
 * Construye las dependencias del caso de uso según variables de entorno.
 * Si faltan TODAS las credenciales de un grupo, cae en los adapters en
 * memoria/consola (dev). Config parcial lanza (ver {@link pickGroup}).
 * Cambiar de proveedor = cambiar este archivo, no el dominio.
 */
export function buildDeps(env: NodeJS.ProcessEnv = process.env): RegisterAttendeesDeps {
  const allowDev = env.NODE_ENV !== 'production';

  const storage = pickGroup<StoragePort>(
    'storage (Supabase)',
    { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY },
    () => new SupabaseStorage({ url: env.SUPABASE_URL!, serviceKey: env.SUPABASE_SERVICE_KEY! }),
    () => new MemoryStorage(),
    allowDev,
  );

  const email = pickGroup<EmailPort>(
    'email (Resend)',
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM },
    () => new ResendEmail({ apiKey: env.RESEND_API_KEY!, from: env.RESEND_FROM! }),
    () => new ConsoleEmail(),
    allowDev,
  );

  const emergency = pickGroup<EmergencyExportPort>(
    'emergencia (Google Sheets)',
    {
      SHEETS_WEBHOOK_URL: env.SHEETS_WEBHOOK_URL,
      SHEETS_WEBHOOK_SECRET: env.SHEETS_WEBHOOK_SECRET,
    },
    () =>
      new GoogleSheetsExport({
        webhookUrl: env.SHEETS_WEBHOOK_URL!,
        secret: env.SHEETS_WEBHOOK_SECRET!,
      }),
    () => new MemoryEmergencyExport(),
    allowDev,
  );

  return { storage, email, emergency };
}

/** Dependencias de los casos de uso de pago (Fase 2). */
export interface PaymentDeps extends RegisterAttendeesDeps {
  payment: PaymentProvider;
  pricing: PricingConfig;
}

/**
 * Construye las dependencias de pago: reusa storage/email/emergencia de
 * {@link buildDeps} y agrega el proveedor de pago + la config de precios.
 * Sin credenciales de MP cae en {@link MemoryPaymentProvider} (dev).
 * `MP_ACCESS_TOKEN` es secreto de servidor: solo se lee acá, nunca al cliente.
 */
export function buildPaymentDeps(env: NodeJS.ProcessEnv = process.env): PaymentDeps {
  const base = buildDeps(env);
  const allowDev = env.NODE_ENV !== 'production';

  const payment = pickGroup<PaymentProvider>(
    'pago (Mercado Pago)',
    {
      MP_ACCESS_TOKEN: env.MP_ACCESS_TOKEN,
      MP_WEBHOOK_SECRET: env.MP_WEBHOOK_SECRET,
      // Obligatoria junto a las credenciales: sin URL de notificación MP no
      // confirma el pago, así que un grupo a medias lanza (ver pickGroup) en vez
      // de cobrar sin vía de confirmación.
      MP_NOTIFICATION_URL: env.MP_NOTIFICATION_URL,
    },
    () =>
      new MercadoPagoPayment({
        accessToken: env.MP_ACCESS_TOKEN!,
        webhookSecret: env.MP_WEBHOOK_SECRET!,
        notificationUrl: env.MP_NOTIFICATION_URL!,
      }),
    () => new MemoryPaymentProvider(),
    allowDev,
  );

  const pricing = loadPricingConfig(env.PRICING_CONFIG);

  return { ...base, payment, pricing };
}
