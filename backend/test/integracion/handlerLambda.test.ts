import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { comandoValido } from '../dobles/dobles';
import { rutaSinEtapa } from '../../src/infrastructure/adapter/in/lambda/handler';

/**
 * El handler de Lambda comparte enrutador y controladores con el servidor
 * local: aquí se comprueba lo único que es suyo, la traducción del evento de
 * API Gateway (payload v2) y de la respuesta, incluido el PDF en base64.
 */
describe('Handler de AWS Lambda', () => {
  let handler: typeof import('../../src/infrastructure/adapter/in/lambda/handler').handler;
  let directorio: string;

  beforeAll(async () => {
    directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'evidencias-lambda-'));
    process.env.PERSISTENCIA = 'memoria';
    process.env.ALMACEN = 'archivos';
    process.env.DIRECTORIO_EVIDENCIAS = directorio;
    process.env.URL_BASE_FRONTEND = 'https://app.pruebas.local';
    process.env.EXPONER_OTP = 'true';
    process.env.ORIGENES_PERMITIDOS = 'https://app.pruebas.local';
    handler = require('../../src/infrastructure/adapter/in/lambda/handler').handler;
  });

  afterAll(async () => {
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const evento = (
    metodo: string,
    ruta: string,
    opciones: {
      cuerpo?: unknown;
      query?: Record<string, string>;
      base64?: boolean;
      etapa?: string;
    } = {},
  ): APIGatewayProxyEventV2 => {
    const cuerpo = opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo);
    return {
      version: '2.0',
      rawPath: ruta,
      rawQueryString: '',
      headers: { origin: 'https://app.pruebas.local' },
      queryStringParameters: opciones.query,
      requestContext: { http: { method: metodo }, stage: opciones.etapa ?? '$default' },
      body: opciones.base64 && cuerpo ? Buffer.from(cuerpo).toString('base64') : cuerpo,
      isBase64Encoded: Boolean(opciones.base64),
    } as unknown as APIGatewayProxyEventV2;
  };

  it('responde el preflight sin tocar la aplicación', async () => {
    const respuesta = await handler(evento('OPTIONS', '/api/solicitudes'));
    expect(respuesta.statusCode).toBe(204);
    expect(respuesta.headers?.['Access-Control-Allow-Origin']).toBe('https://app.pruebas.local');
  });

  it('crea una solicitud y devuelve JSON con CORS', async () => {
    const respuesta = await handler(evento('POST', '/api/solicitudes', { cuerpo: comandoValido() }));

    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.headers?.['Content-Type']).toContain('application/json');
    expect(respuesta.headers?.Location).toContain('/api/solicitudes/');
    expect(JSON.parse(respuesta.body as string).solicitud.estado).toBe('PENDIENTE');
  });

  it('interpreta el cuerpo codificado en base64', async () => {
    const respuesta = await handler(
      evento('POST', '/api/solicitudes', { cuerpo: comandoValido(), base64: true }),
    );
    expect(respuesta.statusCode).toBe(201);
  });

  it('propaga los parámetros de consulta', async () => {
    await handler(evento('POST', '/api/solicitudes', { cuerpo: comandoValido() }));
    const respuesta = await handler(
      evento('GET', '/api/solicitudes', { query: { solicitante: 'nadie@empresa.com' } }),
    );
    expect(JSON.parse(respuesta.body as string).total).toBe(0);
  });

  it('devuelve el PDF en base64 al completar el flujo', async () => {
    const creada = JSON.parse(
      (await handler(evento('POST', '/api/solicitudes', { cuerpo: comandoValido() }))).body as string,
    );
    const id = creada.solicitud.id as string;

    for (const { enlace } of creada.enlacesAprobacion as Array<{ enlace: string }>) {
      const token = new URL(enlace).searchParams.get('approver_token');
      const otp = JSON.parse(
        (
          await handler(
            evento('POST', '/api/aprobaciones/otp', {
              cuerpo: { solicitud_id: id, approver_token: token },
            }),
          )
        ).body as string,
      );
      const detalle = JSON.parse(
        (
          await handler(
            evento('POST', '/api/aprobaciones/otp/validar', {
              cuerpo: { solicitud_id: id, approver_token: token, otp: otp.otpDemo },
            }),
          )
        ).body as string,
      );
      await handler(
        evento('POST', '/api/aprobaciones/decision', {
          cuerpo: {
            solicitud_id: id,
            approver_token: token,
            session_token: detalle.tokenSesion,
            decision: 'APROBAR',
          },
        }),
      );
    }

    const respuesta = await handler(evento('GET', `/api/solicitudes/${id}/evidencia.pdf`));

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.isBase64Encoded).toBe(true);
    expect(respuesta.headers?.['Content-Type']).toBe('application/pdf');
    expect(Buffer.from(respuesta.body as string, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('traduce los errores de dominio al código HTTP correspondiente', async () => {
    const respuesta = await handler(evento('POST', '/api/solicitudes', { cuerpo: { titulo: 'x' } }));
    expect(respuesta.statusCode).toBe(400);
    expect(JSON.parse(respuesta.body as string).codigo).toBe('VALIDACION');
  });

  it('devuelve 400 cuando el cuerpo no es JSON válido', async () => {
    const roto = evento('POST', '/api/solicitudes');
    roto.body = '{ esto no es json';
    expect((await handler(roto)).statusCode).toBe(400);
  });

  it('devuelve 404 en rutas desconocidas', async () => {
    expect((await handler(evento('GET', '/api/inexistente'))).statusCode).toBe(404);
  });

  describe('prefijo del stage en la ruta', () => {
    // Con un stage con nombre, API Gateway entrega rawPath como "/dev/api/salud".
    // Sin quitar ese prefijo, ninguna ruta coincide y todo responde 404.
    it('resuelve la ruta aunque venga con el stage delante', async () => {
      const respuesta = await handler(
        evento('GET', '/dev/api/salud', { etapa: 'dev' }),
      );
      expect(respuesta.statusCode).toBe(200);
      expect(JSON.parse(respuesta.body as string)).toEqual({ estado: 'OK' });
    });

    it('sigue funcionando con el stage $default, que no añade prefijo', async () => {
      expect((await handler(evento('GET', '/api/salud'))).statusCode).toBe(200);
    });

    it('no confunde una ruta que empieza igual que el stage', () => {
      expect(rutaSinEtapa('/dev/api/salud', 'dev')).toBe('/api/salud');
      expect(rutaSinEtapa('/developer/api', 'dev')).toBe('/developer/api');
      expect(rutaSinEtapa('/dev', 'dev')).toBe('/');
      expect(rutaSinEtapa('/api/salud', '$default')).toBe('/api/salud');
      expect(rutaSinEtapa('/api/salud', undefined)).toBe('/api/salud');
    });
  });
});
