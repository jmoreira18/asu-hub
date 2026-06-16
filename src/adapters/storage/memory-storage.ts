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

  async compareAndSetStatus(
    id: string,
    expected: RegistrationStatus,
    next: RegistrationStatus,
  ): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Registración no encontrada: ${id}`);
    // JS es single-threaded: este read-check-write no se intercala. La fuente de
    // verdad (Supabase) lo hace atómico con un UPDATE ... WHERE status=expected.
    if (row.status !== expected) return false;
    this.rows.set(id, { ...row, status: next });
    return true;
  }

  async setPaymentQuote(id: string, amountCents: number, currency: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Registración no encontrada: ${id}`);
    this.rows.set(id, { ...row, lockedAmountCents: amountCents, lockedCurrency: currency });
  }
}
