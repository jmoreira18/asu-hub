import type { EmailPort } from '@core/ports/email';
import type { Registration } from '@core/domain/types';
import type { FetchLike } from '../storage/supabase-storage';

export interface ResendEmailConfig {
  apiKey: string;
  from: string;
  fetchImpl?: FetchLike;
}

/** Adapter de email vía API REST de Resend. */
export class ResendEmail implements EmailPort {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: ResendEmailConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendConfirmation(registration: Registration): Promise<void> {
    const nombres = registration.attendees.map((a) => a.fullName).join(', ');
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: registration.buyerEmail,
        subject: 'Confirmación de registro — Evento ASU',
        html:
          `<p>Hola ${registration.buyerName},</p>` +
          `<p>Tu registro quedó confirmado para ${registration.quantity} persona(s): ${nombres}.</p>` +
          `<p>Código: ${registration.id}</p>`,
      }),
    });
    if (!res.ok) throw new Error(`Resend falló: ${res.status}`);
  }
}
