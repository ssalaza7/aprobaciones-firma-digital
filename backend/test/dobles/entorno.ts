import {
  AlmacenEvidenciasPort,
  DocumentoAlmacenado,
} from '../../src/application/port/out/AlmacenEvidenciasPort';
import { GeneradorPdfPort } from '../../src/application/port/out/GeneradorPdfPort';
import { Solicitud } from '../../src/domain/model/Solicitud';
import { ServicioAprobacion } from '../../src/application/service/ServicioAprobacion';
import { ServicioConsultarSolicitudes } from '../../src/application/service/ServicioConsultarSolicitudes';
import { ServicioCrearSolicitud } from '../../src/application/service/ServicioCrearSolicitud';
import { ServicioEvidencia } from '../../src/application/service/ServicioEvidencia';
import { NotificadorEnMemoria } from '../../src/infrastructure/adapter/out/notificacion/NotificadorEnMemoria';
import { RepositorioSolicitudesEnMemoria } from '../../src/infrastructure/adapter/out/persistencia/memoria/RepositorioSolicitudesEnMemoria';
import { GeneradorSecuencial, RelojFalso, hashDePrueba } from './dobles';

/** Almacén de evidencias en memoria: evita tocar disco en las pruebas unitarias. */
export class AlmacenEnMemoria implements AlmacenEvidenciasPort {
  readonly documentos = new Map<string, DocumentoAlmacenado>();

  async guardar(clave: string, contenido: Buffer, contentType: string): Promise<void> {
    this.documentos.set(clave, { contenido, contentType });
  }

  async obtener(clave: string): Promise<DocumentoAlmacenado | null> {
    return this.documentos.get(clave) ?? null;
  }
}

/** Generador de PDF falso: el PDF real se prueba en su propio adaptador. */
export class GeneradorPdfFalso implements GeneradorPdfPort {
  llamadas = 0;
  fallar = false;
  /** Estado que tenía la solicitud al dibujar el PDF (lo que verá el lector). */
  estadosRecibidos: string[] = [];

  async generarEvidencia(solicitud: Solicitud): Promise<Buffer> {
    this.llamadas += 1;
    this.estadosRecibidos.push(solicitud.estado);
    if (this.fallar) throw new Error('fallo simulado del generador de PDF');
    return Buffer.from('%PDF-1.7 evidencia simulada');
  }
}

/**
 * Arma el grafo de casos de uso con adaptadores en memoria.
 *
 * Es la contrapartida de pruebas del composition root: los servicios son los
 * de producción, solo cambian los adaptadores. Eso es exactamente lo que la
 * arquitectura hexagonal está para permitir.
 */
export function crearEntorno(opciones: { exponerOtp?: boolean } = {}) {
  const reloj = new RelojFalso();
  const identificadores = new GeneradorSecuencial();
  const repositorio = new RepositorioSolicitudesEnMemoria();
  const notificador = new NotificadorEnMemoria();
  const almacen = new AlmacenEnMemoria();
  const generadorPdf = new GeneradorPdfFalso();

  const evidencia = new ServicioEvidencia(repositorio, generadorPdf, almacen, reloj);
  const crear = new ServicioCrearSolicitud(
    repositorio,
    notificador,
    reloj,
    identificadores,
    'https://app.pruebas.local',
  );
  const consultar = new ServicioConsultarSolicitudes(repositorio);
  const aprobacion = new ServicioAprobacion(
    repositorio,
    notificador,
    reloj,
    identificadores,
    evidencia,
    hashDePrueba,
    { exponerOtp: opciones.exponerOtp ?? true },
  );

  return {
    reloj,
    identificadores,
    repositorio,
    notificador,
    almacen,
    generadorPdf,
    evidencia,
    crear,
    consultar,
    aprobacion,
  };
}

export type Entorno = ReturnType<typeof crearEntorno>;

/** Recorre el flujo del aprobador hasta dejar registrada su decisión. */
export async function decidir(
  entorno: Entorno,
  solicitudId: string,
  tokenAprobador: string,
  decision: 'APROBAR' | 'RECHAZAR',
  motivo?: string,
) {
  const otp = await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador });
  const detalle = await entorno.aprobacion.validarOtp({
    solicitudId,
    tokenAprobador,
    codigo: otp.otpDemo as string,
  });
  return entorno.aprobacion.registrarDecision({
    solicitudId,
    tokenAprobador,
    tokenSesion: detalle.tokenSesion,
    decision,
    motivo,
  });
}
