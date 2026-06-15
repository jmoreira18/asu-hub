import { randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  CreatePaymentRequest,
  VerifiedPayment,
} from '@core/ports/payment';

/**
 * Proveedor de pago de desarrollo. Simula la aprobación inmediata sin tocar
 * Mercado Pago: para correr local y E2E sin credenciales.
 *
 * `createPayment` guarda el monto y la referencia; `verifyPayment` los devuelve
 * como `approved`, así el webhook simulado confirma el flujo completo. No valida
 * firma (no hay).
 */
export class MemoryPaymentProvider implements PaymentProvider {
  private readonly payments = new Map<string, VerifiedPayment>();

  constructor(private readonly logger: Pick<Console, 'info'> = console) {}

  async createPayment(
    req: CreatePaymentRequest,
  ): Promise<{ paymentId: string; checkoutUrl: string }> {
    const paymentId = randomUUID();
    this.payments.set(paymentId, {
      status: 'approved',
      registrationId: req.registrationId,
      amountCents: req.amountCents,
      currency: req.currency,
    });
    this.logger.info(
      `[pago dev] creado ${paymentId} para registro ${req.registrationId} (${req.amountCents} ${req.currency})`,
    );
    // En dev no hay checkout real: la URL apunta al webhook simulado.
    return { paymentId, checkoutUrl: `/api/payments/dev-checkout?paymentId=${paymentId}` };
  }

  async verifyPayment(paymentId: string): Promise<VerifiedPayment> {
    const found = this.payments.get(paymentId);
    if (!found) {
      return { status: 'rejected', registrationId: '', amountCents: 0, currency: '' };
    }
    return found;
  }

  parseWebhook(payload: unknown): { paymentId: string } | null {
    if (payload && typeof payload === 'object' && 'paymentId' in payload) {
      const id = (payload as { paymentId: unknown }).paymentId;
      if (typeof id === 'string' && id) return { paymentId: id };
    }
    return null;
  }

  verifyWebhook(): boolean {
    return true;
  }
}
