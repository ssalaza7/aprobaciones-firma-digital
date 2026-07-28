import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { cabecerasCors } from '../http/cors';
import { MetodoHttp } from '../http/tipos';
import { Aplicacion, construirAplicacion } from '../../../config/contenedor';

/**
 * Adaptador de entrada para AWS Lambda tras API Gateway (HTTP API, payload v2).
 *
 * La aplicación se construye una sola vez fuera del handler: en Lambda el
 * módulo sobrevive entre invocaciones, así que los clientes de AWS y sus
 * conexiones se reutilizan y solo el arranque en frío paga el costo.
 */
let aplicacion: Aplicacion | null = null;

function obtenerAplicacion(): Aplicacion {
  if (!aplicacion) {
    aplicacion = construirAplicacion();
  }
  return aplicacion;
}

export const handler = async (
  evento: APIGatewayProxyEventV2,
  _contexto?: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { enrutador, configuracion } = obtenerAplicacion();

  const metodo = (evento.requestContext?.http?.method ?? 'GET').toUpperCase() as MetodoHttp;
  const ruta = evento.rawPath ?? '/';
  const cors = cabecerasCors(
    evento.headers?.origin ?? evento.headers?.Origin,
    configuracion.origenesPermitidos,
  );

  if (metodo === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const respuesta = await enrutador.resolver({
    metodo,
    ruta,
    query: (evento.queryStringParameters ?? {}) as Record<string, string | undefined>,
    cuerpo: interpretarCuerpo(evento),
    encabezados: (evento.headers ?? {}) as Record<string, string | undefined>,
  });

  const encabezados = { ...cors, ...(respuesta.encabezados ?? {}) };

  if (respuesta.binario) {
    return {
      statusCode: respuesta.estado,
      headers: { ...encabezados, 'Content-Type': respuesta.contentType ?? 'application/octet-stream' },
      body: respuesta.binario.toString('base64'),
      isBase64Encoded: true,
    };
  }

  return {
    statusCode: respuesta.estado,
    headers: { ...encabezados, 'Content-Type': 'application/json; charset=utf-8' },
    body: respuesta.cuerpo === undefined ? '' : JSON.stringify(respuesta.cuerpo),
  };
};

/** Cuerpo JSON; si no es JSON válido se entrega crudo y el controlador valida. */
function interpretarCuerpo(evento: APIGatewayProxyEventV2): unknown {
  if (!evento.body) return undefined;
  const texto = evento.isBase64Encoded
    ? Buffer.from(evento.body, 'base64').toString('utf8')
    : evento.body;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}
