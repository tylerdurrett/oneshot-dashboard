import reactConfig from '@repo/eslint-config/react';

export default [
  ...reactConfig,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
