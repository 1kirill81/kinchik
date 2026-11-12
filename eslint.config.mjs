import nextConfig from 'eslint-config-next';

export default [
  ...nextConfig,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'public/**',
      '*.config.mjs',
      '*.config.ts',
      'scripts/**',
    ],
  },
  {
    rules: {
      '@next/next/no-img-element': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];
