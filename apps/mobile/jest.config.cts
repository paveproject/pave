/// <reference types="jest" />
/// <reference types="node" />

// jest-expo's own `transformIgnorePatterns` already special-cases pnpm's
// nested `.pnpm/` store so ESM-shipped RN/Expo packages underneath it
// still get transformed by babel-jest - this repo uses Bun, whose
// equivalent nested store (`node_modules/.bun/<pkg>@<version>+<hash>/
// node_modules/<pkg>/...`) isn't in that list. Without this, every such
// nested package looks "ignored" to Jest, so e.g.
// `@react-native/jest-preset`'s own ESM `jest/setup.js` never gets
// transformed and crashes on load with "Must use import to load ES
// Module". Derived from the installed preset (not hand-copied) so this
// stays correct if jest-expo's own list changes on upgrade.
const jestExpoTransformIgnorePatterns = (
  require('jest-expo/jest-preset').transformIgnorePatterns as string[]
).map((pattern) => (pattern.includes('.pnpm') ? pattern.replace('.pnpm', '.pnpm|.bun') : pattern));

module.exports = {
  displayName: 'mobile',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  moduleNameMapper: {
    '\\.svg$': '@nx/expo/plugins/jest/svg-mock',
    // Metro and tsc resolve `@libs/*` through `tsconfig.base.json` paths;
    // Jest reads neither, so workspace imports need spelling out here.
    '^@libs/constants$': '<rootDir>/../../libs/constants/src/index.ts',
  },
  transformIgnorePatterns: jestExpoTransformIgnorePatterns,
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: __dirname + '/babel.config.js',
      },
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|obj)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  coverageDirectory: '../../coverage/apps/mobile',
  passWithNoTests: true,
};
