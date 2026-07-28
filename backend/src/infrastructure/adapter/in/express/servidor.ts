import express, { Express, Request, Response } from 'express';
import { Aplicacion, construirAplicacion } from '../../../config/contenedor';
import { cabecerasCors } from '../http/cors';
import { MetodoHttp } from '../http/tipos';

/**
 * Adaptador de entrada alternativo: servidor HTTP local.
 *
 * Existe para poder levantar el backend sin credenciales de AWS. Comparte con
 * Lambda el mismo enrutador y los mismos controladores: es la demostración
 * práctica de que la lógica no depende del mecanismo de entrega.
 */
export function crearServidor(aplicacion: Aplicacion = construirAplicacion()): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use((peticion: Request, respuesta: Response, siguiente) => {
    const cors = cabecerasCors(peticion.headers.origin, aplicacion.configuracion.origenesPermitidos);
    Object.entries(cors).forEach(([clave, valor]) => respuesta.setHeader(clave, valor));
    if (peticion.method === 'OPTIONS') {
      respuesta.status(204).end();
      return;
    }
    siguiente();
  });

  app.use(async (peticion: Request, respuesta: Response) => {
    const resultado = await aplicacion.enrutador.resolver({
      metodo: peticion.method.toUpperCase() as MetodoHttp,
      ruta: peticion.path,
      query: peticion.query as Record<string, string | undefined>,
      cuerpo: peticion.body,
      encabezados: peticion.headers as Record<string, string | undefined>,
    });

    Object.entries(resultado.encabezados ?? {}).forEach(([clave, valor]) =>
      respuesta.setHeader(clave, valor),
    );

    if (resultado.binario) {
      respuesta
        .status(resultado.estado)
        .type(resultado.contentType ?? 'application/octet-stream')
        .send(resultado.binario);
      return;
    }

    respuesta.status(resultado.estado).json(resultado.cuerpo ?? null);
  });

  return app;
}
