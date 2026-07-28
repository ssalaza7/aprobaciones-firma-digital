import {
  ErrorConcurrencia,
  ErrorDominio,
  ErrorOtpInvalido,
  ErrorRecursoNoEncontrado,
  ErrorSesionInvalida,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../../../../domain/exception/errores';
import { RespuestaHttp } from './tipos';

export interface CuerpoError {
  codigo: string;
  mensaje: string;
  motivo?: string;
}

/**
 * Único punto donde los errores de dominio se convierten en códigos HTTP.
 *
 * Mantenerlo aquí es lo que permite que el dominio no importe nada de la web.
 */
export function aRespuestaDeError(error: unknown): RespuestaHttp {
  if (error instanceof ErrorValidacion) {
    return cuerpo(400, error);
  }
  if (error instanceof ErrorOtpInvalido) {
    return cuerpo(401, error, error.motivo);
  }
  if (error instanceof ErrorSesionInvalida) {
    return cuerpo(401, error);
  }
  if (error instanceof ErrorRecursoNoEncontrado) {
    return cuerpo(404, error);
  }
  if (error instanceof ErrorTransicionInvalida) {
    return cuerpo(409, error);
  }
  if (error instanceof ErrorConcurrencia) {
    return cuerpo(409, error);
  }

  console.error('Error no controlado', error);
  return {
    estado: 500,
    cuerpo: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error inesperado procesando la solicitud',
    } satisfies CuerpoError,
  };
}

function cuerpo(estado: number, error: ErrorDominio, motivo?: string): RespuestaHttp {
  return {
    estado,
    cuerpo: { codigo: error.codigo, mensaje: error.message, ...(motivo ? { motivo } : {}) },
  };
}
