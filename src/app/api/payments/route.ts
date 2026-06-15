import { NextResponse } from 'next/server';
import { startPayment } from '@core/usecases/start-payment';
import { buildPaymentDeps } from '@adapters/factory';

// Adapters perezosos (ver /api/register).
let handle: ReturnType<typeof startPayment> | null = null;
function getHandle() {
  return (handle ??= startPayment(buildPaymentDeps()));
}

/**
 * Inicia el pago de una registración ya `confirmed` (Fase 2). Recibe solo el
 * `registrationId`; el monto se calcula server-side (el cliente nunca lo manda).
 * Devuelve la URL de checkout del proveedor para redirigir.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const registrationId =
    body && typeof body === 'object' && 'registrationId' in body
      ? (body as { registrationId: unknown }).registrationId
      : undefined;
  if (typeof registrationId !== 'string' || !registrationId) {
    return NextResponse.json({ error: 'registrationId requerido' }, { status: 400 });
  }

  try {
    const result = await getHandle()(registrationId);
    return NextResponse.json(
      { checkoutUrl: result.checkoutUrl, amountCents: result.amountCents, currency: result.currency },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 400 });
  }
}
