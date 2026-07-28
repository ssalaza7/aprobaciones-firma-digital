import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  AlmacenEvidenciasPort,
  DocumentoAlmacenado,
} from '../../../../application/port/out/AlmacenEvidenciasPort';

/** Adaptador de almacenamiento de evidencias sobre Amazon S3. */
export class AlmacenEvidenciasS3 implements AlmacenEvidenciasPort {
  constructor(
    private readonly cliente: S3Client,
    private readonly bucket: string,
  ) {}

  async guardar(clave: string, contenido: Buffer, contentType: string): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        Body: contenido,
        ContentType: contentType,
      }),
    );
  }

  async obtener(clave: string): Promise<DocumentoAlmacenado | null> {
    try {
      const respuesta = await this.cliente.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: clave }),
      );
      const cuerpo = respuesta.Body;
      if (!cuerpo) return null;
      const bytes = await cuerpo.transformToByteArray();
      return {
        contenido: Buffer.from(bytes),
        contentType: respuesta.ContentType ?? 'application/pdf',
      };
    } catch (error) {
      const nombre = (error as { name?: string })?.name;
      if (nombre === 'NoSuchKey' || nombre === 'NotFound') return null;
      throw error;
    }
  }
}
