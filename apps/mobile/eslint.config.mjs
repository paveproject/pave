import nx from '@nx/eslint-plugin';
import expoConfig from 'eslint-config-expo/flat.js';
import reactCompiler from 'eslint-plugin-react-compiler';

export default [
  {
    plugins: { '@nx': nx },
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }],
        },
      ],
    },
  },
  ...expoConfig,
  ...(Array.isArray(reactCompiler.configs.recommended)
    ? reactCompiler.configs.recommended
    : [reactCompiler.configs.recommended]),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {},
  },
  {
    ignores: ['.expo', 'web-build', 'cache', 'dist'],
  },
];