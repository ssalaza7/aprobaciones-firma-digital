const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { dependencies } = require('../../package.json');

const PUERTO = Number(process.env.PUERTO_SOLICITANTE ?? 3001);

/**
 * Microfrontend "solicitante" publicado como remoto de Module Federation.
 *
 * Expone componentes, no rutas: el host decide dónde montarlos y les pasa la
 * navegación por props. Así el remoto no depende del router del contenedor y
 * sigue siendo ejecutable por su cuenta (`npm run dev -w ...`).
 */
module.exports = (_entorno, argumentos) => {
  const produccion = argumentos.mode === 'production';

  return {
    entry: './src/index.ts',
    devtool: produccion ? false : 'source-map',
    output: {
      // 'auto' hace que los fragmentos se pidan al origen del remoto y no al del host.
      publicPath: 'auto',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    devServer: {
      port: PUERTO,
      historyApiFallback: true,
      // El host se sirve desde otro puerto y necesita leer remoteEntry.js.
      headers: { 'Access-Control-Allow-Origin': '*' },
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
        name: 'solicitante',
        filename: 'remoteEntry.js',
        exposes: {
          './Panel': './src/componentes/PanelSolicitudes.tsx',
          './Formulario': './src/componentes/FormularioSolicitud.tsx',
          './Detalle': './src/componentes/DetalleSolicitud.tsx',
        },
        shared: {
          react: { singleton: true, requiredVersion: dependencies.react },
          'react-dom': { singleton: true, requiredVersion: dependencies['react-dom'] },
        },
      }),
      new HtmlWebpackPlugin({ template: './public/index.html' }),
      new webpack.DefinePlugin({
        __API_URL__: JSON.stringify(process.env.API_URL ?? 'http://localhost:4000'),
      }),
    ],
  };
};
