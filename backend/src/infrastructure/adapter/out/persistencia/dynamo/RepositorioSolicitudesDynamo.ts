import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { RepositorioSolicitudesPort } from '../../../../../application/port/out/RepositorioSolicitudesPort';
import { ErrorConcurrencia, ErrorValidacion } from '../../../../../domain/exception/errores';
import { Solicitud } from '../../../../../domain/model/Solicitud';
import {
  GSI_SOLICITANTE,
  GSI_TIPO,
  aInstantanea,
  aItemSolicitud,
  claveSolicitud,
  claveToken,
} from './esquema';

/**
 * Adaptador de persistencia sobre DynamoDB (tabla única, ver `esquema.ts`).
 *
 * El alta escribe la solicitud y los tres índices de token en una transacción:
 * o queda todo, o no queda nada. Las actualizaciones usan bloqueo optimista
 * con `ConditionExpression` sobre `version`, que es la forma natural de evitar
 * que dos firmas simultáneas se pisen sin bloqueos explícitos.
 */
export class RepositorioSolicitudesDynamo implements RepositorioSolicitudesPort {
  constructor(
    private readonly cliente: DynamoDBDocumentClient,
    private readonly tabla: string,
  ) {}

  async crear(solicitud: Solicitud): Promise<void> {
    const instantanea = solicitud.instantanea();
    try {
      await this.cliente.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tabla,
                Item: aItemSolicitud(instantanea),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            ...instantanea.aprobadores.map((aprobador) => ({
              Put: {
                TableName: this.tabla,
                Item: { ...claveToken(aprobador.token), solicitudId: instantanea.id },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            })),
          ],
        }),
      );
    } catch (error) {
      if (esConflicto(error)) {
        throw new ErrorValidacion(`Ya existe una solicitud con id ${instantanea.id}`);
      }
      throw error;
    }
  }

  async actualizar(solicitud: Solicitud): Promise<Solicitud> {
    const instantanea = solicitud.instantanea();
    const nueva = { ...instantanea, version: instantanea.version + 1 };
    try {
      await this.cliente.send(
        new PutCommand({
          TableName: this.tabla,
          Item: aItemSolicitud(nueva),
          ConditionExpression: 'attribute_exists(PK) AND version = :versionEsperada',
          ExpressionAttributeValues: { ':versionEsperada': instantanea.version },
        }),
      );
    } catch (error) {
      if (esConflicto(error)) {
        throw new ErrorConcurrencia(
          `La solicitud ${instantanea.id} fue modificada por otro proceso; vuelva a intentarlo`,
        );
      }
      throw error;
    }
    return Solicitud.rehidratar(nueva);
  }

  async buscarPorId(id: string): Promise<Solicitud | null> {
    const respuesta = await this.cliente.send(
      new GetCommand({ TableName: this.tabla, Key: claveSolicitud(id) }),
    );
    return respuesta.Item ? Solicitud.rehidratar(aInstantanea(respuesta.Item)) : null;
  }

  async buscarPorTokenAprobador(token: string): Promise<Solicitud | null> {
    const respuesta = await this.cliente.send(
      new GetCommand({ TableName: this.tabla, Key: claveToken(token) }),
    );
    const solicitudId = respuesta.Item?.solicitudId as string | undefined;
    return solicitudId ? this.buscarPorId(solicitudId) : null;
  }

  async listar(filtro?: { correoSolicitante?: string }): Promise<Solicitud[]> {
    const correo = filtro?.correoSolicitante?.trim().toLowerCase();
    const respuesta = await this.cliente.send(
      correo
        ? new QueryCommand({
            TableName: this.tabla,
            IndexName: GSI_SOLICITANTE,
            KeyConditionExpression: 'GSI1PK = :pk',
            ExpressionAttributeValues: { ':pk': `SOLICITANTE#${correo}` },
            ScanIndexForward: false,
          })
        : new QueryCommand({
            TableName: this.tabla,
            IndexName: GSI_TIPO,
            KeyConditionExpression: 'GSI2PK = :pk',
            ExpressionAttributeValues: { ':pk': 'SOLICITUD' },
            ScanIndexForward: false,
          }),
    );
    return (respuesta.Items ?? []).map((item) => Solicitud.rehidratar(aInstantanea(item)));
  }
}

/** DynamoDB reporta el fallo de condición con nombres distintos según la API. */
function esConflicto(error: unknown): boolean {
  const nombre = (error as { name?: string })?.name ?? '';
  if (nombre === 'ConditionalCheckFailedException') return true;
  if (nombre !== 'TransactionCanceledException') return false;
  const razones = (error as { CancellationReasons?: Array<{ Code?: string }> })
    .CancellationReasons;
  return (razones ?? []).some((razon) => razon.Code === 'ConditionalCheckFailed');
}
