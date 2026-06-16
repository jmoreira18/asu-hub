import type { Registration, RegistrationInput, RegistrationStatus } from '../domain/types';

/**
 * Puerto de persistencia. La fuente de verdad (Supabase) lo implementa.
 * El dominio depende de esta interfaz, nunca del adapter concreto.
 */
export interface StoragePort {
  /** Persiste una nueva registración con el estado dado y devuelve la entidad. */
  save(input: RegistrationInput, status: RegistrationStatus): Promise<Registration>;
  /** Recupera una registración por id, o null si no existe. */
  findById(id: string): Promise<Registration | null>;
  /** Actualiza el estado de una registración existente (Fase 2: pago). */
  updateStatus(id: string, status: RegistrationStatus): Promise<void>;
  /**
   * Transición de estado **atómica**: pasa de `expected` a `next` solo si el
   * estado actual es `expected`. Devuelve `true` si se aplicó, `false` si no
   * (otro proceso ya lo cambió). Base de la idempotencia del webhook de pago sin
   * condición de carrera: dos reentregas en paralelo, solo una gana.
   */
  compareAndSetStatus(
    id: string,
    expected: RegistrationStatus,
    next: RegistrationStatus,
  ): Promise<boolean>;
  /**
   * Persiste el monto bloqueado del pago (Fase 2). Lo escribe `startPayment` con
   * la cotización vigente al iniciar; `confirmPayment` compara contra él.
   */
  setPaymentQuote(id: string, amountCents: number, currency: string): Promise<void>;
}
