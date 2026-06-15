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
}
