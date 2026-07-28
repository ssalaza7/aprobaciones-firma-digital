import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  CorreoSimulado,
  DetalleAprobacion,
  ErrorApi,
  NuevaSolicitud,
  RespuestaCreacion,
  RespuestaOtp,
  ResultadoDecision,
  Rol,
  Solicitud,
} from './tipos';

/**
 * La URL de la API se inyecta en tiempo de compilación (webpack DefinePlugin).
 * Así el mismo bundle se despliega apuntando a API Gateway sin recompilar la
 * lógica, solo cambiando la variable de entorno del build.
 */
declare const __API_URL__: string;

export const urlApi = (): string =>
  typeof __API_URL__ === 'string' && __API_URL__.length > 0 ? __API_URL__ : 'http://localhost:4000';

export const cliente: AxiosInstance = axios.create({
  baseURL: urlApi(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

/**
 * Traduce cualquier fallo de red o de la API a un mensaje presentable.
 * Los componentes nunca manipulan objetos de axios.
 */
export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly motivo?: string,
    readonly estado?: number,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }

  static desde(error: unknown): ErrorDeApi {
    const axiosError = error as AxiosError<ErrorApi>;
    if (axiosError?.isAxiosError) {
      const cuerpo = axiosError.response?.data;
      if (cuerpo?.mensaje) {
        return new ErrorDeApi(cuerpo.codigo, cuerpo.mensaje, cuerpo.motivo, axiosError.response?.status);
      }
      if (!axiosError.response) {
        return new ErrorDeApi(
          'SIN_CONEXION',
          'No fue posible conectar con el servidor. Verifique que la API esté disponible.',
        );
      }
      return new ErrorDeApi(
        'ERROR_HTTP',
        `El servidor respondió con un error (${axiosError.response.status})`,
        undefined,
        axiosError.response.status,
      );
    }
    return new ErrorDeApi('ERROR_DESCONOCIDO', (error as Error)?.message ?? 'Error inesperado');
  }
}

async function ejecutar<T>(operacion: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await operacion()).data;
  } catch (error) {
    throw ErrorDeApi.desde(error);
  }
}

export const api = {
  roles: () => ejecutar<Rol[]>(() => cliente.get('/api/roles')),

  crearSolicitud: (solicitud: NuevaSolicitud) =>
    ejecutar<RespuestaCreacion>(() => cliente.post('/api/solicitudes', solicitud)),

  listarSolicitudes: (correoSolicitante?: string) =>
    ejecutar<{ total: number; solicitudes: Solicitud[] }>(() =>
      cliente.get('/api/solicitudes', {
        params: correoSolicitante ? { solicitante: correoSolicitante } : undefined,
      }),
    ),

  obtenerSolicitud: (id: string) => ejecutar<Solicitud>(() => cliente.get(`/api/solicitudes/${id}`)),

  solicitarOtp: (solicitudId: string, tokenAprobador: string) =>
    ejecutar<RespuestaOtp>(() =>
      cliente.post('/api/aprobaciones/otp', {
        solicitud_id: solicitudId,
        approver_token: tokenAprobador,
      }),
    ),

  validarOtp: (solicitudId: string, tokenAprobador: string, otp: string) =>
    ejecutar<DetalleAprobacion>(() =>
      cliente.post('/api/aprobaciones/otp/validar', {
        solicitud_id: solicitudId,
        approver_token: tokenAprobador,
        otp,
      }),
    ),

  registrarDecision: (datos: {
    solicitudId: string;
    tokenAprobador: string;
    tokenSesion: string;
    decision: 'APROBAR' | 'RECHAZAR';
    motivo?: string;
  }) =>
    ejecutar<ResultadoDecision>(() =>
      cliente.post('/api/aprobaciones/decision', {
        solicitud_id: datos.solicitudId,
        approver_token: datos.tokenAprobador,
        session_token: datos.tokenSesion,
        decision: datos.decision,
        motivo: datos.motivo,
      }),
    ),

  bandeja: (solicitudId?: string) =>
    ejecutar<{ total: number; correos: CorreoSimulado[] }>(() =>
      cliente.get('/api/mock-mail', {
        params: solicitudId ? { solicitud_id: solicitudId } : undefined,
      }),
    ),

  /** URL absoluta de descarga del PDF, para usarla en un enlace directo. */
  urlEvidencia: (solicitudId: string) => `${urlApi()}/api/solicitudes/${solicitudId}/evidencia.pdf`,
};
