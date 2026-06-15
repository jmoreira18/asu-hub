import { parseRegistrationInput } from '../domain/schemas';
import { transition } from '../domain/state-machine';
import type { Registration } from '../domain/types';
import type { StoragePort } from '../ports/storage';
import type { EmergencyExportPort } from '../ports/emergency-export';
import type { EmailPort } from '../ports/email';

export interface RegisterAttendeesDeps {
  storage: StoragePort;
  emergency: EmergencyExportPort;
  email: EmailPort;
}

export interface RegisterAttendeesResult {
  registration: Registration;
  /** El registro siempre se guarda; el email es best-effort. */
  emailSent: boolean;
}

/**
 * Caso de uso de registro (Fase 1, sin pago).
 *
 * Orden por criticidad:
 *  1. Validar entrada (lanza ValidationError).
 *  2. Guardar como `confirmed` (fuente de verdad — crítico).
 *  3. Sincronizar planilla de emergencia (seguridad — crítico).
 *  4. Enviar email de confirmación (best-effort — no rompe el registro).
 */
export function registerAttendees(deps: RegisterAttendeesDeps) {
  return async (rawInput: unknown): Promise<RegisterAttendeesResult> => {
    const input = parseRegistrationInput(rawInput);

    const status = transition('draft', 'confirm');
    const registration = await deps.storage.save(input, status);

    await deps.emergency.sync(registration);

    let emailSent = false;
    try {
      await deps.email.sendConfirmation(registration);
      emailSent = true;
    } catch {
      // El registro ya está persistido y sincronizado; el email puede
      // reintentarse aparte. No revertimos por un fallo de email.
      emailSent = false;
    }

    return { registration, emailSent };
  };
}
