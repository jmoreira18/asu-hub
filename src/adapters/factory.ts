import type { RegisterAttendeesDeps } from '@core/usecases/register-attendees';
import type { StoragePort } from '@core/ports/storage';
import type { EmailPort } from '@core/ports/email';
import type { EmergencyExportPort } from '@core/ports/emergency-export';
import { MemoryStorage } from './storage/memory-storage';
import { SupabaseStorage } from './storage/supabase-storage';
import { ConsoleEmail } from './email/console-email';
import { ResendEmail } from './email/resend-email';
import { MemoryEmergencyExport } from './emergency/memory-export';
import { GoogleSheetsExport } from './emergency/google-sheets-export';

/**
 * Selecciona entre adapter real (todas las vars presentes) o de desarrollo
 * (ninguna presente). Si el grupo está configurado a medias lanza, en vez de
 * caer silenciosamente al adapter de memoria y perder datos en producción.
 */
function pickGroup<T>(
  group: string,
  vars: Record<string, string | undefined>,
  real: () => T,
  dev: () => T,
): T {
  const names = Object.keys(vars);
  const present = names.filter((n) => vars[n]);
  if (present.length === 0) return dev();
  if (present.length === names.length) return real();
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
  const storage = pickGroup<StoragePort>(
    'storage (Supabase)',
    { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY },
    () => new SupabaseStorage({ url: env.SUPABASE_URL!, serviceKey: env.SUPABASE_SERVICE_KEY! }),
    () => new MemoryStorage(),
  );

  const email = pickGroup<EmailPort>(
    'email (Resend)',
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM: env.RESEND_FROM },
    () => new ResendEmail({ apiKey: env.RESEND_API_KEY!, from: env.RESEND_FROM! }),
    () => new ConsoleEmail(),
  );

  const emergency = pickGroup<EmergencyExportPort>(
    'emergencia (Google Sheets)',
    { SHEETS_WEBHOOK_URL: env.SHEETS_WEBHOOK_URL, SHEETS_WEBHOOK_SECRET: env.SHEETS_WEBHOOK_SECRET },
    () =>
      new GoogleSheetsExport({
        webhookUrl: env.SHEETS_WEBHOOK_URL!,
        secret: env.SHEETS_WEBHOOK_SECRET!,
      }),
    () => new MemoryEmergencyExport(),
  );

  return { storage, email, emergency };
}
