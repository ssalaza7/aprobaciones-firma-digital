import {
  ErrorRecursoNoEncontrado,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../exception/errores';
import { Aprobador, Firma, InstantaneaAprobador } from './Aprobador';
import { CalculadorHash } from './CalculadorHash';
import { Correo } from './Correo';
import { Monto } from './Monto';
import { RolAprobador } from './RolAprobador';

export type EstadoSolicitud = 'PENDIENTE' | 'COMPLETADA' | 'RECHAZADA';

export interface Solicitante {
  nombre: string;
  correo: string;
}

export interface Evidencia {
  clave: string;
  generadaEn: string;
}

export interface InstantaneaSolicitud {
  id: string;
  titulo: string;
  descripcion: string;
  montoCentavos: number;
  moneda: string;
  solicitante: Solicitante;
  estado: EstadoSolicitud;
  creadaEn: string;
  actualizadaEn: string;
  aprobadores: InstantaneaAprobador[];
  evidencia: Evidencia | null;
  version: number;
}

export interface DatosNuevoAprobador {
  id: string;
  nombre: string;
  correo: string;
  rol: unknown;
  token: string;
}

/**
 * Agregado raíz: una solicitud de compra con sus tres aprobadores.
 *
 * Todas las reglas del flujo viven aquí (tres roles distintos, una decisión por
 * aprobador, un rechazo cancela el flujo, tres firmas lo completan). Los casos
 * de uso solo orquestan; no deciden.
 */
export class Solicitud {
  static readonly APROBADORES_REQUERIDOS = 3;

  private constructor(
    readonly id: string,
    readonly titulo: string,
    readonly descripcion: string,
    readonly monto: Monto,
    readonly solicitante: { nombre: string; correo: Correo },
    readonly creadaEn: Date,
    private _estado: EstadoSolicitud,
    private _aprobadores: Aprobador[],
    private _evidencia: Evidencia | null,
    private _actualizadaEn: Date,
    readonly version: number,
  ) {}

  static crear(datos: {
    id: string;
    titulo: string;
    descripcion: string;
    monto: number | string;
    moneda?: string;
    solicitante: Solicitante;
    aprobadores: DatosNuevoAprobador[];
    creadaEn: Date;
  }): Solicitud {
    const titulo = (datos.titulo ?? '').trim();
    if (titulo.length < 5) {
      throw new ErrorValidacion('El título debe tener al menos 5 caracteres');
    }
    if (titulo.length > 140) {
      throw new ErrorValidacion('El título no puede superar 140 caracteres');
    }

    const descripcion = (datos.descripcion ?? '').trim();
    if (descripcion.length < 10) {
      throw new ErrorValidacion('La descripción debe tener al menos 10 caracteres');
    }
    if (descripcion.length > 2000) {
      throw new ErrorValidacion('La descripción no puede superar 2000 caracteres');
    }

    const nombreSolicitante = (datos.solicitante?.nombre ?? '').trim();
    if (nombreSolicitante.length < 3) {
      throw new ErrorValidacion('El nombre del solicitante debe tener al menos 3 caracteres');
    }

    if (!Array.isArray(datos.aprobadores) || datos.aprobadores.length !== Solicitud.APROBADORES_REQUERIDOS) {
      throw new ErrorValidacion(
        `Se requieren exactamente ${Solicitud.APROBADORES_REQUERIDOS} aprobadores`,
      );
    }

    const aprobadores = datos.aprobadores.map((a) => Aprobador.crear(a));

    const roles = new Set(aprobadores.map((a) => a.rol));
    if (roles.size !== aprobadores.length) {
      throw new ErrorValidacion('Los tres aprobadores deben tener roles distintos');
    }
    const correos = new Set(aprobadores.map((a) => a.correo.valor));
    if (correos.size !== aprobadores.length) {
      throw new ErrorValidacion('Los tres aprobadores deben tener correos distintos');
    }

    return new Solicitud(
      datos.id,
      titulo,
      descripcion,
      Monto.de(datos.monto, datos.moneda),
      {
        nombre: nombreSolicitante,
        correo: Correo.de(datos.solicitante?.correo, 'correo del solicitante'),
      },
      datos.creadaEn,
      'PENDIENTE',
      aprobadores,
      null,
      datos.creadaEn,
      1,
    );
  }

  static rehidratar(i: InstantaneaSolicitud): Solicitud {
    return new Solicitud(
      i.id,
      i.titulo,
      i.descripcion,
      Monto.desdeCentavos(i.montoCentavos, i.moneda),
      { nombre: i.solicitante.nombre, correo: Correo.de(i.solicitante.correo) },
      new Date(i.creadaEn),
      i.estado,
      i.aprobadores.map((a) => Aprobador.rehidratar(a)),
      i.evidencia,
      new Date(i.actualizadaEn),
      i.version,
    );
  }

  get estado(): EstadoSolicitud {
    return this._estado;
  }

  get aprobadores(): readonly Aprobador[] {
    return this._aprobadores;
  }

  get evidencia(): Evidencia | null {
    return this._evidencia;
  }

  get actualizadaEn(): Date {
    return this._actualizadaEn;
  }

  get rolesRequeridos(): RolAprobador[] {
    return this._aprobadores.map((a) => a.rol);
  }

  aprobadorPorToken(token: string): Aprobador {
    const aprobador = this._aprobadores.find((a) => a.token === token);
    if (!aprobador) {
      throw new ErrorRecursoNoEncontrado('El enlace de aprobación no es válido');
    }
    return aprobador;
  }

  /** El flujo sigue abierto: nadie rechazó y aún faltan firmas. */
  estaEnCurso(): boolean {
    return this._estado === 'PENDIENTE';
  }

  todasFirmadas(): boolean {
    return this._aprobadores.every((a) => a.estado === 'FIRMADO');
  }

  get firmasRegistradas(): number {
    return this._aprobadores.filter((a) => a.estado === 'FIRMADO').length;
  }

  private exigirEnCurso(): void {
    if (!this.estaEnCurso()) {
      throw new ErrorTransicionInvalida(
        `La solicitud ya está ${this._estado.toLowerCase()}; no admite más decisiones`,
      );
    }
  }

  /**
   * Semilla de la cadena de firmas: ancla el primer eslabón al contenido de la
   * solicitud. Si alguien edita el título o el monto en la base de datos, la
   * verificación de la cadena falla desde la primera firma.
   */
  semillaCadena(hash: CalculadorHash): string {
    return hash(
      [
        'SOLICITUD',
        this.id,
        this.titulo,
        this.descripcion,
        String(this.monto.centavos),
        this.monto.moneda,
        this.solicitante.correo.valor,
        this.creadaEn.toISOString(),
      ].join('|'),
    );
  }

  /** Firmas ya registradas, en el orden en que se encadenaron. */
  get firmasEnOrden(): Firma[] {
    return this._aprobadores
      .map((a) => a.firma)
      .filter((firma): firma is Firma => firma !== null)
      .sort((a, b) => a.secuencia - b.secuencia);
  }

  /**
   * Contenido canónico de un eslabón. Es el texto exacto sobre el que se
   * calcula el hash, tanto al firmar como al verificar.
   */
  private contenidoEslabon(aprobador: Aprobador, firmadoEn: string, secuencia: number, hashAnterior: string): string {
    return [
      'FIRMA',
      this.id,
      String(secuencia),
      aprobador.id,
      aprobador.rol,
      aprobador.nombre,
      aprobador.correo.valor,
      firmadoEn,
      hashAnterior,
    ].join('|');
  }

  /**
   * Registra la firma de un aprobador como nuevo eslabón de la cadena.
   * Cuando se completan las tres, la solicitud queda lista para la evidencia
   * (pasa a COMPLETADA cuando el PDF ya está adjunto).
   */
  registrarFirma(aprobador: Aprobador, ahora: Date, hash: CalculadorHash): void {
    this.exigirEnCurso();
    const previas = this.firmasEnOrden;
    const secuencia = previas.length + 1;
    const hashAnterior = previas.length > 0 ? previas[previas.length - 1].hash : this.semillaCadena(hash);
    const firmadoEn = ahora.toISOString();

    aprobador.firmar(ahora, {
      secuencia,
      hashAnterior,
      hash: hash(this.contenidoEslabon(aprobador, firmadoEn, secuencia, hashAnterior)),
    });
    this._actualizadaEn = ahora;
  }

  /**
   * Recalcula la cadena completa y la compara con lo almacenado.
   * Se usa al generar la evidencia: el PDF declara si la cadena es íntegra.
   */
  verificarCadenaFirmas(hash: CalculadorHash): { integra: boolean; eslabones: number } {
    let anterior = this.semillaCadena(hash);
    let esperada = 1;

    for (const firma of this.firmasEnOrden) {
      const aprobador = this._aprobadores.find((a) => a.firma?.hash === firma.hash);
      if (
        !aprobador ||
        firma.secuencia !== esperada ||
        firma.hashAnterior !== anterior ||
        firma.hash !==
          hash(this.contenidoEslabon(aprobador, firma.firmadoEn, firma.secuencia, firma.hashAnterior))
      ) {
        return { integra: false, eslabones: esperada - 1 };
      }
      anterior = firma.hash;
      esperada += 1;
    }

    return { integra: true, eslabones: esperada - 1 };
  }

  registrarRechazo(aprobador: Aprobador, ahora: Date, motivo?: string | null): void {
    this.exigirEnCurso();
    aprobador.rechazar(ahora, motivo);
    this._estado = 'RECHAZADA';
    this._actualizadaEn = ahora;
  }

  /** Adjunta el PDF de evidencia y cierra el flujo. */
  adjuntarEvidencia(clave: string, ahora: Date): void {
    if (!this.todasFirmadas()) {
      throw new ErrorTransicionInvalida(
        'No se puede generar la evidencia hasta que los tres aprobadores hayan firmado',
      );
    }
    this._evidencia = { clave, generadaEn: ahora.toISOString() };
    this._estado = 'COMPLETADA';
    this._actualizadaEn = ahora;
  }

  instantanea(): InstantaneaSolicitud {
    return {
      id: this.id,
      titulo: this.titulo,
      descripcion: this.descripcion,
      montoCentavos: this.monto.centavos,
      moneda: this.monto.moneda,
      solicitante: { nombre: this.solicitante.nombre, correo: this.solicitante.correo.valor },
      estado: this._estado,
      creadaEn: this.creadaEn.toISOString(),
      actualizadaEn: this._actualizadaEn.toISOString(),
      aprobadores: this._aprobadores.map((a) => a.instantanea()),
      evidencia: this._evidencia,
      version: this.version,
    };
  }
}
