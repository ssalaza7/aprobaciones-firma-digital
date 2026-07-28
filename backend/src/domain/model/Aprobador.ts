import { ErrorSesionInvalida, ErrorTransicionInvalida, ErrorValidacion } from '../exception/errores';
import { CodigoOtp, InstantaneaCodigoOtp, ResultadoVerificacionOtp } from './CodigoOtp';
import { Correo } from './Correo';
import { RolAprobador, rolDe } from './RolAprobador';

export type EstadoAprobacion = 'PENDIENTE' | 'FIRMADO' | 'RECHAZADO';

/**
 * Firma registrada al aprobar.
 *
 * Además del nombre y la fecha que pide el enunciado, lleva los datos que la
 * hacen *concatenada*: su posición en la cadena, el hash de la firma anterior
 * y su propio hash. Alterar una firma —o el contenido de la solicitud— rompe
 * la verificación de todas las siguientes.
 */
export interface Firma {
  secuencia: number;
  nombre: string;
  firmadoEn: string;
  /** "Imagen" de firma simulada que el PDF dibuja en cursiva. */
  trazo: string;
  hashAnterior: string;
  hash: string;
}

export interface InstantaneaSesion {
  token: string;
  expiraEn: string;
}

export interface InstantaneaAprobador {
  id: string;
  nombre: string;
  correo: string;
  rol: RolAprobador;
  token: string;
  estado: EstadoAprobacion;
  otp: InstantaneaCodigoOtp | null;
  sesion: InstantaneaSesion | null;
  firma: Firma | null;
  rechazadoEn: string | null;
  motivoRechazo: string | null;
}

/**
 * Entidad Aprobador. Vive dentro del agregado `Solicitud`: no se carga ni se
 * guarda por separado, lo que garantiza que las reglas de "las 3 firmas" se
 * evalúen siempre sobre una foto consistente.
 */
export class Aprobador {
  /** Ventana para decidir después de validar el OTP, sin volver a pedirlo. */
  static readonly VIGENCIA_SESION_MS = 15 * 60 * 1000;

  private constructor(
    readonly id: string,
    readonly nombre: string,
    readonly correo: Correo,
    readonly rol: RolAprobador,
    readonly token: string,
    private _estado: EstadoAprobacion,
    private _otp: CodigoOtp | null,
    private _sesion: { token: string; expiraEn: Date } | null,
    private _firma: Firma | null,
    private _rechazadoEn: Date | null,
    private _motivoRechazo: string | null,
  ) {}

  static crear(datos: {
    id: string;
    nombre: string;
    correo: string;
    rol: unknown;
    token: string;
  }): Aprobador {
    const nombre = (datos.nombre ?? '').trim();
    if (nombre.length < 3) {
      throw new ErrorValidacion('El nombre del aprobador debe tener al menos 3 caracteres');
    }
    if (nombre.length > 120) {
      throw new ErrorValidacion('El nombre del aprobador no puede superar 120 caracteres');
    }
    return new Aprobador(
      datos.id,
      nombre,
      Correo.de(datos.correo, 'correo del aprobador'),
      rolDe(datos.rol),
      datos.token,
      'PENDIENTE',
      null,
      null,
      null,
      null,
      null,
    );
  }

  static rehidratar(i: InstantaneaAprobador): Aprobador {
    return new Aprobador(
      i.id,
      i.nombre,
      Correo.de(i.correo),
      i.rol,
      i.token,
      i.estado,
      i.otp ? CodigoOtp.rehidratar(i.otp) : null,
      i.sesion ? { token: i.sesion.token, expiraEn: new Date(i.sesion.expiraEn) } : null,
      i.firma,
      i.rechazadoEn ? new Date(i.rechazadoEn) : null,
      i.motivoRechazo,
    );
  }

  get estado(): EstadoAprobacion {
    return this._estado;
  }

  get firma(): Firma | null {
    return this._firma;
  }

  get otp(): CodigoOtp | null {
    return this._otp;
  }

  get rechazadoEn(): Date | null {
    return this._rechazadoEn;
  }

  get motivoRechazo(): string | null {
    return this._motivoRechazo;
  }

  estaPendiente(): boolean {
    return this._estado === 'PENDIENTE';
  }

  /** Fecha en la que el aprobador tomó su decisión, sin importar cuál fue. */
  get decididoEn(): Date | null {
    if (this._firma) return new Date(this._firma.firmadoEn);
    return this._rechazadoEn;
  }

  private exigirPendiente(accion: string): void {
    if (!this.estaPendiente()) {
      throw new ErrorTransicionInvalida(
        `No se puede ${accion}: el aprobador ${this.nombre} ya registró su decisión (${this._estado})`,
      );
    }
  }

  /** Emite un OTP nuevo; reemplaza cualquiera anterior y reinicia intentos. */
  emitirOtp(codigo: string, ahora: Date): CodigoOtp {
    this.exigirPendiente('emitir un código');
    this._otp = CodigoOtp.emitir(codigo, ahora);
    return this._otp;
  }

  /**
   * Valida el OTP y, si es correcto, abre una sesión corta para que el
   * aprobador vea el detalle y decida sin volver a pedir el código.
   */
  verificarOtp(codigo: string, tokenSesion: string, ahora: Date): ResultadoVerificacionOtp {
    this.exigirPendiente('validar un código');
    if (!this._otp) {
      throw new ErrorSesionInvalida('No hay un código vigente. Solicite uno nuevo.');
    }
    const resultado = this._otp.verificar(codigo, ahora);
    this._otp = resultado.otp;
    if (resultado.valido) {
      this._sesion = {
        token: tokenSesion,
        expiraEn: new Date(ahora.getTime() + Aprobador.VIGENCIA_SESION_MS),
      };
    }
    return resultado;
  }

  /** Comprueba la sesión abierta tras el OTP; lanza si no es válida. */
  exigirSesionValida(tokenSesion: string, ahora: Date): void {
    if (
      !this._sesion ||
      this._sesion.token !== tokenSesion ||
      ahora.getTime() > this._sesion.expiraEn.getTime()
    ) {
      throw new ErrorSesionInvalida('La sesión expiró o no es válida. Valide el código de nuevo.');
    }
  }

  /**
   * Registra la firma. El eslabón de la cadena (secuencia, hash anterior y
   * hash propio) lo calcula el agregado `Solicitud`, que es quien conoce el
   * orden de las firmas.
   */
  firmar(ahora: Date, eslabon: { secuencia: number; hashAnterior: string; hash: string }): Firma {
    this.exigirPendiente('firmar');
    this._firma = {
      secuencia: eslabon.secuencia,
      nombre: this.nombre,
      firmadoEn: ahora.toISOString(),
      trazo: trazoDe(this.nombre),
      hashAnterior: eslabon.hashAnterior,
      hash: eslabon.hash,
    };
    this._estado = 'FIRMADO';
    this._sesion = null;
    this._otp = null;
    return this._firma;
  }

  rechazar(ahora: Date, motivo?: string | null): void {
    this.exigirPendiente('rechazar');
    const limpio = (motivo ?? '').trim();
    if (limpio.length > 500) {
      throw new ErrorValidacion('El motivo del rechazo no puede superar 500 caracteres');
    }
    this._estado = 'RECHAZADO';
    this._rechazadoEn = ahora;
    this._motivoRechazo = limpio.length > 0 ? limpio : null;
    this._sesion = null;
    this._otp = null;
  }

  instantanea(): InstantaneaAprobador {
    return {
      id: this.id,
      nombre: this.nombre,
      correo: this.correo.valor,
      rol: this.rol,
      token: this.token,
      estado: this._estado,
      otp: this._otp ? this._otp.instantanea() : null,
      sesion: this._sesion
        ? { token: this._sesion.token, expiraEn: this._sesion.expiraEn.toISOString() }
        : null,
      firma: this._firma,
      rechazadoEn: this._rechazadoEn ? this._rechazadoEn.toISOString() : null,
      motivoRechazo: this._motivoRechazo,
    };
  }
}

/**
 * "Imagen" de firma simulada: el nombre en un trazo estilizado que el PDF
 * dibuja en cursiva. Se guarda con la firma para que la evidencia sea
 * reproducible aunque después cambie el algoritmo.
 */
function trazoDe(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((parte, indice) => (indice === 0 ? parte : `${parte[0].toUpperCase()}.`))
    .join(' ');
}
