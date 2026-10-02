import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  // app/ is a leftover Next.js route — not part of this Vite build.
  globalIgnores(['dist', 'dev-dist', 'app']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Intentional "best-effort" catches (localStorage, analytics, etc.)
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Leading underscore = intentionally unused (matches existing code style)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],

      // `cond && fn()` / `a ? f() : g()` statements are used deliberately
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: true,
        allowTernary: true,
      }],

      // ~110 existing `any`s — tracked as warnings, tighten file by file
      '@typescript-eslint/no-explicit-any': 'warn',

      // Context files export both Provider and useX() hook — standard pattern.
      // Only affects HMR granularity in dev, never production behaviour.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
])
