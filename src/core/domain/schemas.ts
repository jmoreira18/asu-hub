import { z } from 'zod';
import { EXPERIENCE_LEVELS } from './types';
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

export const registrationInputSchema = z
  .object({
    buyerName: nonEmpty('Nombre del comprador'),
    buyerEmail: z.string().trim().email('Email inválido'),
    quantity: z.number().int('La cantidad debe ser entera').positive('La cantidad debe ser mayor a 0'),
    attendees: z.array(attendeeSchema).min(1, 'Debe haber al menos un asistente'),
  })
  // La cantidad declarada tiene que coincidir con los asistentes cargados.
  .refine((data) => data.attendees.length === data.quantity, {
    message: 'La cantidad de asistentes no coincide con la cantidad declarada',
    path: ['attendees'],
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
      (issues[key] ??= []).push(issue.message);
    }
    throw new ValidationError('Datos de registración inválidos', issues);
  }
  return result.data;
}
