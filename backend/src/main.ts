import { crearServidor } from './infrastructure/adapter/in/express/servidor';
import { construirAplicacion } from './infrastructure/config/contenedor';

/** Punto de entrada para ejecución local (`npm run dev` / `npm start`). */
const aplicacion = construirAplicacion();
const servidor = crearServidor(aplicacion);

servidor.listen(aplicacion.configuracion.puerto, () => {
  const { persistencia, almacen, urlBaseFrontend, puerto } = aplicacion.configuracion;
  console.info(
    `API de aprobaciones escuchando en http://localhost:${puerto}\n` +
      `  persistencia: ${persistencia}\n` +
      `  almacén de evidencias: ${almacen}\n` +
      `  enlaces de aprobación apuntando a: ${urlBaseFrontend}`,
  );
});
