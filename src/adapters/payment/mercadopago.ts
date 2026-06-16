import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  PaymentProvider,
  CreatePaymentRequest,
  VerifiedPayment,
  PaymentStatus,
  WebhookSignatureInput,
} from '@core/ports/payment';

/** Inyectable para tests; por defecto el fetch global. */
export type FetchLike = typeof fetch;

export interface MercadoPagoConfig {
  /** Access token (servidor only — NUNCA al cliente, nunca NEXT_PUBLIC_). */
  accessToken: string;
  /** Secreto para validar la firma del webhook (`x-signature`). */
  webhookSecret: string;
  /**
   * URL pública COMPLETA del webhook (`https://.../api/payments/webhook`). Si se
   * define, se manda como `notification_url` en la preferencia y MP notifica a
   * esa URL exacta — la vía robusta de confirmación, independiente del modo del
   * webhook configurado en el panel.
   */
  notificationUrl?: string;
  fetchImpl?: FetchLike;
  /** Base de la API. Default producción; en tests se inyecta. */
  baseUrl?: string;
}

interface MpPreferenceResponse {
  id: string;
  init_point: string;
}

interface MpPaymentResponse {
  status: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
}

/** Mapea el estado de MP a nuestro {@link PaymentStatus}. */
function toStatus(mp: string): PaymentStatus {
  if (mp === 'approved') return 'approved';
  if (mp === 'rejected' || mp === 'cancelled') return 'rejected';
  return 'pending';
}

/**
 * Adapter de Mercado Pago vía REST. La regla de oro: la confirmación real se
 * obtiene con {@link verifyPayment} contra la API, no del body del webhook; y
 * la firma del webhook se valida en {@link verifyWebhook} antes de procesar.
 */
export class MercadoPagoPayment implements PaymentProvider {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly config: MercadoPagoConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl ?? 'https://api.mercadopago.com';
  }

  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async createPayment(
    req: CreatePaymentRequest,
  ): Promise<{ paymentId: string; checkoutUrl: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: this.authHeaders,
      body: JSON.stringify({
        items: [
          {
            title: req.description,
            quantity: 1,
            unit_price: req.amountCents / 100,
            currency_id: req.currency,
          },
        ],
        // Vuelve en el webhook como external_reference: mapea pago -> registro.
        external_reference: req.registrationId,
        payer: { email: req.payerEmail },
        // MP notifica a esta URL al cambiar el estado del pago. Se omite si no
        // está configurada (cae al webhook del panel).
        ...(this.config.notificationUrl ? { notification_url: this.config.notificationUrl } : {}),
      }),
    });
    if (!res.ok) throw new Error(`MercadoPago createPayment falló: ${res.status}`);
    const pref = (await res.json()) as MpPreferenceResponse;
    return { paymentId: pref.id, checkoutUrl: pref.init_point };
  }

  async verifyPayment(paymentId: string): Promise<VerifiedPayment> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: this.authHeaders },
    );
    if (!res.ok) throw new Error(`MercadoPago verifyPayment falló: ${res.status}`);
    const pay = (await res.json()) as MpPaymentResponse;
    return {
      status: toStatus(pay.status),
      registrationId: pay.external_reference,
      amountCents: Math.round(pay.transaction_amount * 100),
      currency: pay.currency_id,
    };
  }

  parseWebhook(payload: unknown): { paymentId: string } | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = (payload as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'id' in data) {
      const id = (data as { id: unknown }).id;
      if (typeof id === 'string' && id) return { paymentId: id };
      if (typeof id === 'number') return { paymentId: String(id) };
    }
    return null;
  }

  /**
   * Valida `x-signature` de MP. Formato: `ts=<n>,v1=<hash>`. El manifest firmado
   * es `id:<dataId>;request-id:<requestId>;ts:<ts>;` (campos presentes), HMAC
   * SHA-256 con el secreto. Comparación en tiempo constante.
   */
  verifyWebhook({ signature, requestId, dataId }: WebhookSignatureInput): boolean {
    if (!signature) return false;
    const parts = new Map<string, string>();
    for (const segment of signature.split(',')) {
      const [k, v] = segment.split('=');
      if (k && v) parts.set(k.trim(), v.trim());
    }
    const ts = parts.get('ts');
    const v1 = parts.get('v1');
    if (!ts || !v1) return false;

    let manifest = `id:${dataId};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${ts};`;

    const expected = createHmac('sha256', this.config.webhookSecret).update(manifest).digest('hex');

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
