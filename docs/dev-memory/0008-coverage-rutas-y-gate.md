# 0008 — Coverage de rutas API + gate extendido a adapters/app

**PR:** feat/activate-payment · **Fecha:** 2026-06-19

## Qué cambió

El gate de cobertura cubría **solo `src/core`** (dominio portable). Las rutas API
quedaban en 0% en vitest: las ejercita el E2E (Playwright) pero el E2E no aporta
números de cobertura. Este PR las cubre con tests de integración y **sube el gate
100% a core + adapters + rutas API**.

- **Tests de integración de rutas** (estilo `webhook-route.test.ts`): mockean
  `@adapters/factory` + el use case y prueban SOLO la lógica de la ruta (parseo,
  status codes, brancheo):
  - `tests/integration/register-route.test.ts`
  - `tests/integration/payments-route.test.ts`
  - `tests/integration/registrations-id-route.test.ts`
  - `webhook-route.test.ts`: +2 casos para el branch de `dataId` (body sin
    `data` / con `data` sin `id`).
- **`vitest.config.ts`**: `include` ahora = `core` + `adapters` +
  `app/api/**/*.ts`. Excluidos: ports (interfaces puras), **UI `.tsx`** (vitest
  no la mide sin setup JSX; la cubre el E2E) y **`dev-checkout`** (tooling solo
  de dev, en prod da 404). Gate 100% pasa.
- **Más negativos del form** (`tests/e2e/register-negative.spec.ts`): buyerName
  vacío, documento vacío, mutualista vacía, contacto de emergencia incompleto,
  whitespace-only (trim). Solo casos que el schema zod **realmente** rechaza (no
  hay regex de teléfono ni largo máx, así que no se inventan).

## Por qué así (decisión de gate)

- **UI fuera del gate:** vitest no mide `.tsx` sin setup JSX y el E2E ya cubre
  comportamiento. Forzar 100% ahí = mucha fricción, poco valor.
- **adapters + rutas SÍ a 100%:** las integration tests ya los dejaban casi
  enteros; cerrarlos es barato y atrapa regresiones del glue HTTP/proveedores.
- **`dev-checkout` excluido:** es simulador de dev (404 en prod); su lógica la
  ejercita el E2E hermético sobre el adapter en memoria.

## Gotcha (vitest)

En los tests de ruta, un `beforeEach` que toca el mock (`mockReset`/`mockClear`)
seguido de un mock que **rechaza/lanza** dispara un falso "unhandled rejection"
que tumba el test. Solución: **sin `beforeEach`**, cada test fija su propio mock;
para "no se llamó al use case" se asserta el **mensaje de error específico** (que
solo produce la rama pre-use-case) en vez de `not.toHaveBeenCalled()`.

## Comando

`npm run test:cov` — gate 100% sobre core + adapters + rutas API.
