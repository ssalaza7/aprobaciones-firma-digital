import {
  ErrorConcurrencia,
  ErrorOtpInvalido,
  ErrorRecursoNoEncontrado,
  ErrorSesionInvalida,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../../src/domain/exception/errores';
import { cabecerasCors } from '../../src/infrastructure/adapter/in/http/cors';
import { Enrutador } from '../../src/infrastructure/adapter/in/http/enrutador';
import { aRespuestaDeError } from '../../src/infrastructure/adapter/in/http/manejadorErrores';
import { json } from '../../src/infrastructure/adapter/in/http/tipos';

const peticion = (metodo: string, ruta: string) => ({
  metodo: metodo as 'GET',
  ruta,
  query: {},
  cuerpo: undefined,
  encabezados: {},
});

describe('Enrutador', () => {
  const enrutador = new Enrutador([
    { metodo: 'GET', patron: '/api/solicitudes', controlador: async () => json(200, { lista: true }) },
    {
      metodo: 'GET',
      patron: '/api/solicitudes/:id',
      controlador: async (p) => json(200, { id: p.parametrosRuta.id }),
    },
    {
      metodo: 'GET',
      patron: '/api/solicitudes/:id/evidencia.pdf',
      controlador: async (p) => json(200, { pdfDe: p.parametrosRuta.id }),
    },
    { metodo: 'POST', patron: '/api/solicitudes', controlador: async () => json(201, {}) },
    {
      metodo: 'GET',
      patron: '/api/explota',
      controlador: async () => {
        throw new ErrorValidacion('dato inválido');
      },
    },
  ]);

  it('resuelve una ruta estática', async () => {
    await expect(enrutador.resolver(peticion('GET', '/api/solicitudes'))).resolves.toMatchObject({
      estado: 200,
      cuerpo: { lista: true },
    });
  });

  it('extrae los parámetros de ruta', async () => {
    const respuesta = await enrutador.resolver(peticion('GET', '/api/solicitudes/abc-123'));
    expect(respuesta.cuerpo).toEqual({ id: 'abc-123' });
  });

  it('decodifica los parámetros con caracteres especiales', async () => {
    const respuesta = await enrutador.resolver(peticion('GET', '/api/solicitudes/a%20b'));
    expect(respuesta.cuerpo).toEqual({ id: 'a b' });
  });

  it('distingue el segmento literal evidencia.pdf del :id', async () => {
    const respuesta = await enrutador.resolver(peticion('GET', '/api/solicitudes/x1/evidencia.pdf'));
    expect(respuesta.cuerpo).toEqual({ pdfDe: 'x1' });
  });

  it('tolera barras finales y dobles', async () => {
    await expect(enrutador.resolver(peticion('GET', '/api/solicitudes/'))).resolves.toMatchObject({
      estado: 200,
    });
  });

  it('devuelve 404 para una ruta desconocida', async () => {
    const respuesta = await enrutador.resolver(peticion('GET', '/api/nada'));
    expect(respuesta.estado).toBe(404);
  });

  it('devuelve 405 cuando la ruta existe pero el método no', async () => {
    const respuesta = await enrutador.resolver(peticion('DELETE', '/api/solicitudes'));
    expect(respuesta.estado).toBe(405);
  });

  it('convierte los errores del controlador en respuesta HTTP', async () => {
    const respuesta = await enrutador.resolver(peticion('GET', '/api/explota'));
    expect(respuesta).toMatchObject({ estado: 400, cuerpo: { codigo: 'VALIDACION' } });
  });
});

describe('Traducción de errores a HTTP', () => {
  it.each([
    [new ErrorValidacion('x'), 400, 'VALIDACION'],
    [new ErrorSesionInvalida('x'), 401, 'SESION_INVALIDA'],
    [new ErrorRecursoNoEncontrado('x'), 404, 'NO_ENCONTRADO'],
    [new ErrorTransicionInvalida('x'), 409, 'TRANSICION_INVALIDA'],
    [new ErrorConcurrencia('x'), 409, 'CONFLICTO_CONCURRENCIA'],
  ])('%s → %i', (error, estado, codigo) => {
    expect(aRespuestaDeError(error)).toMatchObject({ estado, cuerpo: { codigo } });
  });

  it('el OTP inválido devuelve 401 e informa el motivo', () => {
    const respuesta = aRespuestaDeError(new ErrorOtpInvalido('expirado', 'EXPIRADO'));
    expect(respuesta).toMatchObject({ estado: 401, cuerpo: { codigo: 'OTP_INVALIDO', motivo: 'EXPIRADO' } });
  });

  it('cualquier otro error se convierte en 500 sin filtrar detalles internos', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const respuesta = aRespuestaDeError(new Error('connection string secreta'));

    expect(respuesta.estado).toBe(500);
    expect(JSON.stringify(respuesta.cuerpo)).not.toContain('secreta');
  });
});

describe('CORS', () => {
  it('permite cualquier origen cuando está configurado con *', () => {
    expect(cabecerasCors('https://cualquiera.com', ['*'])['Access-Control-Allow-Origin']).toBe('*');
  });

  it('devuelve el origen solicitado si está en la lista', () => {
    const cabeceras = cabecerasCors('https://app.com', ['https://app.com', 'https://otro.com']);
    expect(cabeceras['Access-Control-Allow-Origin']).toBe('https://app.com');
  });

  it('cae al primer origen permitido si el solicitado no está', () => {
    const cabeceras = cabecerasCors('https://malicioso.com', ['https://app.com']);
    expect(cabeceras['Access-Control-Allow-Origin']).toBe('https://app.com');
  });
});
