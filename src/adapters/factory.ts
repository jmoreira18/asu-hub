import type { RegisterAttendeesDeps } from '@core/usecases/register-attendees';
import { MemoryStorage } from './storage/memory-storage';
import { SupabaseStorage } from './storage/supabase-storage';
import { ConsoleEmail } from './email/console-email';
import { ResendEmail } from './email/resend-email';
import { MemoryEmergencyExport } from './emergency/memory-export';
import { GoogleSheetsExport } from './emergency/google-sheets-export';

/**
 * Construye las dependencias del caso de uso según variables de entorno.
 * Si faltan credenciales, cae en los adapters en memoria/consola (dev).
 * Cambiar de proveedor = cambiar este archivo, no el dominio.
 */
export function buildDeps(env: NodeJS.ProcessEnv = process.env): RegisterAttendeesDeps {
  const storage =
    env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
      ? new SupabaseStorage({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY })
      : new MemoryStorage();

  const email =
    env.RESEND_API_KEY && env.RESEND_FROM
      ? new ResendEmail({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM })
      : new ConsoleEmail();

  const emergency =
    env.SHEETS_WEBHOOK_URL && env.SHEETS_WEBHOOK_SECRET
      ? new GoogleSheetsExport({
          webhookUrl: env.SHEETS_WEBHOOK_URL,
          secret: env.SHEETS_WEBHOOK_SECRET,
        })
      : new MemoryEmergencyExport();

  return { storage, email, emergency };
}
