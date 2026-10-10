// WatermelonDB's Model classes use legacy decorators (`@field`, `@date`,
// `@children`, ...) - `babel-preset-expo` doesn't enable that syntax on its
// own, hence this file (the app had none before). TypeScript has to be
// transpiled *before* the decorator/class-properties plugins run, and
// `babel-preset-expo`'s own `decorators: false` turns off its built-in
// (incompatible, non-legacy) decorator handling so ours is the only one.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { decorators: false }]],
    plugins: [
      ['@babel/plugin-transform-typescript', { isTSX: true, allExtensions: true }],
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
    ],
  };
};
