import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'packages/*/dist',
      '.release-compat',
      'coverage',
      'playwright-report',
      'test-results',
      'test-results-*',
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
      // Vite HMR tolerates co-exported helpers beside components; list the
      // intentional non-component exports so lint stays silent without
      // forcing artificial file splits across CameraRig/gltfModels/etc.
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useDismissOnEscape',
            'HELD_ITEM',
            'BATTLE_ACTION_ELEMENT',
            'cameraFocus',
            'publishCameraFocus',
            'setCameraFocusOverride',
            'clearCameraFocusOverride',
            'updateCameraFocusOverride',
            'getCameraFocusOverride',
            'pathStonePositions',
            'PATH_STONE_CLEARANCE',
            'GLTF_MODELS',
            'modelsForTier',
            'preloadHubGltfModels',
            'TAP_ONLY_MATERIAL',
          ],
        },
      ],
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
    // The app consumes the reusable package through its framework facade;
    // direct package imports are reserved for the independent examples.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/framework/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^waypoint-rpg-core(?:/.*)?$',
              message:
                'Import core package APIs via src/framework/index.ts (see docs/framework-api.md).',
            },
            {
              regex: '(?:^|/)packages/core/src/',
              message: 'Never import package implementation files directly.',
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
            {
              regex: '^waypoint-rpg-core/.+$',
              message: 'Framework modules may import only the public package root.',
            },
            {
              regex: '(?:^|/)packages/core/src/',
              message: 'Never import package implementation files directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // Entry shell: createRoot + lazy chunks, no component exports by design.
    files: ['src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Model set: co-exports the GLTF_MODELS registry + tier helpers with the
    // Suspense wrappers — splitting would break the single ModelSet contract.
    files: ['src/world/models/gltfModels.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,js}'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['examples/scene-demo/scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: [
      'examples/scene-demo/scripts/capture-previews.mjs',
      'examples/scene-demo/scripts/capture-phase5-previews.mjs',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['examples/garden-adventure/public/garden-sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['packages/*/scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
