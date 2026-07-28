export interface DocumentoAlmacenado {
  contenido: Buffer;
  contentType: string;
}

/**
 * Puerto de salida para el almacenamiento del PDF.
 * Implementaciones: S3 (despliegue) y sistema de archivos (local/pruebas).
 */
export interface AlmacenEvidenciasPort {
  guardar(clave: string, contenido: Buffer, contentType: string): Promise<void>;
  obtener(clave: string): Promise<DocumentoAlmacenado | null>;
}
