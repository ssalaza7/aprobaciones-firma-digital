import { DocumentoAlmacenado } from '../out/AlmacenEvidenciasPort';

/** Puerto de entrada: descarga del PDF de evidencia ya generado. */
export interface EvidenciaUseCase {
  descargar(solicitudId: string): Promise<DocumentoAlmacenado & { nombreArchivo: string }>;
}
