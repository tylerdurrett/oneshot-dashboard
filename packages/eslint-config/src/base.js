import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Base ESLint flat config for TypeScript projects.
 * Extends @eslint/js recommended + typescript-eslint recommended.
 * Includes eslint-config-prettier to disable formatting rules.
 *
 * Usage in consuming packages:
 *   import baseConfig from '@repo/eslint-config/base';
 *   export default [...baseConfig];
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**'],
  },
);
