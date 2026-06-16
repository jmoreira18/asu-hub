import { z } from 'zod';
import { EXPERIENCE_LEVELS, MAX_ATTENDEES, PRICE_CATEGORIES } from './types';
import { ValidationError } from './errors';
import type { PricingConfig } from './pricing';

const nonEmpty = (campo: string) => z.string().trim().min(1, `${campo} es obligatorio`);

/** Agrupa los issues de zod por ruta de campo: `ruta -> [mensajes]`. */
function issuesByPath(error: z.ZodError): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    const messages = issues[key] ?? [];
    messages.push(issue.message);
    issues[key] = messages;
  }
  return issues;
}

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
  // `category` (socio/no-socio) NO se acepta del cliente: define el precio, así
  // que dejarlo client-settable permitiría a un no-socio pagar como socio. Lo
  // asigna el servidor (form admin / lista de socios — decisión de producto
  // abierta). Hasta entonces `computePrice` trata cada caso como `no-socio`.
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
 * Schema de configuración de precios (Fase 2). Valida la `PricingConfig` que el
 * factory carga desde env/DB. Precios en centavos enteros no negativos; fechas
 * coercibles (acepta strings ISO de JSON).
 */
const tierPricesSchema = z.object(
  Object.fromEntries(
    PRICE_CATEGORIES.map((cat) => [cat, z.number().int().nonnegative()]),
  ) as Record<(typeof PRICE_CATEGORIES)[number], z.ZodNumber>,
);

export const pricingConfigSchema = z.object({
  currency: nonEmpty('Moneda'),
  tiers: z
    .array(
      z
        .object({
          id: nonEmpty('Id de tanda'),
          from: z.coerce.date(),
          to: z.coerce.date(),
          prices: tierPricesSchema,
        })
        .refine((t) => t.from.getTime() < t.to.getTime(), {
          message: 'El inicio de la tanda debe ser anterior al fin',
        }),
    )
    .min(1, 'Debe haber al menos una tanda de precios'),
});

/**
 * Valida y tipa una `PricingConfig` cruda (ej: JSON de una env var).
 * Lanza {@link ValidationError} con detalle por campo si algo falla.
 */
export function parsePricingConfig(raw: unknown): PricingConfig {
  const result = pricingConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('Configuración de precios inválida', issuesByPath(result.error));
  }
  return result.data;
}

/**
 * Valida la entrada del formulario y devuelve datos tipados.
 * Lanza {@link ValidationError} con detalle por campo si algo falla.
 */
export function parseRegistrationInput(raw: unknown) {
  const result = registrationInputSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('Datos de registración inválidos', issuesByPath(result.error));
  }
  return result.data;
}
