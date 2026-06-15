import { z } from 'zod';
import { EXPERIENCE_LEVELS, MAX_ATTENDEES } from './types';
import { ValidationError } from './errors';

const nonEmpty = (campo: string) => z.string().trim().min(1, `${campo} es obligatorio`);

export const emergencyContactSchema = z.object({
  name: nonEmpty('Nombre del contacto de emergencia'),
  phone: nonEmpty('Teléfono del contacto de emergencia'),
  relation: nonEmpty('Relación con el contacto de emergencia'),
});

export const attendeeSchema = z.object({
  fullName: nonEmpty('Nombre completo'),
  country: nonEmpty('País de origen'),
  documentNumber: nonEmpty('Número de documento'),
  experience: z.enum(EXPERIENCE_LEVELS),
  emergencyContact: emergencyContactSchema,
  medicalInsurance: nonEmpty('Mutualista / seguro médico'),
  // El deslinde es obligatorio: literal(true) rechaza false y ausencia.
  waiverAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Debe aceptar el deslinde de responsabilidad' }),
  }),
});

export const registrationInputSchema = z.object({
  buyerName: nonEmpty('Nombre del comprador'),
  buyerEmail: z.string().trim().email('Email inválido'),
  // La cantidad se deriva de attendees.length; el tope evita payloads abusivos.
  attendees: z
    .array(attendeeSchema)
    .min(1, 'Debe haber al menos un asistente')
    .max(MAX_ATTENDEES, `No se permiten más de ${MAX_ATTENDEES} asistentes por registro`),
});

/**
 * Valida la entrada del formulario y devuelve datos tipados.
 * Lanza {@link ValidationError} con detalle por campo si algo falla.
 */
export function parseRegistrationInput(raw: unknown) {
  const result = registrationInputSchema.safeParse(raw);
  if (!result.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      const messages = issues[key] ?? [];
      messages.push(issue.message);
      issues[key] = messages;
    }
    throw new ValidationError('Datos de registración inválidos', issues);
  }
  return result.data;
}
