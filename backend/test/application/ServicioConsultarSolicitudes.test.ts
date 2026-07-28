import { ErrorRecursoNoEncontrado } from '../../src/domain/exception/errores';
import { comandoValido } from '../dobles/dobles';
import { crearEntorno, decidir, Entorno } from '../dobles/entorno';

describe('ServicioConsultarSolicitudes', () => {
  let entorno: Entorno;

  beforeEach(() => {
    entorno = crearEntorno();
  });

  it('devuelve la lista vacía cuando no hay solicitudes', async () => {
    await expect(entorno.consultar.listar()).resolves.toEqual([]);
  });

  it('ordena las solicitudes de la más reciente a la más antigua', async () => {
    const primera = await entorno.crear.ejecutar({ ...comandoValido(), titulo: 'Compra antigua' });
    entorno.reloj.avanzar(60_000);
    const segunda = await entorno.crear.ejecutar({ ...comandoValido(), titulo: 'Compra reciente' });

    const lista = await entorno.consultar.listar();
    expect(lista.map((s) => s.id)).toEqual([segunda.solicitud.id, primera.solicitud.id]);
  });

  it('filtra por el correo del solicitante', async () => {
    await entorno.crear.ejecutar(comandoValido());
    await entorno.crear.ejecutar({
      ...comandoValido(),
      solicitante: { nombre: 'Bruno Díaz', correo: 'bruno@empresa.com' },
    });

    const lista = await entorno.consultar.listar({ correoSolicitante: 'BRUNO@empresa.com' });
    expect(lista).toHaveLength(1);
    expect(lista[0].solicitante.correo).toBe('bruno@empresa.com');
  });

  it('expone el estado por aprobador para el panel', async () => {
    const creada = await entorno.crear.ejecutar(comandoValido());
    const tokens = creada.enlacesAprobacion.map(
      ({ enlace }) => new URL(enlace).searchParams.get('approver_token') as string,
    );
    await decidir(entorno, creada.solicitud.id, tokens[0], 'APROBAR');
    await decidir(entorno, creada.solicitud.id, tokens[1], 'RECHAZAR', 'Sin presupuesto');

    const detalle = await entorno.consultar.porId(creada.solicitud.id);

    expect(detalle.aprobadores.map((a) => a.estado)).toEqual(['FIRMADO', 'RECHAZADO', 'PENDIENTE']);
    expect(detalle.aprobadores[0].firmadoEn).toBeTruthy();
    expect(detalle.aprobadores[0].trazoFirma).toBe('Carlos P.');
    expect(detalle.aprobadores[1].rechazadoEn).toBeTruthy();
    expect(detalle.aprobadores[2].firmadoEn).toBeNull();
    expect(detalle.estado).toBe('RECHAZADA');
  });

  it('nunca expone el OTP ni los tokens de aprobación', async () => {
    const creada = await entorno.crear.ejecutar(comandoValido());
    const tokens = creada.enlacesAprobacion.map(
      ({ enlace }) => new URL(enlace).searchParams.get('approver_token') as string,
    );
    await entorno.aprobacion.solicitarOtp({
      solicitudId: creada.solicitud.id,
      tokenAprobador: tokens[0],
    });

    const serializada = JSON.stringify(await entorno.consultar.porId(creada.solicitud.id));

    expect(serializada).not.toContain(tokens[0]);
    expect(serializada).not.toContain('otp');
  });

  it('falla al consultar una solicitud inexistente', async () => {
    await expect(entorno.consultar.porId('no-existe')).rejects.toThrow(ErrorRecursoNoEncontrado);
  });
});
