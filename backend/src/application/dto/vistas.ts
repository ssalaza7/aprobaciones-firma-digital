import { EstadoAprobacion } from '../../domain/model/Aprobador';
import { etiquetaRol, RolAprobador } from '../../domain/model/RolAprobador';
import { EstadoSolicitud, Solicitud } from '../../domain/model/Solicitud';

/**
 * Vistas (DTO de salida) que la capa de aplicación entrega a los adaptadores.
 *
 * Existen para no filtrar el modelo de dominio por la API: el aprobador nunca
 * debe recibir el OTP ni los tokens de los demás aprobadores.
 */

export interface VistaAprobador {
  id: string;
  nombre: string;
  correo: string;
  rol: RolAprobador;
  etiquetaRol: string;
  estado: EstadoAprobacion;
  firmadoEn: string | null;
  trazoFirma: string | null;
  rechazadoEn: string | null;
  motivoRechazo: string | null;
  /** Posición de la firma en la cadena (1..3), null si aún no ha firmado. */
  secuenciaFirma: number | null;
  /** Hash del eslabón, abreviado para mostrarlo en pantalla. */
  hashFirma: string | null;
}

export interface VistaMonto {
  valor: number;
  moneda: string;
  formateado: string;
}

export interface VistaSolicitud {
  id: string;
  titulo: string;
  descripcion: string;
  monto: VistaMonto;
  solicitante: { nombre: string; correo: string };
  estado: EstadoSolicitud;
  creadaEn: string;
  actualizadaEn: string;
  aprobadores: VistaAprobador[];
  firmasRegistradas: number;
  aprobadoresRequeridos: number;
  evidenciaDisponible: boolean;
  urlEvidencia: string | null;
}

/** Lo que ve el aprobador una vez validado su OTP. */
export interface VistaDetalleAprobacion {
  solicitud: Omit<VistaSolicitud, 'urlEvidencia' | 'evidenciaDisponible'>;
  aprobador: VistaAprobador;
  /** Token de sesión corto; debe reenviarse al aprobar o rechazar. */
  tokenSesion: string;
  sesionExpiraEn: string;
}

export function aVistaAprobador(a: Solicitud['aprobadores'][number]): VistaAprobador {
  return {
    id: a.id,
    nombre: a.nombre,
    correo: a.correo.valor,
    rol: a.rol,
    etiquetaRol: etiquetaRol(a.rol),
    estado: a.estado,
    firmadoEn: a.firma ? a.firma.firmadoEn : null,
    trazoFirma: a.firma ? a.firma.trazo : null,
    rechazadoEn: a.rechazadoEn ? a.rechazadoEn.toISOString() : null,
    motivoRechazo: a.motivoRechazo,
    secuenciaFirma: a.firma ? a.firma.secuencia : null,
    hashFirma: a.firma ? a.firma.hash : null,
  };
}

export function aVistaSolicitud(solicitud: Solicitud): VistaSolicitud {
  return {
    id: solicitud.id,
    titulo: solicitud.titulo,
    descripcion: solicitud.descripcion,
    monto: {
      valor: solicitud.monto.valor,
      moneda: solicitud.monto.moneda,
      formateado: solicitud.monto.formatear(),
    },
    solicitante: {
      nombre: solicitud.solicitante.nombre,
      correo: solicitud.solicitante.correo.valor,
    },
    estado: solicitud.estado,
    creadaEn: solicitud.creadaEn.toISOString(),
    actualizadaEn: solicitud.actualizadaEn.toISOString(),
    aprobadores: solicitud.aprobadores.map(aVistaAprobador),
    firmasRegistradas: solicitud.firmasRegistradas,
    aprobadoresRequeridos: solicitud.aprobadores.length,
    evidenciaDisponible: solicitud.evidencia !== null,
    urlEvidencia: solicitud.evidencia ? `/api/solicitudes/${solicitud.id}/evidencia.pdf` : null,
  };
}
