import { ErrorValidacion } from '../../src/domain/exception/errores';
import { comandoValido } from '../dobles/dobles';
import { crearEntorno, Entorno } from '../dobles/entorno';

describe('ServicioCrearSolicitud', () => {
  let entorno: Entorno;

  beforeEach(() => {
    entorno = crearEntorno();
  });

  it('crea la solicitud en estado PENDIENTE con sus tres aprobadores', async () => {
    const { solicitud } = await entorno.crear.ejecutar(comandoValido());

    expect(solicitud.estado).toBe('PENDIENTE');
    expect(solicitud.aprobadores).toHaveLength(3);
    expect(solicitud.aprobadores.map((a) => a.rol)).toEqual(['JEFE_AREA', 'FINANZAS', 'GERENCIA']);
    expect(solicitud.monto.formateado).toContain('COP');
    expect(solicitud.evidenciaDisponible).toBe(false);
    expect(solicitud.urlEvidencia).toBeNull();
  });

  it('la persiste y la deja consultable por id', async () => {
    const { solicitud } = await entorno.crear.ejecutar(comandoValido());
    await expect(entorno.consultar.porId(solicitud.id)).resolves.toMatchObject({ id: solicitud.id });
  });

  it('genera un token único por aprobador dentro del enlace del enunciado', async () => {
    const { enlacesAprobacion, solicitud } = await entorno.crear.ejecutar(comandoValido());

    expect(enlacesAprobacion).toHaveLength(3);
    const tokens = new Set<string>();
    for (const { enlace } of enlacesAprobacion) {
      expect(enlace).toMatch(
        new RegExp(`^https://app\\.pruebas\\.local/approve\\?solicitud_id=${solicitud.id}&approver_token=.+$`),
      );
      tokens.add(new URL(enlace).searchParams.get('approver_token') as string);
    }
    expect(tokens.size).toBe(3);
  });

  it('simula un correo de invitación por aprobador con su enlace', async () => {
    const { solicitud } = await entorno.crear.ejecutar(comandoValido());
    const bandeja = await entorno.notificador.bandeja({ solicitudId: solicitud.id });

    expect(bandeja).toHaveLength(3);
    expect(bandeja.every((correo) => correo.contexto.tipo === 'INVITACION_APROBACION')).toBe(true);
    expect(bandeja.map((correo) => correo.para).sort()).toEqual([
      'carlos.perez@empresa.com',
      'diana.gomez@empresa.com',
      'esteban.ruiz@empresa.com',
    ]);
    expect(bandeja[0].contexto.enlace).toContain('approver_token=');
  });

  it('propaga las reglas del dominio como error de validación', async () => {
    const comando = comandoValido();
    comando.aprobadores[1].rol = 'JEFE_AREA';
    await expect(entorno.crear.ejecutar(comando)).rejects.toThrow(ErrorValidacion);
  });

  it('no persiste nada cuando la validación falla', async () => {
    await expect(entorno.crear.ejecutar({ ...comandoValido(), monto: -1 })).rejects.toThrow(
      ErrorValidacion,
    );
    await expect(entorno.consultar.listar()).resolves.toHaveLength(0);
  });

  it('crea la solicitud aunque falle el envío simulado del correo', async () => {
    jest.spyOn(entorno.notificador, 'enviar').mockRejectedValue(new Error('SMTP caído'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { solicitud } = await entorno.crear.ejecutar(comandoValido());

    await expect(entorno.consultar.porId(solicitud.id)).resolves.toMatchObject({
      estado: 'PENDIENTE',
    });
  });
});
