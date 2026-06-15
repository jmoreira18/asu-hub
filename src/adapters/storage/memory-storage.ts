import { randomUUID } from 'node:crypto';
import type { StoragePort } from '@core/ports/storage';
import type { Registration, RegistrationInput, RegistrationStatus } from '@core/domain/types';

/**
 * Storage en memoria. Para desarrollo local y E2E sin base de datos real.
 * No persiste entre reinicios.
 */
export class MemoryStorage implements StoragePort {
  private readonly rows = new Map<string, Registration>();

  async save(input: RegistrationInput, status: RegistrationStatus): Promise<Registration> {
    const registration: Registration = {
      ...input,
      id: randomUUID(),
      status,
      createdAt: new Date(),
    };
    this.rows.set(registration.id, registration);
    return registration;
  }

  async findById(id: string): Promise<Registration | null> {
    return this.rows.get(id) ?? null;
  }

  async updateStatus(id: string, status: RegistrationStatus): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Registración no encontrada: ${id}`);
    this.rows.set(id, { ...row, status });
  }
}
