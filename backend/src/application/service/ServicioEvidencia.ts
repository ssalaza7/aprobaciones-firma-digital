import {
  ErrorConcurrencia,
  ErrorRecursoNoEncontrado,
  ErrorTransicionInvalida,
} from '../../domain/exception/errores';
import { Solicitud } from '../../domain/model/Solicitud';
import { EvidenciaUseCase } from '../port/in/EvidenciaUseCase';
import { AlmacenEvidenciasPort, DocumentoAlmacenado } from '../port/out/AlmacenEvidenciasPort';
import { GeneradorPdfPort } from '../port/out/GeneradorPdfPort';
import { RepositorioSolicitudesPort } from '../port/out/RepositorioSolicitudesPort';
import { RelojPort } from '../port/out/SistemaPorts';

export const CONTENT_TYPE_PDF = 'application/pdf';

/**
 * Colaborador interno de la capa de aplicación.
 *
 * `ServicioAprobacion` lo usa para cerrar el flujo tras la tercera firma, sin
 * depender de la clase concreta ni de cómo se almacena el PDF.
 */
export interface GeneradorEvidenciaInterno {
  /**
   * Garantiza que la solicitud tenga su PDF generado y almacenado.
   * Es idempotente: si ya existe, devuelve la solicitud sin regenerarlo.
   */
  asegurar(solicitud: Solicitud): Promise<Solicitud>;
}

/**
 * Caso de uso: generar (una vez) y entregar el PDF de evidencia.
 *
 * La generación se reintenta bajo demanda: si la tercera firma quedó guardada
 * pero el PDF falló, la primera descarga lo vuelve a construir en lugar de
 * dejar la solicitud atascada.
 */
export class ServicioEvidencia implements EvidenciaUseCase, GeneradorEvidenciaInterno {
  constructor(
    private readonly repositorio: RepositorioSolicitudesPort,
    private readonly generadorPdf: GeneradorPdfPort,
    private readonly almacen: AlmacenEvidenciasPort,
    private readonly reloj: RelojPort,
  ) {}

  static claveDe(solicitudId: string): string {
    return `evidencias/${solicitudId}/evidencia.pdf`;
  }

  async asegurar(solicitud: Solicitud): Promise<Solicitud> {
    if (solicitud.evidencia) {
      return solicitud;
    }
    if (!solicitud.todasFirmadas()) {
      throw new ErrorTransicionInvalida(
        'La evidencia solo se genera cuando los tres aprobadores han firmado',
      );
    }

    const clave = ServicioEvidencia.claveDe(solicitud.id);

    // El cierre se aplica antes de dibujar para que el PDF muestre el estado
    // final (COMPLETADA) y no el de un instante antes. Si algo falla después,
    // el cambio se descarta: solo se persiste al final.
    solicitud.adjuntarEvidencia(clave, this.reloj.ahora());

    const pdf = await this.generadorPdf.generarEvidencia(solicitud);
    await this.almacen.guardar(clave, pdf, CONTENT_TYPE_PDF);

    try {
      return await this.repositorio.actualizar(solicitud);
    } catch (error) {
      if (error instanceof ErrorConcurrencia) {
        // Otro proceso cerró el flujo primero: su resultado es igual de válido.
        const vigente = await this.repositorio.buscarPorId(solicitud.id);
        if (vigente?.evidencia) return vigente;
      }
      throw error;
    }
  }

  async descargar(
    solicitudId: string,
  ): Promise<DocumentoAlmacenado & { nombreArchivo: string }> {
    const solicitud = await this.repositorio.buscarPorId(solicitudId);
    if (!solicitud) {
      throw new ErrorRecursoNoEncontrado(`No existe la solicitud ${solicitudId}`);
    }
    if (!solicitud.evidencia && !solicitud.todasFirmadas()) {
      throw new ErrorTransicionInvalida(
        'La evidencia estará disponible cuando los tres aprobadores hayan firmado',
      );
    }

    const actualizada = await this.asegurar(solicitud);
    const clave = actualizada.evidencia?.clave ?? ServicioEvidencia.claveDe(solicitudId);

    let documento = await this.almacen.obtener(clave);
    if (!documento) {
      // El registro apunta a un objeto que ya no está: se reconstruye.
      const pdf = await this.generadorPdf.generarEvidencia(actualizada);
      await this.almacen.guardar(clave, pdf, CONTENT_TYPE_PDF);
      documento = { contenido: pdf, contentType: CONTENT_TYPE_PDF };
    }

    return { ...documento, nombreArchivo: `evidencia-${solicitudId}.pdf` };
  }
}
