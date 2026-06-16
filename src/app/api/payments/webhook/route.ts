import { NextResponse } from 'next/server';
import { confirmPayment } from '@core/usecases/confirm-payment';
import { buildPaymentDeps, type PaymentDeps } from '@adapters/factory';

// Adapters construidos perezosamente (igual que /api/register): `next build`
// no debe evaluar buildPaymentDeps sin variables de entorno.
let deps: PaymentDeps | null = null;
let handle: ReturnType<typeof confirmPayment> | null = null;
function getDeps() {
  if (!deps) {
    deps = buildPaymentDeps();
    handle = confirmPayment(deps);
  }
  return { deps, confirm: handle! };
}

/**
 * Webhook de pago (Fase 2). Seguridad:
 *  1. Valida la firma del proveedor antes de procesar (→ 401 si falla).
 *  2. confirmPayment verifica el pago contra la API y el monto server-side.
 *  3. Idempotente: reentregas devuelven 200 sin re-confirmar.
 *
 * Nunca se loguea el payload ni secretos. Se responde 200 ante pagos no
 * aprobados/ya procesados para no gatillar reintentos infinitos del proveedor;
 * 500 solo ante fallo inesperado (para que el proveedor reintente).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { deps: d, confirm } = getDeps();

  const url = new URL(request.url);
  const dataId =
    url.searchParams.get('data.id') ??
    (body && typeof body === 'object' && 'data' in body
      ? String((body as { data?: { id?: unknown } }).data?.id ?? '')
      : '');

  const valid = d.payment.verifyWebhook({
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
  });
  if (!valid) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  try {
    const parsed = d.payment.parseWebhook(body);
    if (!parsed) {
      // Notificación sin id de pago (ej: ping): se acepta sin hacer nada.
      return NextResponse.json({ ignored: true }, { status: 200 });
    }
    const result = await confirm(parsed.paymentId);
    if (!result.confirmed) {
      console.error(`[webhook pago] no confirmado: ${result.reason}`);
    }
    return NextResponse.json({ confirmed: result.confirmed }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
