# 0004 — Bump de dependencias (Dependabot, 14 alertas)

**PR:** chore/dependabot-bumps · **Fecha:** 2026-06-15

## Qué cambió

Subida de devDependencies para cerrar las 14 alertas abiertas de Dependabot.
Todas eran dev/transitivas (toolchain de test/lint), ninguna toca runtime de
producción (`next`/`react`/`zod` sin cambios).

| Paquete | De | A | Alertas |
|---|---|---|---|
| `vitest` | 2.1.9 | 4.1.9 | critical + medium |
| `@vitest/coverage-v8` | 2.1.9 | 4.1.9 | (sigue a vitest) |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.2 | (trae vite 8) |

Transitivas resueltas por el bump de vitest/plugin-react:

- `vite` 5.4.21 → 8.0.16 (high + medium)
- `esbuild` 0.21.5 → **eliminado** (vite 8 ya no lo usa en el bundle dev)
- `postcss` 8.4.31 → 8.5.15

`overrides` en `package.json` para transitivas sin dueño directo:

- `handlebars` `^4.7.9` — venía 4.7.8 vía
  `eslint-plugin-boundaries → @boundaries/elements` (5 alertas, 1 critical).
- `postcss` `^8.5.10` — `next` traía 8.4.31.

## Por qué

Higiene de seguridad de la cadena de dependencias. `npm audit` ahora reporta
`found 0 vulnerabilities`.

## Verificación

Tras `rm -rf node_modules package-lock.json && npm install`:

- `npm run typecheck` ✓
- `npm run test:cov` ✓ — 101 tests, 100% cobertura en `src/core`
- `npm run build` ✓
- `npm run test:e2e` ✓ — 12 tests (corrido contra `next dev`, adapters en
  memoria, igual que 0003)

## Gotchas

- El bump de `@playwright/test` requiere reinstalar el browser
  (`npx playwright install chromium`): el binario quedó en una versión nueva
  (chromium v1228).
- `vitest.config.ts` no necesitó cambios: la config (`defineConfig` de
  `vitest/config`, alias, coverage v8) es compatible 2.x → 4.x.
- El lint global (`eslint .`) falla por artefactos `.next` dentro de un worktree
  suelto en `.claude/` (no versionado). El código fuente (`src`, `tests`) lintea
  limpio. No relacionado con este bump.
