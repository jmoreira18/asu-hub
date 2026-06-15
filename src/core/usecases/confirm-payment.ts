import { computePrice, type PricingConfig } from '../domain/pricing';
import { canTransition, transition } from '../domain/state-machine';
import type { Registration } from '../domain/types';
import type { StoragePort } from '../ports/storage';
import type { PaymentProvider } from '../ports/payment';
import type { EmergencyExportPort } from '../ports/emergency-export';
import type { EmailPort } from '../ports/email';

export interface ConfirmPaymentDeps {
  storage: StoragePort;
  payment: PaymentProvider;
  emergency: EmergencyExportPort;
  email: EmailPort;
  pricing: PricingConfig;
  /** Inyectable para tests; por defecto el reloj real. */
  clock?: () => Date;
}

/** Motivo por el que un pago no se confirmó (para logs/observabilidad). */
export type ConfirmRejectReason =
  | 'not-approved'
  | 'registration-not-found'
  | 'amount-mismatch'
  | 'invalid-state';

export type ConfirmPaymentResult =
  | {
      confirmed: true;
      /** true si la registración ya estaba `paid` (webhook reentregado). */
      alreadyProcessed: boolean;
      registration: Registration;
    }
  | { confirmed: false; reason: ConfirmRejectReason };

/**
 * Confirma un pago a partir de un webhook ya verificado en firma (Fase 2).
 *
 * Seguridad:
 *  - Llama `verifyPayment` contra el proveedor; el body del webhook no es fuente
 *    de verdad.
 *  - Recalcula el monto esperado con {@link computePrice} y lo compara con lo
 *    realmente pagado: si no coincide, NO confirma (anti-manipulación).
 *  - Idempotente: si la registración ya está `paid`, no-op exitoso.
 *
 * Tras pasar a `paid`, email y sync de emergencia son best-effort (mismo
 * criterio que el registro: no se revierte el pago por un fallo downstream).
 */
export function confirmPayment(deps: ConfirmPaymentDeps) {
  const clock = deps.clock ?? (() => new Date());
  return async (paymentId: string): Promise<ConfirmPaymentResult> => {
    const verified = await deps.payment.verifyPayment(paymentId);
    if (verified.status !== 'approved') {
      return { confirmed: false, reason: 'not-approved' };
    }

    const registration = await deps.storage.findById(verified.registrationId);
    if (!registration) {
      return { confirmed: false, reason: 'registration-not-found' };
    }

    const quote = computePrice(registration, deps.pricing, clock());
    if (quote.amountCents !== verified.amountCents || quote.currency !== verified.currency) {
      // El monto pagado no coincide con el esperado: posible manipulación o
      // cambio de tanda entre createPayment y el pago. No confirmamos.
      return { confirmed: false, reason: 'amount-mismatch' };
    }

    if (!canTransition(registration.status, 'pay')) {
      // Idempotencia: si ya está `paid`, el webhook se reentregó; éxito no-op.
      if (registration.status === 'paid') {
        return { confirmed: true, alreadyProcessed: true, registration };
      }
      // draft / cancelled: no se puede pagar desde ahí.
      return { confirmed: false, reason: 'invalid-state' };
    }

    const next = transition(registration.status, 'pay');
    await deps.storage.updateStatus(registration.id, next);
    const paid: Registration = { ...registration, status: next };

    // Best-effort: no se revierte el pago si falla email/sync.
    try {
      await deps.email.sendConfirmation(paid);
    } catch {
      // reintento aparte
    }
    try {
      await deps.emergency.sync(paid);
    } catch {
      // reintento aparte
    }

    return { confirmed: true, alreadyProcessed: false, registration: paid };
  };
}
