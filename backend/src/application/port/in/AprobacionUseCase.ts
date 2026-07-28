import { VistaDetalleAprobacion, VistaSolicitud } from '../../dto/vistas';

export interface ComandoSolicitarOtp {
  solicitudId: string;
  tokenAprobador: string;
}

export interface ResultadoSolicitarOtp {
  /** Datos mínimos para la pantalla del OTP: aún no se muestra la compra. */
  solicitudId: string;
  tituloSolicitud: string;
  aprobador: { nombre: string; correo: string; rol: string; etiquetaRol: string };
  enviadoA: string;
  expiraEn: string;
  segundosVigencia: number;
  /**
   * Solo se rellena cuando `EXPONER_OTP=true` (entornos de prueba), para poder
   * recorrer el flujo sin abrir el buzón simulado.
   */
  otpDemo: string | null;
}

export interface ComandoValidarOtp {
  solicitudId: string;
  tokenAprobador: string;
  codigo: string;
}

export type Decision = 'APROBAR' | 'RECHAZAR';

export interface ComandoRegistrarDecision {
  solicitudId: string;
  tokenAprobador: string;
  tokenSesion: string;
  decision: Decision;
  motivo?: string;
}

export interface ResultadoDecision {
  solicitud: VistaSolicitud;
  mensaje: string;
}

/**
 * Puerto de entrada del flujo del aprobador: pedir OTP, validarlo y decidir.
 */
export interface AprobacionUseCase {
  solicitarOtp(comando: ComandoSolicitarOtp): Promise<ResultadoSolicitarOtp>;
  validarOtp(comando: ComandoValidarOtp): Promise<VistaDetalleAprobacion>;
  registrarDecision(comando: ComandoRegistrarDecision): Promise<ResultadoDecision>;
}
