/**
 * Contratos de la API REST.
 *
 * Viven en el paquete compartido para que los dos microfrontends hablen del
 * mismo modelo: si el backend cambia, el error de tipos aparece en ambos.
 */

export type EstadoSolicitud = 'PENDIENTE' | 'COMPLETADA' | 'RECHAZADA';
export type EstadoAprobacion = 'PENDIENTE' | 'FIRMADO' | 'RECHAZADO';

export interface Rol {
  rol: string;
  etiqueta: string;
}

export interface Aprobador {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  etiquetaRol: string;
  estado: EstadoAprobacion;
  firmadoEn: string | null;
  trazoFirma: string | null;
  rechazadoEn: string | null;
  motivoRechazo: string | null;
  secuenciaFirma: number | null;
  hashFirma: string | null;
}

export interface Monto {
  valor: number;
  moneda: string;
  formateado: string;
}

export interface Solicitud {
  id: string;
  titulo: string;
  descripcion: string;
  monto: Monto;
  solicitante: { nombre: string; correo: string };
  estado: EstadoSolicitud;
  creadaEn: string;
  actualizadaEn: string;
  aprobadores: Aprobador[];
  firmasRegistradas: number;
  aprobadoresRequeridos: number;
  evidenciaDisponible: boolean;
  urlEvidencia: string | null;
}

export interface NuevaSolicitud {
  titulo: string;
  descripcion: string;
  monto: number;
  moneda?: string;
  solicitante: { nombre: string; correo: string };
  aprobadores: Array<{ nombre: string; correo: string; rol: string }>;
}

export interface RespuestaCreacion {
  solicitud: Solicitud;
  enlacesAprobacion: Array<{ rol: string; correo: string; enlace: string }>;
}

export interface RespuestaOtp {
  solicitudId: string;
  tituloSolicitud: string;
  aprobador: { nombre: string; correo: string; rol: string; etiquetaRol: string };
  enviadoA: string;
  expiraEn: string;
  segundosVigencia: number;
  otpDemo: string | null;
}

export interface DetalleAprobacion {
  solicitud: Omit<Solicitud, 'evidenciaDisponible' | 'urlEvidencia'>;
  aprobador: Aprobador;
  tokenSesion: string;
  sesionExpiraEn: string;
}

export interface ResultadoDecision {
  solicitud: Solicitud;
  mensaje: string;
}

export interface CorreoSimulado {
  id: string;
  para: string;
  asunto: string;
  cuerpo: string;
  enviadoEn: string;
  contexto: {
    solicitudId: string;
    tipo: 'INVITACION_APROBACION' | 'CODIGO_OTP' | 'RESULTADO_SOLICITUD';
    enlace?: string;
    otp?: string;
  };
}

/** Error de negocio devuelto por la API (mismo cuerpo en todos los 4xx). */
export interface ErrorApi {
  codigo: string;
  mensaje: string;
  motivo?: string;
}
