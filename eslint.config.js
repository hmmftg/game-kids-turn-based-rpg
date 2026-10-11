import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'dev-dist',
      'examples/*/dist',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Runtime network access is forbidden in this offline-only app.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='XMLHttpRequest']",
          message: 'Runtime network access is forbidden in this offline-only app.',
        },
      ],
    },
  },
  {
    // Framework boundary (docs/framework-extraction.md): every application
    // import of framework code — including type-only imports — goes through
    // `src/framework/index.ts`. Internal framework paths are forbidden.
    files: ['src/**/*.{ts,tsx}', 'examples/**/*.{ts,tsx}'],
    ignores: ['src/framework/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: 'framework/(core|three|modules)/',
              message:
                'Import framework APIs via src/framework/index.ts (see docs/framework-extraction.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // Framework files never import application code — the boundary is
    // one-directional (app → framework index).
    files: ['src/framework/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '/(app|content|domain|services|ui|world|worldbuilder)/',
              message:
                'Framework code must not import application modules (see docs/framework-extraction.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,js}'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
