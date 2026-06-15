import type { RegistrationStatus } from './types';
import { InvalidTransitionError } from './errors';

/** Eventos que disparan transiciones de estado. */
export type RegistrationEvent = 'confirm' | 'pay' | 'cancel' | 'refund';

/**
 * Transiciones permitidas. Fase 1 usa `confirm`; `pay`/`refund` quedan
 * listos para Fase 2 (pago vía webhook).
 */
const TRANSITIONS: Record<RegistrationStatus, Partial<Record<RegistrationEvent, RegistrationStatus>>> =
  {
    draft: { confirm: 'confirmed' },
    confirmed: { pay: 'paid', cancel: 'cancelled' },
    paid: { refund: 'cancelled' },
    cancelled: {},
  };

/** Indica si una transición es válida desde el estado actual. */
export function canTransition(from: RegistrationStatus, event: RegistrationEvent): boolean {
  return TRANSITIONS[from][event] !== undefined;
}

/**
 * Aplica una transición y devuelve el nuevo estado.
 * Lanza {@link InvalidTransitionError} si no está permitida.
 */
export function transition(
  from: RegistrationStatus,
  event: RegistrationEvent,
): RegistrationStatus {
  const next = TRANSITIONS[from][event];
  if (next === undefined) {
    throw new InvalidTransitionError(from, event);
  }
  return next;
}
