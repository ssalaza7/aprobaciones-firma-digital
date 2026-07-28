/**
 * Errores del dominio.
 *
 * Son excepciones puras: no conocen HTTP ni ningún framework. El adaptador de
 * entrada (web) es el único responsable de traducirlas a códigos de estado.
 */

export abstract class ErrorDominio extends Error {
  /** Código estable para que el cliente pueda reaccionar sin parsear el mensaje. */
  abstract readonly codigo: string;

  protected constructor(mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** Los datos de entrada violan una invariante del modelo. */
export class ErrorValidacion extends ErrorDominio {
  readonly codigo = 'VALIDACION';

  constructor(mensaje: string) {
    super(mensaje);
  }
}

/** Se pidió una transición de estado que el agregado no permite. */
export class ErrorTransicionInvalida extends ErrorDominio {
  readonly codigo = 'TRANSICION_INVALIDA';

  constructor(mensaje: string) {
    super(mensaje);
  }
}

/** No existe el recurso solicitado (solicitud, aprobador, evidencia). */
export class ErrorRecursoNoEncontrado extends ErrorDominio {
  readonly codigo = 'NO_ENCONTRADO';

  constructor(mensaje: string) {
    super(mensaje);
  }
}

/** El OTP entregado no habilita el acceso (incorrecto, expirado o bloqueado). */
export class ErrorOtpInvalido extends ErrorDominio {
  readonly codigo = 'OTP_INVALIDO';

  constructor(
    mensaje: string,
    readonly motivo: 'INCORRECTO' | 'EXPIRADO' | 'NO_SOLICITADO' | 'BLOQUEADO',
  ) {
    super(mensaje);
  }
}

/** La sesión abierta tras validar el OTP no es válida o ya expiró. */
export class ErrorSesionInvalida extends ErrorDominio {
  readonly codigo = 'SESION_INVALIDA';

  constructor(mensaje: string) {
    super(mensaje);
  }
}

/**
 * Otro proceso modificó la solicitud entre la lectura y la escritura.
 * Lo lanza el adaptador de persistencia; vive en el dominio porque el caso de
 * uso necesita poder reaccionar a él sin conocer DynamoDB.
 */
export class ErrorConcurrencia extends ErrorDominio {
  readonly codigo = 'CONFLICTO_CONCURRENCIA';

  constructor(mensaje: string) {
    super(mensaje);
  }
}
