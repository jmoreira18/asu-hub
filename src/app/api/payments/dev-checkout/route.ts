import { NextResponse } from 'next/server';

/**
 * Simulador de checkout — SOLO desarrollo/E2E (lo apunta MemoryPaymentProvider).
 * Reemplaza la pantalla de pago de MP: al visitarlo (GET, como el redirect del
 * navegador al checkout) dispara el webhook de pago server-side con el
 * `paymentId` y luego redirige (302) al retorno con `external_reference`
 * (= registrationId), igual que `back_urls` de MP. Así ejercita el webhook real
 * sin UI ni clic extra. En producción nunca se llega acá: el checkoutUrl es MP.
 */
export async function GET(request: Request) {
  // En producción este simulador no existe: el checkout es MP. Cerramos la ruta
  // para no exponer un POST al webhook sin firma ni un redirect manipulable.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get('paymentId') ?? '';
  const registrationId = url.searchParams.get('registrationId') ?? '';

  // Dispara el webhook real (server-to-server), como haría MP al aprobarse. Si
  // falla, NO redirigimos con status=approved: surfaceamos el error para que el
  // E2E falle acá (causa real) en vez de en la aserción de "paid".
  const hook = await fetch(`${url.origin}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  });
  if (!hook.ok) {
    return new NextResponse(`dev-checkout: el webhook falló (${hook.status})`, { status: 502 });
  }

  const retorno = new URL('/pago/retorno', url.origin);
  retorno.searchParams.set('status', 'approved');
  retorno.searchParams.set('external_reference', registrationId);
  return NextResponse.redirect(retorno);
}
