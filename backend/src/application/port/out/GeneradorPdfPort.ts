import { Solicitud } from '../../../domain/model/Solicitud';

/**
 * Puerto de salida para construir el PDF de evidencia.
 *
 * Recibe el agregado y devuelve los bytes: la librería de PDF (pdfkit) queda
 * confinada al adaptador de infraestructura.
 */
export interface GeneradorPdfPort {
  generarEvidencia(solicitud: Solicitud): Promise<Buffer>;
}
