/** Errores del dominio. Permiten distinguir fallos de negocio de fallos técnicos. */

/** Falla de validación de los datos de entrada. */
export class ValidationError extends Error {
  constructor(
    message: string,
    /** Detalle por campo: ruta -> mensajes. */
    public readonly issues: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Transición de estado no permitida por la máquina de estados. */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly event: string,
  ) {
    super(`Transición inválida: no se puede aplicar "${event}" desde "${from}"`);
    this.name = 'InvalidTransitionError';
  }
}

/** No hay una tanda de precios vigente para la fecha dada (Fase 2). */
export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}
