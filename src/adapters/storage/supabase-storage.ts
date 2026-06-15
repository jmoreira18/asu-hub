import type { StoragePort } from '@core/ports/storage';
import type { Registration, RegistrationInput, RegistrationStatus } from '@core/domain/types';

/** Inyectable para tests; por defecto el fetch global. */
export type FetchLike = typeof fetch;

export interface SupabaseStorageConfig {
  url: string;
  /** Service role key (servidor only — nunca exponer al cliente). */
  serviceKey: string;
  fetchImpl?: FetchLike;
  /** Tabla destino. Asistentes se guardan como JSONB para Fase 1. */
  table?: string;
}

interface Row {
  id: string;
  buyer_name: string;
  buyer_email: string;
  attendees: Registration['attendees'];
  status: RegistrationStatus;
  created_at: string;
  locked_amount_cents?: number | null;
  locked_currency?: string | null;
}

/**
 * Adapter de Supabase vía REST (PostgREST). Fuente de verdad.
 * Los asistentes se persisten como columna JSONB `attendees`.
 * El acceso a tablas se controla con Row Level Security en Supabase.
 */
export class SupabaseStorage implements StoragePort {
  private readonly fetchImpl: FetchLike;
  private readonly table: string;

  constructor(private readonly config: SupabaseStorageConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.table = config.table ?? 'registrations';
  }

  private get headers() {
    return {
      apikey: this.config.serviceKey,
      Authorization: `Bearer ${this.config.serviceKey}`,
      'Content-Type': 'application/json',
    };
  }

  private endpoint(query = ''): string {
    return `${this.config.url}/rest/v1/${this.table}${query}`;
  }

  private toEntity(row: Row): Registration {
    return {
      id: row.id,
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      attendees: row.attendees,
      status: row.status,
      createdAt: new Date(row.created_at),
      lockedAmountCents: row.locked_amount_cents ?? undefined,
      lockedCurrency: row.locked_currency ?? undefined,
    };
  }

  async save(input: RegistrationInput, status: RegistrationStatus): Promise<Registration> {
    const res = await this.fetchImpl(this.endpoint(), {
      method: 'POST',
      headers: { ...this.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        buyer_name: input.buyerName,
        buyer_email: input.buyerEmail,
        // Columna derivada: la fuente de verdad es attendees.
        quantity: input.attendees.length,
        attendees: input.attendees,
        status,
      }),
    });
    if (!res.ok) throw new Error(`Supabase save falló: ${res.status}`);
    const rows = (await res.json()) as Row[];
    const row = rows[0];
    if (!row) throw new Error('Supabase save no devolvió fila');
    return this.toEntity(row);
  }

  async findById(id: string): Promise<Registration | null> {
    const res = await this.fetchImpl(this.endpoint(`?id=eq.${encodeURIComponent(id)}&select=*`), {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Supabase findById falló: ${res.status}`);
    const rows = (await res.json()) as Row[];
    const row = rows[0];
    return row ? this.toEntity(row) : null;
  }

  async updateStatus(id: string, status: RegistrationStatus): Promise<void> {
    const res = await this.fetchImpl(this.endpoint(`?id=eq.${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`Supabase updateStatus falló: ${res.status}`);
  }

  async compareAndSetStatus(
    id: string,
    expected: RegistrationStatus,
    next: RegistrationStatus,
  ): Promise<boolean> {
    // Atómico en Postgres: UPDATE ... WHERE id=.. AND status=expected. Una
    // reentrega concurrente del webhook matchea 0 filas y se descarta.
    const res = await this.fetchImpl(
      this.endpoint(`?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(expected)}`),
      {
        method: 'PATCH',
        headers: { ...this.headers, Prefer: 'return=representation' },
        body: JSON.stringify({ status: next }),
      },
    );
    if (!res.ok) throw new Error(`Supabase compareAndSetStatus falló: ${res.status}`);
    const rows = (await res.json()) as Row[];
    return rows.length > 0;
  }

  async setPaymentQuote(id: string, amountCents: number, currency: string): Promise<void> {
    const res = await this.fetchImpl(this.endpoint(`?id=eq.${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ locked_amount_cents: amountCents, locked_currency: currency }),
    });
    if (!res.ok) throw new Error(`Supabase setPaymentQuote falló: ${res.status}`);
  }
}
