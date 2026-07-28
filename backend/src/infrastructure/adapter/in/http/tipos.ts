/**
 * Contrato HTTP mínimo e independiente del framework.
 *
 * Los controladores se escriben contra estos tipos, y tanto el handler de AWS
 * Lambda como el servidor Express local se limitan a traducir hacia/desde
 * ellos. Ese es el motivo por el que la misma lógica corre en ambos entornos
 * sin duplicar código.
 */

export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface PeticionHttp {
  metodo: MetodoHttp;
  ruta: string;
  parametrosRuta: Record<string, string>;
  query: Record<string, string | undefined>;
  cuerpo: unknown;
  encabezados: Record<string, string | undefined>;
}

export interface RespuestaHttp {
  estado: number;
  /** Cuerpo JSON. Excluyente con `binario`. */
  cuerpo?: unknown;
  /** Cuerpo binario (PDF). Excluyente con `cuerpo`. */
  binario?: Buffer;
  contentType?: string;
  encabezados?: Record<string, string>;
}

export type Controlador = (peticion: PeticionHttp) => Promise<RespuestaHttp>;

export const json = (estado: number, cuerpo: unknown): RespuestaHttp => ({ estado, cuerpo });
