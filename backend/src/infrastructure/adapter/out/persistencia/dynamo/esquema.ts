import { InstantaneaSolicitud } from '../../../../../domain/model/Solicitud';

/**
 * Diseño de tabla única en DynamoDB.
 *
 *  | Elemento  | PK                | SK     | GSI1PK                 | GSI1SK    | GSI2PK      | GSI2SK    |
 *  |-----------|-------------------|--------|------------------------|-----------|-------------|-----------|
 *  | Solicitud | SOL#<id>          | META   | SOLICITANTE#<correo>   | creadaEn  | SOLICITUD   | creadaEn  |
 *  | Token     | TOK#<token>       | TOKEN  | —                      | —         | —           | —         |
 *  | Correo    | MAIL#<id>         | MAIL   | —                      | —         | MAIL        | enviadoEn |
 *
 * Los tres aprobadores viajan dentro del elemento de la solicitud: son parte
 * del agregado, así que se leen y escriben de forma atómica y la regla "tres
 * firmas" nunca ve un estado a medias. El elemento Token es solo un índice
 * inverso para resolver el enlace del correo sin escanear la tabla.
 */

export const SK_SOLICITUD = 'META';
export const SK_TOKEN = 'TOKEN';
export const SK_CORREO = 'MAIL';

export const GSI_SOLICITANTE = 'gsi1-solicitante';
export const GSI_TIPO = 'gsi2-tipo';

export const claveSolicitud = (id: string) => ({ PK: `SOL#${id}`, SK: SK_SOLICITUD });
export const claveToken = (token: string) => ({ PK: `TOK#${token}`, SK: SK_TOKEN });
export const claveCorreo = (id: string) => ({ PK: `MAIL#${id}`, SK: SK_CORREO });

export interface ItemSolicitud extends InstantaneaSolicitud {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
}

export function aItemSolicitud(instantanea: InstantaneaSolicitud): ItemSolicitud {
  return {
    ...instantanea,
    ...claveSolicitud(instantanea.id),
    GSI1PK: `SOLICITANTE#${instantanea.solicitante.correo}`,
    GSI1SK: instantanea.creadaEn,
    GSI2PK: 'SOLICITUD',
    GSI2SK: instantanea.creadaEn,
  };
}

export function aInstantanea(item: Record<string, unknown>): InstantaneaSolicitud {
  const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...resto } = item as unknown as ItemSolicitud;
  return resto as InstantaneaSolicitud;
}
