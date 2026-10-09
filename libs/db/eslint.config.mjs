import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          // @better-auth/core isn't imported directly: it's a direct dependency only to give
          // TypeScript a single resolution path for the type better-auth re-exports (see
          // https://github.com/better-auth/better-auth/issues/9189).
          ignoredDependencies: ['@better-auth/core'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
