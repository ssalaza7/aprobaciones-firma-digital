const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { dependencies } = require('../../package.json');

const PUERTO = Number(process.env.PUERTO_HOST ?? 3000);
const URL_SOLICITANTE = process.env.URL_MF_SOLICITANTE ?? 'http://localhost:3001';
const URL_APROBADOR = process.env.URL_MF_APROBADOR ?? 'http://localhost:3002';

/**
 * Host (contenedor) de los microfrontends.
 *
 * Las URL de los remotos son variables de entorno del build: en local apuntan
 * a los dev-servers y en despliegue al bucket/CDN donde queden publicados, sin
 * tocar el código.
 */
module.exports = (_entorno, argumentos) => {
  const produccion = argumentos.mode === 'production';

  return {
    entry: './src/index.ts',
    devtool: produccion ? false : 'source-map',
    output: {
      // Ruta absoluta, no 'auto': el host es la SPA y sus rutas tienen
      // profundidad (/solicitudes/:id). Con 'auto' los bundles se pedirían
      // relativos a la ruta actual y el enlace directo del correo fallaría.
      publicPath: '/',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    devServer: {
      port: PUERTO,
      // El enlace del correo entra directo a /approve: sin esto, recarga = 404.
      historyApiFallback: true,
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            // El babel.config.js vive en la raíz del monorepo, no en el paquete.
            options: { rootMode: 'upward' },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new webpack.container.ModuleFederationPlugin({
        name: 'host',
        remotes: {
          solicitante: `solicitante@${URL_SOLICITANTE}/remoteEntry.js`,
          aprobador: `aprobador@${URL_APROBADOR}/remoteEntry.js`,
        },
        shared: {
          react: { singleton: true, requiredVersion: dependencies.react },
          'react-dom': { singleton: true, requiredVersion: dependencies['react-dom'] },
          'react-router-dom': { singleton: true, requiredVersion: dependencies['react-router-dom'] },
        },
      }),
      new HtmlWebpackPlugin({ template: './public/index.html' }),
      new webpack.DefinePlugin({
        __API_URL__: JSON.stringify(process.env.API_URL ?? 'http://localhost:4000'),
      }),
    ],
  };
};
