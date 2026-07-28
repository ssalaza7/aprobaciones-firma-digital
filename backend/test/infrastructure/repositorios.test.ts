import { ErrorConcurrencia, ErrorValidacion } from '../../src/domain/exception/errores';
import { Solicitud } from '../../src/domain/model/Solicitud';
import { RepositorioSolicitudesDynamo } from '../../src/infrastructure/adapter/out/persistencia/dynamo/RepositorioSolicitudesDynamo';
import { RepositorioSolicitudesEnMemoria } from '../../src/infrastructure/adapter/out/persistencia/memoria/RepositorioSolicitudesEnMemoria';
import { aItemSolicitud, claveSolicitud, claveToken } from '../../src/infrastructure/adapter/out/persistencia/dynamo/esquema';
import { hashDePrueba } from '../dobles/dobles';

const AHORA = new Date('2026-03-10T14:00:00.000Z');

const nuevaSolicitud = (id = 'sol-1') =>
  Solicitud.crear({
    id,
    titulo: 'Compra de 15 portátiles',
    descripcion: 'Renovación del parque de equipos del área de operaciones',
    monto: 45_000_000,
    solicitante: { nombre: 'Ana Restrepo', correo: 'ana@empresa.com' },
    aprobadores: [
      { id: 'a1', nombre: 'Carlos Pérez', correo: 'carlos@empresa.com', rol: 'JEFE_AREA', token: `${id}-t1` },
      { id: 'a2', nombre: 'Diana Gómez', correo: 'diana@empresa.com', rol: 'FINANZAS', token: `${id}-t2` },
      { id: 'a3', nombre: 'Esteban Ruiz', correo: 'esteban@empresa.com', rol: 'GERENCIA', token: `${id}-t3` },
    ],
    creadaEn: AHORA,
  });

describe('RepositorioSolicitudesEnMemoria', () => {
  let repositorio: RepositorioSolicitudesEnMemoria;

  beforeEach(() => {
    repositorio = new RepositorioSolicitudesEnMemoria();
  });

  it('guarda y recupera por id', async () => {
    await repositorio.crear(nuevaSolicitud());
    const recuperada = await repositorio.buscarPorId('sol-1');
    expect(recuperada?.titulo).toBe('Compra de 15 portátiles');
  });

  it('devuelve null cuando no existe', async () => {
    await expect(repositorio.buscarPorId('nada')).resolves.toBeNull();
    await expect(repositorio.buscarPorTokenAprobador('nada')).resolves.toBeNull();
  });

  it('resuelve la solicitud desde el token de cualquier aprobador', async () => {
    await repositorio.crear(nuevaSolicitud());
    const recuperada = await repositorio.buscarPorTokenAprobador('sol-1-t3');
    expect(recuperada?.id).toBe('sol-1');
  });

  it('impide duplicar el id', async () => {
    await repositorio.crear(nuevaSolicitud());
    await expect(repositorio.crear(nuevaSolicitud())).rejects.toThrow(ErrorValidacion);
  });

  it('no deja que el llamador mute el almacén por referencia', async () => {
    await repositorio.crear(nuevaSolicitud());
    const cargada = (await repositorio.buscarPorId('sol-1')) as Solicitud;
    cargada.registrarFirma(cargada.aprobadores[0], AHORA, hashDePrueba);

    const revisada = (await repositorio.buscarPorId('sol-1')) as Solicitud;
    expect(revisada.firmasRegistradas).toBe(0);
  });

  it('incrementa la versión en cada actualización', async () => {
    await repositorio.crear(nuevaSolicitud());
    const cargada = (await repositorio.buscarPorId('sol-1')) as Solicitud;
    expect(cargada.version).toBe(1);

    const actualizada = await repositorio.actualizar(cargada);
    expect(actualizada.version).toBe(2);
  });

  it('detecta escrituras concurrentes con bloqueo optimista', async () => {
    await repositorio.crear(nuevaSolicitud());
    const primera = (await repositorio.buscarPorId('sol-1')) as Solicitud;
    const segunda = (await repositorio.buscarPorId('sol-1')) as Solicitud;

    await repositorio.actualizar(primera);
    await expect(repositorio.actualizar(segunda)).rejects.toThrow(ErrorConcurrencia);
  });

  it('falla al actualizar algo que no existe', async () => {
    await expect(repositorio.actualizar(nuevaSolicitud())).rejects.toThrow(ErrorValidacion);
  });

  it('lista todas y filtra por solicitante', async () => {
    await repositorio.crear(nuevaSolicitud('sol-1'));
    await repositorio.crear(nuevaSolicitud('sol-2'));

    expect(await repositorio.listar()).toHaveLength(2);
    expect(await repositorio.listar({ correoSolicitante: 'ANA@empresa.com' })).toHaveLength(2);
    expect(await repositorio.listar({ correoSolicitante: 'otro@empresa.com' })).toHaveLength(0);
  });
});

describe('RepositorioSolicitudesDynamo', () => {
  const crearCliente = (respuestas: unknown[] = []) => {
    const send = jest.fn();
    respuestas.forEach((respuesta) => send.mockResolvedValueOnce(respuesta));
    send.mockResolvedValue({});
    return { send } as never;
  };

  it('escribe la solicitud y los tres índices de token en una transacción', async () => {
    const cliente = crearCliente();
    const repositorio = new RepositorioSolicitudesDynamo(cliente, 'tabla');

    await repositorio.crear(nuevaSolicitud());

    const comando = (cliente as unknown as { send: jest.Mock }).send.mock.calls[0][0];
    expect(comando.input.TransactItems).toHaveLength(4);
    expect(comando.input.TransactItems[0].Put.Item.PK).toBe('SOL#sol-1');
    expect(comando.input.TransactItems[1].Put.Item).toMatchObject({
      ...claveToken('sol-1-t1'),
      solicitudId: 'sol-1',
    });
  });

  it('traduce el fallo de condición del alta a error de validación', async () => {
    const send = jest.fn().mockRejectedValue(
      Object.assign(new Error('cancelada'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
      }),
    );
    const repositorio = new RepositorioSolicitudesDynamo({ send } as never, 'tabla');

    await expect(repositorio.crear(nuevaSolicitud())).rejects.toThrow(ErrorValidacion);
  });

  it('actualiza con condición sobre la versión y la incrementa', async () => {
    const cliente = crearCliente();
    const repositorio = new RepositorioSolicitudesDynamo(cliente, 'tabla');

    const actualizada = await repositorio.actualizar(nuevaSolicitud());

    const comando = (cliente as unknown as { send: jest.Mock }).send.mock.calls[0][0];
    expect(comando.input.ConditionExpression).toContain('version = :versionEsperada');
    expect(comando.input.ExpressionAttributeValues[':versionEsperada']).toBe(1);
    expect(comando.input.Item.version).toBe(2);
    expect(actualizada.version).toBe(2);
  });

  it('traduce el fallo de condición de la actualización a error de concurrencia', async () => {
    const send = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('conflicto'), { name: 'ConditionalCheckFailedException' }));
    const repositorio = new RepositorioSolicitudesDynamo({ send } as never, 'tabla');

    await expect(repositorio.actualizar(nuevaSolicitud())).rejects.toThrow(ErrorConcurrencia);
  });

  it('propaga errores que no son de condición', async () => {
    const send = jest.fn().mockRejectedValue(Object.assign(new Error('sin permisos'), { name: 'AccessDenied' }));
    const repositorio = new RepositorioSolicitudesDynamo({ send } as never, 'tabla');

    await expect(repositorio.actualizar(nuevaSolicitud())).rejects.toThrow('sin permisos');
    await expect(repositorio.crear(nuevaSolicitud())).rejects.toThrow('sin permisos');
  });

  it('rehidrata la solicitud descartando los atributos de clave', async () => {
    const item = aItemSolicitud(nuevaSolicitud().instantanea());
    const repositorio = new RepositorioSolicitudesDynamo(crearCliente([{ Item: item }]), 'tabla');

    const solicitud = await repositorio.buscarPorId('sol-1');

    expect(solicitud?.titulo).toBe('Compra de 15 portátiles');
    expect(JSON.stringify(solicitud?.instantanea())).not.toContain('GSI1PK');
  });

  it('devuelve null cuando la clave no existe', async () => {
    const repositorio = new RepositorioSolicitudesDynamo(crearCliente([{}]), 'tabla');
    await expect(repositorio.buscarPorId('sol-1')).resolves.toBeNull();
  });

  it('resuelve el token en dos lecturas: índice y solicitud', async () => {
    const item = aItemSolicitud(nuevaSolicitud().instantanea());
    const cliente = crearCliente([{ Item: { ...claveToken('sol-1-t2'), solicitudId: 'sol-1' } }, { Item: item }]);
    const repositorio = new RepositorioSolicitudesDynamo(cliente, 'tabla');

    const solicitud = await repositorio.buscarPorTokenAprobador('sol-1-t2');

    expect(solicitud?.id).toBe('sol-1');
    const segundoComando = (cliente as unknown as { send: jest.Mock }).send.mock.calls[1][0];
    expect(segundoComando.input.Key).toEqual(claveSolicitud('sol-1'));
  });

  it('devuelve null si el token no está indexado', async () => {
    const repositorio = new RepositorioSolicitudesDynamo(crearCliente([{}]), 'tabla');
    await expect(repositorio.buscarPorTokenAprobador('inexistente')).resolves.toBeNull();
  });

  it('consulta el índice por solicitante cuando hay filtro', async () => {
    const cliente = crearCliente([{ Items: [aItemSolicitud(nuevaSolicitud().instantanea())] }]);
    const repositorio = new RepositorioSolicitudesDynamo(cliente, 'tabla');

    const lista = await repositorio.listar({ correoSolicitante: 'Ana@Empresa.com' });

    const comando = (cliente as unknown as { send: jest.Mock }).send.mock.calls[0][0];
    expect(comando.input.IndexName).toBe('gsi1-solicitante');
    expect(comando.input.ExpressionAttributeValues[':pk']).toBe('SOLICITANTE#ana@empresa.com');
    expect(lista).toHaveLength(1);
  });

  it('consulta el índice por tipo cuando no hay filtro', async () => {
    const cliente = crearCliente([{ Items: [] }]);
    const repositorio = new RepositorioSolicitudesDynamo(cliente, 'tabla');

    await repositorio.listar();

    const comando = (cliente as unknown as { send: jest.Mock }).send.mock.calls[0][0];
    expect(comando.input.IndexName).toBe('gsi2-tipo');
    expect(comando.input.ExpressionAttributeValues[':pk']).toBe('SOLICITUD');
  });
});
