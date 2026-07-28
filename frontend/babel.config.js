/** Babel compartido: webpack (babel-loader) y jest (babel-jest) usan este mismo archivo. */
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current', browsers: ['>0.5%', 'not dead'] } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
