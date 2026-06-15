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
  /** La planilla de emergencia se sincronizó OK. Si false, requiere reintento. */
  emergencySynced: boolean;
  /** El registro siempre se guarda; el email es best-effort. */
  emailSent: boolean;
}

/**
 * Caso de uso de registro (Fase 1, sin pago).
 *
 * Orden por criticidad:
 *  1. Validar entrada (lanza ValidationError).
 *  2. Guardar como `confirmed` (fuente de verdad — crítico, puede lanzar).
 *  3. Sincronizar planilla de emergencia (best-effort tras persistir).
 *  4. Enviar email de confirmación (best-effort).
 *
 * Una vez persistido el registro NO se lanza por fallos de sync/email: el
 * registro es la fuente de verdad. Lanzar después de guardar haría que el
 * cliente reintente y cree un registro duplicado (`save` no es idempotente).
 * Los flags devueltos permiten reintentar sync/email por separado.
 */
export function registerAttendees(deps: RegisterAttendeesDeps) {
  return async (rawInput: unknown): Promise<RegisterAttendeesResult> => {
    const input = parseRegistrationInput(rawInput);

    const status = transition('draft', 'confirm');
    const registration = await deps.storage.save(input, status);

    let emergencySynced = false;
    try {
      await deps.emergency.sync(registration);
      emergencySynced = true;
    } catch {
      // El registro ya está persistido; no revertimos ni reintentamos en
      // línea para no duplicar. Se reintenta la sync aparte.
      emergencySynced = false;
    }

    let emailSent = false;
    try {
      await deps.email.sendConfirmation(registration);
      emailSent = true;
    } catch {
      // El registro ya está persistido y sincronizado; el email puede
      // reintentarse aparte. No revertimos por un fallo de email.
      emailSent = false;
    }

    return { registration, emergencySynced, emailSent };
  };
}
