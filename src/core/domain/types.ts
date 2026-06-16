/**
 * Tipos del dominio. Sin dependencias de framework — portable.
 */

export const REGISTRATION_STATUSES = ['draft', 'confirmed', 'paid', 'cancelled'] as const;

/** Estado de una registración a lo largo de su ciclo de vida. */
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

/** Nivel de experiencia declarado por el asistente. */
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/**
 * Categorías de precio (Fase 2). Los socios de ASU pagan distinto (ej: solo
 * remera) que los no-socios. Cómo se determina si un asistente es socio es una
 * decisión de producto abierta (campo del formulario vs lista de socios); por
 * ahora el dominio solo modela la categoría y `computePrice` la usa.
 */
export const PRICE_CATEGORIES = ['socio', 'no-socio'] as const;

/** Categoría de precio de un asistente. */
export type PriceCategory = (typeof PRICE_CATEGORIES)[number];

/** Contacto de emergencia de un asistente. */
export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

/** Un asistente individual del evento. */
export interface Attendee {
  fullName: string;
  country: string;
  documentNumber: string;
  experience: ExperienceLevel;
  emergencyContact: EmergencyContact;
  /** Mutualista o seguro médico (texto libre). */
  medicalInsurance: string;
  /** Aceptación del deslinde de responsabilidad. Debe ser true. */
  waiverAccepted: boolean;
  /**
   * Categoría de precio (Fase 2). Opcional: el formulario de Fase 1 no la
   * recolecta todavía. `computePrice` la trata como `'no-socio'` si está ausente.
   */
  category?: PriceCategory;
}

/** Tope de asistentes por registro (evita payloads abusivos en el endpoint). */
export const MAX_ATTENDEES = 20;

/**
 * Datos que llegan del formulario antes de persistir.
 * La cantidad se deriva de `attendees.length`; no es un campo aparte.
 */
export interface RegistrationInput {
  buyerName: string;
  buyerEmail: string;
  attendees: Attendee[];
}

/** Registración persistida, con identidad y estado. */
export interface Registration extends RegistrationInput {
  id: string;
  status: RegistrationStatus;
  createdAt: Date;
  /**
   * Monto bloqueado al iniciar el pago (Fase 2), en centavos. Se persiste en
   * `startPayment` con el precio de la tanda vigente *en ese momento* y es el
   * monto contra el que `confirmPayment` compara lo realmente pagado. Evita
   * falsos rechazos si la tanda cambia entre iniciar y pagar (no se recalcula
   * con el reloj del webhook). Ausente hasta que el pago se inicia.
   */
  lockedAmountCents?: number;
  /** Moneda del monto bloqueado (ej: "UYU"). Ver {@link Registration.lockedAmountCents}. */
  lockedCurrency?: string;
}
