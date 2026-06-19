# Testing

```mermaid
graph LR
    subgraph "Cada PR (rápido, sin Allure)"
        U[Unit<br/>domain + usecases<br/>100% cobertura]
        I[Integration<br/>adapters con fetch mockeado]
    end
    subgraph "Tag/Release (Allure → Pages)"
        E[Functional / E2E<br/>Playwright]
    end
```

## Qué se testea dónde

| Nivel | Qué | Dónde | Runner |
|---|---|---|---|
| Unit | dominio (zod, máquina de estados), use cases (ports mockeados) | `src/core/**/*.test.ts` | Vitest |
| Integration | adapters contra `fetch`/cliente mockeado | `tests/integration/**` | Vitest |
| E2E / funcional | flujo completo en el navegador | `tests/e2e/**` | Playwright + Allure |

## Cobertura

Gate de **100%** (statements/branches/functions/lines) sobre toda la lógica
testeable en unit/integration: **`src/core` + `src/adapters` + rutas API
(`src/app/api/**/*.ts`)**. Configurado en `vitest.config.ts`. Excluidos: los
puertos (interfaces puras), la **UI (`.tsx`)** —vitest no la mide sin setup JSX,
la cubre el E2E— y `dev-checkout` (tooling solo de dev, en prod da 404).

## Comandos

```bash
npm test            # unit + integration (una vez)
npm run test:watch  # modo watch
npm run test:cov    # con cobertura + gate 100% (core + adapters + rutas API)
npm run test:e2e    # Playwright (necesita navegadores instalados)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

## CI

- `.github/workflows/pr.yml` — en cada PR/push: lint + typecheck + `test:cov`.
  **Sin Allure** (rápido).
- `.github/workflows/release.yml` — en tag `v*`: E2E Playwright → reporte
  **Allure** → publica a **GitHub Pages**. Allure es **solo** para los tests
  funcionales/E2E, nunca para unit/integration.

## Notas

- Los adapters externos reciben un `fetch` inyectable → los tests de
  integración no usan red ni credenciales reales.
- En entornos donde Playwright no tiene navegador (ej: algunos WSL), el flujo
  igual se puede verificar levantando `npm run start` y haciendo `curl` a
  `POST /api/register`.
