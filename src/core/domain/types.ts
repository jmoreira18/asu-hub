/**
 * Tipos del dominio. Sin dependencias de framework — portable.
 */

export const REGISTRATION_STATUSES = ['draft', 'confirmed', 'paid', 'cancelled'] as const;

/** Estado de una registración a lo largo de su ciclo de vida. */
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

/** Nivel de experiencia declarado por el asistente. */
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

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
}

/** Datos que llegan del formulario antes de persistir. */
export interface RegistrationInput {
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  attendees: Attendee[];
}

/** Registración persistida, con identidad y estado. */
export interface Registration extends RegistrationInput {
  id: string;
  status: RegistrationStatus;
  createdAt: Date;
}
