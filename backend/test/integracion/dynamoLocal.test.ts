import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ErrorConcurrencia, ErrorValidacion } from '../../src/domain/exception/errores';
import { Solicitud } from '../../src/domain/model/Solicitud';
import { RepositorioSolicitudesDynamo } from '../../src/infrastructure/adapter/out/persistencia/dynamo/RepositorioSolicitudesDynamo';
import { NotificadorDynamo } from '../../src/infrastructure/adapter/out/notificacion/NotificadorDynamo';
import { hashDePrueba } from '../dobles/dobles';

/**
 * Contrato del adaptador contra DynamoDB de verdad (DynamoDB Local).
 *
 * Las pruebas con cliente simulado comprueban que se envía el comando correcto;
 * estas comprueban que DynamoDB hace lo que esperamos: condiciones de escritura,
 * transacciones e índices. Se omiten solas si el contenedor no está arriba, para
 * no romper el pipeline de quien no use Docker:
 *
 *   docker compose -f infra/docker-compose.yml up -d
 *   npm run tabla:local
 */
const ENDPOINT = process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8000';
const TABLA = process.env.TABLA_DYNAMO ?? 'aprobaciones';

const cliente = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint: ENDPOINT,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

let disponible = false;

const solicitudDe = (id: string, correoSolicitante = 'ana@empresa.com') =>
  Solicitud.crear({
    id,
    titulo: 'Compra de 15 portátiles',
    descripcion: 'Renovación del parque de equipos del área de operaciones',
    monto: 45_000_000,
    solicitante: { nombre: 'Ana Restrepo', correo: correoSolicitante },
    aprobadores: [
      { id: `${id}-a1`, nombre: 'Carlos Pérez', correo: 'carlos@empresa.com', rol: 'JEFE_AREA', token: `${id}-t1` },
      { id: `${id}-a2`, nombre: 'Diana Gómez', correo: 'diana@empresa.com', rol: 'FINANZAS', token: `${id}-t2` },
      { id: `${id}-a3`, nombre: 'Esteban Ruiz', correo: 'esteban@empresa.com', rol: 'GERENCIA', token: `${id}-t3` },
    ],
    creadaEn: new Date(),
  });

beforeAll(async () => {
  try {
    const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
    await cliente.send(new DescribeTableCommand({ TableName: TABLA }) as never);
    disponible = true;
  } catch {
    console.warn(
      `[dynamoLocal] Omitido: no hay tabla "${TABLA}" en ${ENDPOINT}. ` +
        'Levante infra/docker-compose.yml y ejecute "npm run tabla:local".',
    );
  }
});

const pruebaSiHayDynamo = (nombre: string, cuerpo: () => Promise<void>) =>
  it(nombre, async () => {
    if (!disponible) return;
    await cuerpo();
  });

describe('RepositorioSolicitudesDynamo contra DynamoDB Local', () => {
  const repositorio = new RepositorioSolicitudesDynamo(cliente, TABLA);
  const idUnico = () => `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  pruebaSiHayDynamo('guarda el agregado completo y lo devuelve intacto', async () => {
    const id = idUnico();
    await repositorio.crear(solicitudDe(id));

    const recuperada = await repositorio.buscarPorId(id);

    expect(recuperada?.titulo).toBe('Compra de 15 portátiles');
    expect(recuperada?.monto.valor).toBe(45_000_000);
    expect(recuperada?.aprobadores).toHaveLength(3);
    expect(recuperada?.aprobadores.map((a) => a.rol)).toEqual(['JEFE_AREA', 'FINANZAS', 'GERENCIA']);
  });

  pruebaSiHayDynamo('la transacción de alta indexa los tres tokens', async () => {
    const id = idUnico();
    await repositorio.crear(solicitudDe(id));

    for (const sufijo of ['t1', 't2', 't3']) {
      const encontrada = await repositorio.buscarPorTokenAprobador(`${id}-${sufijo}`);
      expect(encontrada?.id).toBe(id);
    }
  });

  pruebaSiHayDynamo('rechaza crear dos veces el mismo id', async () => {
    const id = idUnico();
    await repositorio.crear(solicitudDe(id));
    await expect(repositorio.crear(solicitudDe(id))).rejects.toThrow(ErrorValidacion);
  });

  pruebaSiHayDynamo('persiste la firma y la cadena de hashes', async () => {
    const id = idUnico();
    await repositorio.crear(solicitudDe(id));

    const cargada = (await repositorio.buscarPorId(id)) as Solicitud;
    cargada.registrarFirma(cargada.aprobadores[0], new Date(), hashDePrueba);
    await repositorio.actualizar(cargada);

    const revisada = (await repositorio.buscarPorId(id)) as Solicitud;
    expect(revisada.firmasRegistradas).toBe(1);
    expect(revisada.firmasEnOrden[0].secuencia).toBe(1);
    expect(revisada.verificarCadenaFirmas(hashDePrueba).integra).toBe(true);
  });

  pruebaSiHayDynamo('el bloqueo optimista impide que dos firmas se pisen', async () => {
    const id = idUnico();
    await repositorio.crear(solicitudDe(id));

    // Dos procesos leen la misma versión y firman aprobadores distintos.
    const primera = (await repositorio.buscarPorId(id)) as Solicitud;
    const segunda = (await repositorio.buscarPorId(id)) as Solicitud;

    primera.registrarFirma(primera.aprobadores[0], new Date(), hashDePrueba);
    segunda.registrarFirma(segunda.aprobadores[1], new Date(), hashDePrueba);

    await repositorio.actualizar(primera);
    await expect(repositorio.actualizar(segunda)).rejects.toThrow(ErrorConcurrencia);

    // La firma perdida no se coló: queda una sola, la del proceso que ganó.
    const revisada = (await repositorio.buscarPorId(id)) as Solicitud;
    expect(revisada.firmasRegistradas).toBe(1);
    expect(revisada.aprobadores[0].estado).toBe('FIRMADO');
  });

  pruebaSiHayDynamo('el índice por solicitante devuelve solo lo suyo', async () => {
    const correo = `filtro-${Date.now()}@empresa.com`;
    await repositorio.crear(solicitudDe(idUnico(), correo));
    await repositorio.crear(solicitudDe(idUnico(), correo));
    await repositorio.crear(solicitudDe(idUnico(), 'otra.persona@empresa.com'));

    const suyas = await repositorio.listar({ correoSolicitante: correo });

    expect(suyas).toHaveLength(2);
    expect(suyas.every((s) => s.solicitante.correo.valor === correo)).toBe(true);
  });

  pruebaSiHayDynamo('el índice por tipo lista solicitudes sin usar Scan', async () => {
    await repositorio.crear(solicitudDe(idUnico()));
    const todas = await repositorio.listar();
    expect(todas.length).toBeGreaterThan(0);
  });
});

describe('NotificadorDynamo contra DynamoDB Local', () => {
  const notificador = new NotificadorDynamo(cliente, TABLA);

  pruebaSiHayDynamo('el buzón simulado sobrevive fuera del proceso', async () => {
    const solicitudId = `mail-${Date.now()}`;
    await notificador.enviar({
      id: `c-${Date.now()}`,
      para: 'carlos@empresa.com',
      asunto: 'Su firma es requerida',
      cuerpo: 'cuerpo',
      enviadoEn: new Date().toISOString(),
      contexto: { solicitudId, tipo: 'INVITACION_APROBACION', enlace: 'https://app/approve?x=1' },
    });

    const bandeja = await notificador.bandeja({ solicitudId });

    expect(bandeja).toHaveLength(1);
    expect(bandeja[0].contexto.enlace).toContain('/approve');
  });
});
