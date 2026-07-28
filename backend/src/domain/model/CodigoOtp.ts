import { ErrorOtpInvalido } from '../exception/errores';

export type ResultadoVerificacionOtp =
  | { valido: true; otp: CodigoOtp }
  | { valido: false; otp: CodigoOtp; error: ErrorOtpInvalido };

export interface InstantaneaCodigoOtp {
  codigo: string;
  emitidoEn: string;
  expiraEn: string;
  intentos: number;
}

/**
 * Objeto de valor: código de un solo uso enviado al aprobador.
 *
 * Es inmutable: cada intento fallido produce una instancia nueva con el
 * contador incrementado, de modo que el agregado decide qué persistir.
 *
 * Supuesto (documentado en el README): el código se guarda en claro porque es
 * una simulación de 3 minutos. En producción se guardaría el hash (p. ej.
 * SHA-256 con sal) y se compararía en tiempo constante.
 */
export class CodigoOtp {
  /** El enunciado fija la vigencia en 3 minutos. */
  static readonly VIGENCIA_MS = 3 * 60 * 1000;
  /** Freno básico a la fuerza bruta sobre un código de 6 dígitos. */
  static readonly MAX_INTENTOS = 5;

  private constructor(
    readonly codigo: string,
    readonly emitidoEn: Date,
    readonly expiraEn: Date,
    readonly intentos: number,
  ) {}

  static emitir(codigo: string, ahora: Date, vigenciaMs = CodigoOtp.VIGENCIA_MS): CodigoOtp {
    return new CodigoOtp(codigo, ahora, new Date(ahora.getTime() + vigenciaMs), 0);
  }

  static rehidratar(instantanea: InstantaneaCodigoOtp): CodigoOtp {
    return new CodigoOtp(
      instantanea.codigo,
      new Date(instantanea.emitidoEn),
      new Date(instantanea.expiraEn),
      instantanea.intentos,
    );
  }

  estaExpirado(ahora: Date): boolean {
    return ahora.getTime() > this.expiraEn.getTime();
  }

  segundosRestantes(ahora: Date): number {
    return Math.max(0, Math.round((this.expiraEn.getTime() - ahora.getTime()) / 1000));
  }

  /**
   * Verifica el código.
   *
   * Devuelve un resultado en lugar de lanzar: incluso cuando el intento falla
   * hay que persistir el contador incrementado, y eso lo decide el llamador.
   */
  verificar(codigoRecibido: string, ahora: Date): ResultadoVerificacionOtp {
    if (this.intentos >= CodigoOtp.MAX_INTENTOS) {
      return {
        valido: false,
        otp: this,
        error: new ErrorOtpInvalido(
          'Se superó el número de intentos permitidos. Solicite un código nuevo.',
          'BLOQUEADO',
        ),
      };
    }
    if (this.estaExpirado(ahora)) {
      return {
        valido: false,
        otp: this,
        error: new ErrorOtpInvalido('El código expiró. Solicite uno nuevo.', 'EXPIRADO'),
      };
    }
    const usado = new CodigoOtp(this.codigo, this.emitidoEn, this.expiraEn, this.intentos + 1);
    if ((codigoRecibido ?? '').trim() !== this.codigo) {
      return {
        valido: false,
        otp: usado,
        error: new ErrorOtpInvalido('El código ingresado no es correcto', 'INCORRECTO'),
      };
    }
    return { valido: true, otp: usado };
  }

  instantanea(): InstantaneaCodigoOtp {
    return {
      codigo: this.codigo,
      emitidoEn: this.emitidoEn.toISOString(),
      expiraEn: this.expiraEn.toISOString(),
      intentos: this.intentos,
    };
  }
}
