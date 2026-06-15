import type { EmailPort } from '@core/ports/email';
import type { Registration } from '@core/domain/types';
import type { FetchLike } from '../storage/supabase-storage';

export interface ResendEmailConfig {
  apiKey: string;
  from: string;
  fetchImpl?: FetchLike;
}

/** Escapa texto provisto por el usuario antes de interpolarlo en HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Adapter de email vía API REST de Resend. */
export class ResendEmail implements EmailPort {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: ResendEmailConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendConfirmation(registration: Registration): Promise<void> {
    // Campos provistos por el usuario: escapar para evitar inyección de HTML.
    const nombres = registration.attendees.map((a) => escapeHtml(a.fullName)).join(', ');
    const buyerName = escapeHtml(registration.buyerName);
    const cantidad = registration.attendees.length;
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
          `<p>Hola ${buyerName},</p>` +
          `<p>Tu registro quedó confirmado para ${cantidad} persona(s): ${nombres}.</p>` +
          `<p>Código: ${escapeHtml(registration.id)}</p>`,
      }),
    });
    if (!res.ok) throw new Error(`Resend falló: ${res.status}`);
  }
}
