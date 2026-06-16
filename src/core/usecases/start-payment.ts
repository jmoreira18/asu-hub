import { computePrice, type PricingConfig } from '../domain/pricing';
import { canTransition } from '../domain/state-machine';
import type { StoragePort } from '../ports/storage';
import type { PaymentProvider } from '../ports/payment';

export interface StartPaymentDeps {
  storage: StoragePort;
  payment: PaymentProvider;
  pricing: PricingConfig;
  /** Inyectable para tests; por defecto el reloj real. */
  clock?: () => Date;
}

export interface StartPaymentResult {
  paymentId: string;
  checkoutUrl: string;
  amountCents: number;
  currency: string;
}

/**
 * Inicia el pago de una registración ya `confirmed` (Fase 2).
 *
 * El monto se calcula server-side con {@link computePrice}; el cliente nunca lo
 * envía. Devuelve la URL de checkout del proveedor para redirigir al usuario.
 * La confirmación real NO ocurre acá: llega después por webhook
 * ({@link confirmPayment}).
 */
export function startPayment(deps: StartPaymentDeps) {
  const clock = deps.clock ?? (() => new Date());
  return async (registrationId: string): Promise<StartPaymentResult> => {
    const registration = await deps.storage.findById(registrationId);
    if (!registration) {
      throw new Error(`Registración no encontrada: ${registrationId}`);
    }
    if (!canTransition(registration.status, 'pay')) {
      throw new Error(`No se puede iniciar el pago desde el estado "${registration.status}"`);
    }

    const quote = computePrice(registration, deps.pricing, clock());
    const { paymentId, checkoutUrl } = await deps.payment.createPayment({
      registrationId: registration.id,
      description: `Registro highline ASU (${registration.attendees.length} asistente/s)`,
      amountCents: quote.amountCents,
      currency: quote.currency,
      payerEmail: registration.buyerEmail,
    });

    // Bloquea el monto cotizado: `confirmPayment` compara contra esto, no contra
    // un recálculo con el reloj del webhook. Si la tanda cambia entre iniciar y
    // pagar, el pago legítimo no se rechaza por falso mismatch.
    await deps.storage.setPaymentQuote(registration.id, quote.amountCents, quote.currency);

    return { paymentId, checkoutUrl, amountCents: quote.amountCents, currency: quote.currency };
  };
}
