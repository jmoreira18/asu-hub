import type { Registration } from '../domain/types';

/**
 * Puerto de pago — Fase 2. Definido ahora para que el dominio quede listo
 * sin acoplarse a Mercado Pago. Adapters previstos: MercadoPago, PayPal,
 * Transferencia bancaria (confirmación manual).
 *
 * La regla de oro: la confirmación de pago real llega por webhook y se
 * verifica con {@link verifyPayment}; nunca se confía en el redirect.
 */
export interface PaymentProvider {
  /** Crea una intención/preferencia de pago y devuelve la URL de checkout. */
  createPayment(registration: Registration): Promise<{ paymentId: string; checkoutUrl: string }>;
  /**
   * Verifica contra el proveedor si un pago está realmente aprobado.
   * Se invoca al recibir el webhook, no en el redirect del usuario.
   */
  verifyPayment(paymentId: string): Promise<PaymentStatus>;
  /** Extrae el id de pago del cuerpo/headers del webhook entrante. */
  parseWebhook(payload: unknown): { paymentId: string } | null;
}

export type PaymentStatus = 'approved' | 'pending' | 'rejected';
