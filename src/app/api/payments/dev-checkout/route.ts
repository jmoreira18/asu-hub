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

  // Origen controlado por el servidor para evitar SSRF por Host/header manipulable.
  const serverOrigin = process.env.APP_URL ?? 'http://localhost:3000';
  let base: URL;
  try {
    base = new URL(serverOrigin);
  } catch {
    return new NextResponse('dev-checkout: APP_URL inválida', { status: 500 });
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    return new NextResponse('dev-checkout: APP_URL debe ser http/https', { status: 500 });
  }

  // Dispara el webhook real (server-to-server), como haría MP al aprobarse. Si
  // falla, NO redirigimos con status=approved: surfaceamos el error para que el
  // E2E falle acá (causa real) en vez de en la aserción de "paid".
  const hook = await fetch(new URL('/api/payments/webhook', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  });
  if (!hook.ok) {
    return new NextResponse(`dev-checkout: el webhook falló (${hook.status})`, { status: 502 });
  }

  const retorno = new URL('/pago/retorno', base);
  retorno.searchParams.set('status', 'approved');
  retorno.searchParams.set('external_reference', registrationId);
  return NextResponse.redirect(retorno);
}
