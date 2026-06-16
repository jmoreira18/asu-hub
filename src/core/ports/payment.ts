/**
 * Puerto de pago — Fase 2. Definido para que el dominio quede listo sin
 * acoplarse a Mercado Pago. Adapters previstos: MercadoPago, PayPal,
 * Transferencia bancaria (confirmación manual).
 *
 * Reglas de oro (seguridad — hay plata de por medio):
 *  - El **monto lo calcula el dominio** (`computePrice`) y se pasa a
 *    {@link PaymentProvider.createPayment}. El navegador nunca manda el precio.
 *  - La confirmación real llega por **webhook** y se verifica contra el
 *    proveedor con {@link PaymentProvider.verifyPayment}; nunca se confía en el
 *    redirect del navegador.
 *  - La firma del webhook se valida con {@link PaymentProvider.verifyWebhook}
 *    antes de procesar nada (defensa en profundidad).
 */
export interface PaymentProvider {
  /** Crea una preferencia/intención de pago y devuelve la URL de checkout. */
  createPayment(req: CreatePaymentRequest): Promise<{ paymentId: string; checkoutUrl: string }>;
  /**
   * Verifica contra el proveedor el estado real de un pago. Se invoca al
   * recibir el webhook, no en el redirect. Devuelve también la referencia a la
   * registración y el monto efectivamente pagado, para chequearlos server-side.
   */
  verifyPayment(paymentId: string): Promise<VerifiedPayment>;
  /** Extrae el id de pago del cuerpo/query del webhook entrante, o null. */
  parseWebhook(payload: unknown): { paymentId: string } | null;
  /**
   * Valida la firma del webhook (HMAC del proveedor). `true` si es legítima.
   * Los adapters de desarrollo devuelven `true` (no hay firma que validar).
   */
  verifyWebhook(input: WebhookSignatureInput): boolean;
}

/** Datos para crear un pago. El `amountCents` lo calcula el dominio. */
export interface CreatePaymentRequest {
  /** Id de la registración; viaja como `external_reference` y vuelve en el webhook. */
  registrationId: string;
  description: string;
  amountCents: number;
  currency: string;
  payerEmail: string;
}

/** Resultado de verificar un pago contra el proveedor. */
export interface VerifiedPayment {
  status: PaymentStatus;
  /** `external_reference`: la registración a la que corresponde el pago. */
  registrationId: string;
  amountCents: number;
  currency: string;
}

/** Insumos para validar la firma del webhook (headers + id del recurso). */
export interface WebhookSignatureInput {
  signature: string | null;
  requestId: string | null;
  dataId: string;
}

export type PaymentStatus = 'approved' | 'pending' | 'rejected';
