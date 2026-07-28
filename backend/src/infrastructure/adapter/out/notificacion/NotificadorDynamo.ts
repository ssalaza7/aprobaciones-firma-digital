import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CorreoSimulado, NotificadorPort } from '../../../../application/port/out/NotificadorPort';
import { GSI_TIPO, claveCorreo } from '../persistencia/dynamo/esquema';

/**
 * Notificador simulado persistente.
 *
 * En Lambda la memoria del proceso no sobrevive entre invocaciones, así que el
 * buzón se guarda en la misma tabla con TTL de 24 horas: `/api/mock-mail`
 * sigue funcionando igual que en local.
 */
export class NotificadorDynamo implements NotificadorPort {
  private static readonly TTL_SEGUNDOS = 24 * 60 * 60;

  constructor(
    private readonly cliente: DynamoDBDocumentClient,
    private readonly tabla: string,
  ) {}

  async enviar(correo: CorreoSimulado): Promise<void> {
    console.info('[mock-mail] Correo simulado', {
      para: correo.para,
      asunto: correo.asunto,
      tipo: correo.contexto.tipo,
    });
    await this.cliente.send(
      new PutCommand({
        TableName: this.tabla,
        Item: {
          ...claveCorreo(correo.id),
          ...correo,
          GSI2PK: 'MAIL',
          GSI2SK: correo.enviadoEn,
          ttl: Math.floor(Date.now() / 1000) + NotificadorDynamo.TTL_SEGUNDOS,
        },
      }),
    );
  }

  async bandeja(filtro?: { solicitudId?: string; para?: string }): Promise<CorreoSimulado[]> {
    const respuesta = await this.cliente.send(
      new QueryCommand({
        TableName: this.tabla,
        IndexName: GSI_TIPO,
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': 'MAIL' },
        ScanIndexForward: false,
        Limit: 200,
      }),
    );
    const para = filtro?.para?.trim().toLowerCase();
    return (respuesta.Items ?? [])
      .map((item) => aCorreo(item))
      .filter(
        (correo) =>
          (!filtro?.solicitudId || correo.contexto.solicitudId === filtro.solicitudId) &&
          (!para || correo.para.toLowerCase() === para),
      );
  }
}

function aCorreo(item: Record<string, unknown>): CorreoSimulado {
  const { PK, SK, GSI2PK, GSI2SK, ttl, ...resto } = item;
  return resto as unknown as CorreoSimulado;
}
