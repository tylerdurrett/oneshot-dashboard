import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';
import baseConfig from './base.js';

/**
 * React ESLint flat config for TypeScript + React projects.
 * Extends the base config, adds eslint-plugin-react for JSX.
 *
 * Usage in consuming packages:
 *   import reactConfig from '@repo/eslint-config/react';
 *   export default [...reactConfig];
 */
export default [
  ...baseConfig,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
