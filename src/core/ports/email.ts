import type { Registration } from '../domain/types';

/** Puerto de envío de email. Implementado por el adapter Resend. */
export interface EmailPort {
  /** Envía el email de confirmación de registro al comprador. */
  sendConfirmation(registration: Registration): Promise<void>;
}
