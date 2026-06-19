# Probar contra Mercado Pago sandbox (round-trip real)

Dos formas de ir **a MP y volver**, ambas opt-in y fuera del CI hermético. Las
credenciales viven solo en `.env.local` / variables de shell — nunca commiteadas.

## Credenciales (panel de MP, app de prueba)

- `MP_ACCESS_TOKEN` — access token de **prueba** (sandbox). MP enruta a sandbox
  automáticamente; la `baseUrl` sigue siendo producción.
- `MP_WEBHOOK_SECRET` — secreto de firma del webhook (panel → Webhooks).
- `MP_TEST_PAYMENT_ID` — (opcional) id de un pago ya aprobado en sandbox, para
  el test de `verifyPayment`. Lo obtenés del E2E de abajo.

Necesitás además un **usuario comprador de prueba** y las **tarjetas de test**
de MP (la tarjeta + el titular definen el resultado): titular `APRO` = aprobado,
`OTHE` = rechazado. Ej. Mastercard de prueba: `5031 7557 3453 0604`, venc.
`11/30`, CVV `123`.

## A) Smoke test de API (sin navegador, sin túnel)

Va a la API real: crea una preferencia y (si das un payment id) lee un pago.

```bash
export MP_ACCESS_TOKEN=TEST-...
export MP_WEBHOOK_SECRET=...
export MP_TEST_PAYMENT_ID=...   # opcional
npm run test:mp
```

Sin `MP_ACCESS_TOKEN`: todo skip (así el CI queda verde).

## B) E2E de navegador (checkout real + webhook por túnel)

El round-trip completo. MP necesita una URL pública para notificar el webhook y
para el retorno → un túnel a `localhost:3000`.

```bash
# 1) Túnel público a la app local
ngrok http 3000
export TUNNEL_URL=https://xxxx.ngrok-free.app   # el https que da ngrok

# 2) Credenciales de sandbox
export MP_ACCESS_TOKEN=TEST-...
export MP_WEBHOOK_SECRET=...

# 3) Correr el E2E (levanta `next dev` con el adapter MP real apuntando al túnel)
npm run test:e2e:sandbox
```

El test: registra → "Pagar ahora" → checkout REAL de MP → paga con la tarjeta
APRO → toma el `payment_id` real del redirect → dispara el webhook firmado con
`MP_WEBHOOK_SECRET` → `confirmPayment` verifica el pago **contra la API real de
MP** → `confirmed→paid` → `/pago/retorno` muestra "¡Pago confirmado!".

Tarjeta de prueba usada: Mastercard `5031 7557 3453 0604`, venc. `11/30`, CVV
`123`, titular `APRO`, doc CI `12345672` (dígito verificador válido).

> **Por qué disparamos el webhook nosotros:** el push de MP en sandbox no es
> fiable (a veces no llega, tarda minutos, o MP frena la entrega tras fallos).
> El pago es real y se verifica contra MP; lo único "simulado" es el transporte
> del POST. Si querés ver el push real de MP, usá "Simular notificación" en el
> panel apuntando a `…/api/payments/webhook`.
>
> El DOM del checkout de MP cambia seguido: los selectores de la tarjeta en
> `tests/e2e-sandbox/payment-sandbox.spec.ts` son el punto frágil. Detalles que
> rompen fácil: iframes seguros (frameLocator + pressSequentially), CI con
> dígito verificador válido + blur, header `ngrok-skip-browser-warning` solo al
> túnel (no a mercadopago.com).

Tras un pago aprobado, copiá el payment id (del redirect o del panel de MP) a
`MP_TEST_PAYMENT_ID` para cerrar el test de `verifyPayment` en (A).
