# Flujo de pago (Fase 2 — diseño)

> **Estado:** NO implementado. La interfaz `PaymentProvider` ya existe en
> `src/core/ports/payment.ts` para que el dominio quede listo sin acoplarse a
> Mercado Pago. Este doc describe cómo se enchufará.

## Por qué Mercado Pago (y no una tiquetera)

Necesitamos la plata **antes** del evento (remeras, gastos fijos). Las
tiqueteras pagan después del evento. Mercado Pago acredita al momento de la
venta y cubre bien Uruguay + región.

- **Fuera de LATAM:** link de PayPal manual para los pocos casos.
- **Transferencia bancaria:** adapter de **confirmación manual** (sin webhook).

## Máquina de estados

```mermaid
stateDiagram-v2
    [*] --> draft: submit formulario
    draft --> confirmed: validación OK (Fase 1 termina acá)
    confirmed --> paid: webhook pago aprobado (Fase 2)
    confirmed --> cancelled: expira / cancelado
    paid --> cancelled: reembolso
```

Implementada en `src/core/domain/state-machine.ts`. Fase 1 usa `confirm`;
`pay`/`refund` quedan listos para Fase 2.

## Regla de oro del pago

La confirmación real la da el proveedor por **webhook**, verificada contra su
API. **Nunca** se confía en el redirect de "gracias" del navegador.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant W as Web
    participant PP as PaymentProvider (MP)
    participant H as Webhook handler
    U->>W: registra → createPayment()
    W->>PP: crea preferencia
    PP-->>W: checkoutUrl
    U->>PP: paga en checkout
    PP->>H: webhook "hubo pago"
    H->>PP: verifyPayment(id) ¿aprobado?
    PP-->>H: approved
    H->>H: transition(confirmed, "pay") → paid
    H->>H: email + sync emergencia
```

## Pasos para implementar Fase 2

```mermaid
graph LR
    A[1. Adapter MercadoPago<br/>implements PaymentProvider] --> B[2. Route webhook<br/>/api/payments/webhook]
    B --> C[3. Use case confirmPayment<br/>verifica + transition pay]
    C --> D[4. Enchufar en factory]
    D --> E[5. Tests unit + integration]
```

Bloqueantes externos (no técnicos): cuenta Mercado Pago, credenciales, y
**facturación DGI** con contador (ver README del plan).
