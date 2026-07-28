import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

/**
 * Crea la tabla en DynamoDB Local con el mismo esquema de `infra/template.yaml`.
 *
 * Uso:
 *   docker compose -f infra/docker-compose.yml up -d
 *   npm run tabla:local -w backend      (o: npx ts-node-dev scripts/crear-tabla-local.ts)
 */
const TABLA = process.env.TABLA_DYNAMO ?? 'aprobaciones';
const ENDPOINT = process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8000';

const cliente = new DynamoDBClient({
  endpoint: ENDPOINT,
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

async function principal(): Promise<void> {
  try {
    await cliente.send(new DescribeTableCommand({ TableName: TABLA }));
    console.info(`La tabla "${TABLA}" ya existe en ${ENDPOINT}`);
    return;
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceNotFoundException') throw error;
  }

  await cliente.send(
    new CreateTableCommand({
      TableName: TABLA,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'GSI2PK', AttributeType: 'S' },
        { AttributeName: 'GSI2SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1-solicitante',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi2-tipo',
          KeySchema: [
            { AttributeName: 'GSI2PK', KeyType: 'HASH' },
            { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );

  console.info(`Tabla "${TABLA}" creada en ${ENDPOINT}`);
}

principal().catch((error) => {
  console.error('No se pudo crear la tabla local', error);
  process.exit(1);
});
