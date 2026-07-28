import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  AlmacenEvidenciasPort,
  DocumentoAlmacenado,
} from '../../../../application/port/out/AlmacenEvidenciasPort';

/**
 * Adaptador de almacenamiento sobre el sistema de archivos.
 *
 * Es el sustituto de S3 al correr en local: permite abrir el PDF generado con
 * cualquier visor y revisar la evidencia sin credenciales de AWS.
 */
export class AlmacenEvidenciasArchivos implements AlmacenEvidenciasPort {
  constructor(private readonly directorioBase: string) {}

  async guardar(clave: string, contenido: Buffer, _contentType: string): Promise<void> {
    const destino = this.rutaDe(clave);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, contenido);
  }

  async obtener(clave: string): Promise<DocumentoAlmacenado | null> {
    try {
      const contenido = await fs.readFile(this.rutaDe(clave));
      return { contenido, contentType: 'application/pdf' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** Evita que una clave con `..` escriba fuera del directorio base. */
  private rutaDe(clave: string): string {
    const destino = path.resolve(this.directorioBase, clave);
    const base = path.resolve(this.directorioBase);
    if (destino !== base && !destino.startsWith(base + path.sep)) {
      throw new Error(`Clave de evidencia inválida: ${clave}`);
    }
    return destino;
  }
}
