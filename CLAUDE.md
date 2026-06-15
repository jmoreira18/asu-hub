# CLAUDE.md

Guía para trabajar en este proyecto. Pensada también para que sea **fácil de
portar** a otro repo: el dominio no depende del framework.

## Qué es

Web de **registro + (futuro) venta de entradas** para eventos de highline de
ASU (Asociación de Slackline Uruguaya). **Fase 1 = registro sin pago.** El pago
(Mercado Pago u otro) es Fase 2 y ya está previsto en la arquitectura.

## Dónde mirar primero

- **Contexto histórico por PR:** [`docs/dev-memory/`](./docs/dev-memory/) — un
  archivo por PR estilo changelog, con el *qué* y el *por qué*. **Leé el último
  antes de empezar.** Al abrir un PR, agregá un archivo nuevo `NNNN-titulo.md`.
- **Arquitectura:** [`docs/architecture.md`](./docs/architecture.md)
- **Modelo de datos / privacidad:** [`docs/data-model.md`](./docs/data-model.md)
- **Pago (Fase 2):** [`docs/payment-flow.md`](./docs/payment-flow.md)
- **Acceso de emergencia:** [`docs/emergency-access.md`](./docs/emergency-access.md)
- **Testing:** [`docs/testing.md`](./docs/testing.md)

Preferimos **leer docs + mermaids** antes que código. Mantené los docs al día.

## Reglas de arquitectura (no romper)

- **`src/core/**` no importa de `src/adapters` ni de `next`.** Es dominio puro
  y portable. Para usar un servicio externo desde el dominio, definí un **puerto**
  en `src/core/ports` y un **adapter** en `src/adapters`.
- Cambiar de proveedor (ej: Mercado Pago → otro) = nuevo adapter + enchufarlo en
  `src/adapters/factory.ts`. El dominio no se toca.
- **Pago (Fase 2):** la confirmación real llega por **webhook** verificado contra
  el proveedor, nunca por el redirect del navegador.
- **Privacidad:** datos sensibles (documento, contacto emergencia, mutualista).
  `SUPABASE_SERVICE_KEY` es solo server-side. Sheet de emergencia read-only.

## Estructura

```
src/core/domain     # entidades, schemas zod, máquina de estados (puro)
src/core/ports      # interfaces de servicios externos
src/core/usecases   # orquestación del negocio
src/adapters        # Supabase, Resend, Google Sheets, (Fase 2) pagos + factory
src/app             # Next: UI + API routes (capa fina)
docs                # documentación + mermaids + dev-memory
tests/integration   # tests de adapters
tests/e2e           # Playwright (funcionales)
```

## Comandos

```bash
npm run dev         # desarrollo (sin credenciales usa adapters en memoria)
npm test            # unit + integration
npm run test:cov    # + cobertura (gate 100% en src/core)
npm run test:e2e    # Playwright
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```

## Testing (resumen)

- **Unit + integration:** en cada PR. Gate **100% sobre `src/core`**. Sin Allure.
- **E2E / funcional (Playwright):** solo en tag/release → reporte **Allure** a
  GitHub Pages. Allure nunca para unit/integration.

## Config

Variables en `.env.example`. Sin credenciales, la app cae en adapters de
desarrollo (memoria + consola), así corre local y en E2E sin servicios reales.

## Portar a otro repo

Copiar `src/core` + `docs` + tests de core, y reconectar adapters/`factory.ts`.
El núcleo no tiene dependencias de framework.
