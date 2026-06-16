import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import noSecrets from 'eslint-plugin-no-secrets';
import boundaries from 'eslint-plugin-boundaries';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      // Tooling de Claude + git worktrees: cada worktree trae su propio build
      // (.next/coverage/generados) y dispara miles de falsos positivos en `eslint .`.
      '.claude/**',
      'node_modules/**',
      'coverage/**',
      'allure-report/**',
      'allure-results/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  // Presets de Next (core-web-vitals + typescript).
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // Code smells y patrones inseguros (deterministas).
  sonarjs.configs.recommended,
  security.configs.recommended,
  {
    plugins: { 'no-secrets': noSecrets },
    rules: {
      // Credenciales hardcodeadas: entropía alta en literales. Tolerancia 5.0
      // para cortar falsos positivos en literales de alta entropía no-secretos
      // (IDs, base64). El gate real de secretos es gitleaks + semgrep p/secrets;
      // esto es belt-and-suspenders, igual que detect-object-injection apagado.
      'no-secrets/no-secrets': ['error', { tolerance: 5.0 }],
      // Demasiado ruidoso (cualquier acceso por índice variable); lo cubre CodeQL/Semgrep.
      'security/detect-object-injection': 'off',
    },
  },

  // Reglas type-aware: requieren información de tipos del tsconfig.
  // Reusa el plugin @typescript-eslint ya registrado por el preset de Next.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // Permite handlers async en atributos JSX (onSubmit, etc.), patrón normal en React.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  // Enforcement de la regla de arquitectura (CLAUDE.md):
  // src/core es dominio puro y portable; no puede importar adapters ni framework.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core/**/*' },
        { type: 'adapters', pattern: 'src/adapters/**/*' },
        { type: 'app', pattern: 'src/app/**/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: ['core'], allow: ['core'] },
            { from: ['adapters'], allow: ['core', 'adapters'] },
            { from: ['app'], allow: ['core', 'adapters', 'app'] },
          ],
        },
      ],
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['core'],
              disallow: ['next', 'next/*', 'react', 'react-dom', '@supabase/*', 'resend'],
              message:
                'src/core es dominio puro: sin framework ni SDKs externos. Definí un port en src/core/ports y un adapter en src/adapters.',
            },
          ],
        },
      ],
    },
  },

  // Tests: aflojar reglas de smells que no aportan en specs.
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'no-secrets/no-secrets': 'off',
      // Secretos ficticios en specs (firmas HMAC de prueba); no son credenciales reales.
      'sonarjs/hardcoded-secret-signatures': 'off',
    },
  },
];

export default eslintConfig;
