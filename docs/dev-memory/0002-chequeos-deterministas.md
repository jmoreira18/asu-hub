# 0002 — Chequeos deterministas (code smells + seguridad)

**PR:** feat/chequeos-deterministas · **Fecha:** 2026-06-15

## Qué cambió

Capa de chequeos automáticos, **deterministas y gratis**, que corren en
**pre-commit local + CI** y son **bloqueantes**. Objetivo: en un proyecto de
vibecoding, que el tooling atrape bugs/smells/secretos sin depender del ojo
humano.

### Code smells / lint (ESLint flat, `eslint.config.mjs`)

- **`eslint-plugin-sonarjs`** — smells (complejidad, duplicados, deprecaciones).
- **`eslint-plugin-security`** — patrones inseguros (`detect-object-injection`
  apagado: ruidoso, lo cubre Semgrep/CodeQL).
- **`eslint-plugin-no-secrets`** — entropía alta = credencial hardcodeada.
- **Reglas type-aware** (`no-floating-promises`, `no-misused-promises`,
  `await-thenable`) sobre `src/**`, reusando el plugin `@typescript-eslint` que
  ya registra el preset de Next (evita el choque de "plugin redefinido").
- **`eslint-plugin-boundaries`** — convierte la regla de arquitectura de
  CLAUDE.md en un **gate**: `src/core` no puede importar `src/adapters` ni
  framework (`next`/`react`/SDKs). Probado: un `import 'next'` en core falla CI.

### Dead code / deps

- **`knip`** (`knip.json`) — archivos y dependencias muertas. Limitado a `files`
  + `dependencies` (los "unused exports" se apagan: el core es API pública
  portable, da falsos positivos). `src/core/ports/payment.ts` se ignora a
  propósito (port de Fase 2, aún sin adapter).

### Seguridad (CI)

- **CodeQL** (`.github/workflows/codeql.yml`) — SAST nativo, `security-extended`,
  PR + push + semanal. Gratis en repo público.
- **Semgrep OSS** (`.github/workflows/semgrep.yml`) — rulesets `p/default`,
  `typescript`, `react`, `nextjs`, `owasp-top-ten`, `secrets`. Modo OSS, sin
  cuenta ni upload.
- **gitleaks** — job en `pr.yml` + hook pre-commit (`gitleaks protect --staged`,
  opcional local). Config `.gitleaks.toml` con allowlist de `.env.example`.
- **Dependabot** (`.github/dependabot.yml`) — npm + github-actions, semanal,
  agrupado.
- **`npm audit --omit=dev --audit-level=high`** en CI — bloquea por vulns de
  **producción** high+. Las dev (esbuild/vite del toolchain de test) y las
  moderadas las trackea Dependabot sin bloquear.

### Hooks locales + consistencia

- **husky + lint-staged** — pre-commit: `lint-staged` (eslint --fix + prettier
  sobre staged) → gitleaks (si está instalado) → `typecheck` full.
- **`.editorconfig`**, **`.nvmrc` (22)** — alinean editor y Node con CI.
- **`format` / `format:check`** (Prettier) — `format:check` ahora es gate en CI.

## Por qué (decisiones)

- **Bloqueante, no reporte:** el pedido fue maximizar lo determinista. Lo que no
  bloquea, no se respeta en vibecoding.
- **`boundaries` > doc:** la regla "core puro" estaba solo escrita; ahora la
  máquina la hace cumplir.
- **Markdown fuera de Prettier (`.prettierignore`):** Prettier rompía globs como
  `` `src/core/**` `` dentro de backticks (los volvía bold y comía espacios).
  Los docs son a mano; el lint de prosa no aporta y corrompía contenido.
- **`audit` solo prod + high:** el toolchain de test (esbuild/vite) arrastra
  vulns dev de dev-server que no afectan el deploy; bloquear por ellas sería
  ruido. La moderada de `postcss` (vía `next`) la resuelve Dependabot.
- **`require-await` descartada:** los adapters implementan ports `async` sin
  `await` interno (contrato), la regla peleaba con el patrón.

## Acción manual pendiente (GitHub, una vez)

En **Settings → Code security**: activar **Dependabot alerts**, **Secret
scanning** y **Push protection** (gratis en repo público). El código ya está;
esto son toggles del repo.

## Fixes colaterales (para pasar los nuevos gates)

- `RegistrationForm`: `React.FormEvent` → `SyntheticEvent<HTMLFormElement>`
  (`FormEvent` quedó `@deprecated` en los tipos de React 19).
- `layout`: props marcadas `Readonly<...>`.
- `route.ts` y `schemas.ts`: se sacó el assignment anidado (`??=` dentro de
  expresión) a sentencias propias.
- Formato Prettier aplicado a TS/tests/config existentes (baseline).

Verificación: `lint`, `format:check`, `typecheck`, `knip`, `test:cov` (49 tests,
100% core) y `audit` OK. Gate de arquitectura y de secretos probados rompiendo a
propósito.
