import { api, cliente, ErrorDeApi, urlApi } from '../src/api';
import { formatearCuentaRegresiva, formatearFecha, formatearMonto } from '../src/formato';
import { solicitudDe } from '../../../test/dobles/api';

jest.mock('axios', () => {
  const instancia = { get: jest.fn(), post: jest.fn() };
  return {
    __esModule: true,
    default: { create: jest.fn(() => instancia) },
    create: jest.fn(() => instancia),
  };
});

const get = cliente.get as jest.Mock;
const post = cliente.post as jest.Mock;

describe('Cliente de la API', () => {
  it('apunta a localhost cuando no hay URL inyectada en el build', () => {
    expect(urlApi()).toBe('http://localhost:4000');
  });

  it('crea la solicitud contra el endpoint REST', async () => {
    post.mockResolvedValue({ data: { solicitud: solicitudDe(), enlacesAprobacion: [] } });

    const nueva = {
      titulo: 'Compra',
      descripcion: 'Descripción larga',
      monto: 100,
      solicitante: { nombre: 'Ana', correo: 'ana@empresa.com' },
      aprobadores: [],
    };
    await api.crearSolicitud(nueva);

    expect(post).toHaveBeenCalledWith('/api/solicitudes', nueva);
  });

  it('lista con y sin filtro de solicitante', async () => {
    get.mockResolvedValue({ data: { total: 0, solicitudes: [] } });

    await api.listarSolicitudes();
    expect(get).toHaveBeenLastCalledWith('/api/solicitudes', { params: undefined });

    await api.listarSolicitudes('ana@empresa.com');
    expect(get).toHaveBeenLastCalledWith('/api/solicitudes', {
      params: { solicitante: 'ana@empresa.com' },
    });
  });

  it('usa los nombres de campo del enunciado en el flujo de aprobación', async () => {
    post.mockResolvedValue({ data: {} });

    await api.solicitarOtp('sol-1', 'tok-1');
    expect(post).toHaveBeenLastCalledWith('/api/aprobaciones/otp', {
      solicitud_id: 'sol-1',
      approver_token: 'tok-1',
    });

    await api.validarOtp('sol-1', 'tok-1', '123456');
    expect(post).toHaveBeenLastCalledWith('/api/aprobaciones/otp/validar', {
      solicitud_id: 'sol-1',
      approver_token: 'tok-1',
      otp: '123456',
    });

    await api.registrarDecision({
      solicitudId: 'sol-1',
      tokenAprobador: 'tok-1',
      tokenSesion: 'ses-1',
      decision: 'APROBAR',
    });
    expect(post).toHaveBeenLastCalledWith('/api/aprobaciones/decision', {
      solicitud_id: 'sol-1',
      approver_token: 'tok-1',
      session_token: 'ses-1',
      decision: 'APROBAR',
      motivo: undefined,
    });
  });

  it('arma la URL absoluta de la evidencia', () => {
    expect(api.urlEvidencia('sol-1')).toBe(
      'http://localhost:4000/api/solicitudes/sol-1/evidencia.pdf',
    );
  });

  it('consulta el buzón simulado', async () => {
    get.mockResolvedValue({ data: { total: 0, correos: [] } });
    await api.bandeja('sol-1');
    expect(get).toHaveBeenLastCalledWith('/api/mock-mail', { params: { solicitud_id: 'sol-1' } });
  });
});

describe('Traducción de errores', () => {
  it('conserva el mensaje de negocio que envía el backend', () => {
    const error = ErrorDeApi.desde({
      isAxiosError: true,
      response: { status: 401, data: { codigo: 'OTP_INVALIDO', mensaje: 'El código expiró', motivo: 'EXPIRADO' } },
    });

    expect(error).toMatchObject({ codigo: 'OTP_INVALIDO', message: 'El código expiró', motivo: 'EXPIRADO', estado: 401 });
  });

  it('distingue la caída de red de un error del servidor', () => {
    expect(ErrorDeApi.desde({ isAxiosError: true }).codigo).toBe('SIN_CONEXION');
    expect(ErrorDeApi.desde({ isAxiosError: true, response: { status: 502, data: '' } }).codigo).toBe(
      'ERROR_HTTP',
    );
  });

  it('envuelve cualquier otro fallo', () => {
    expect(ErrorDeApi.desde(new Error('boom')).message).toBe('boom');
  });

  it('las llamadas de la API propagan ErrorDeApi, no errores de axios', async () => {
    get.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: { codigo: 'NO_ENCONTRADO', mensaje: 'No existe' } } });
    await expect(api.obtenerSolicitud('x')).rejects.toBeInstanceOf(ErrorDeApi);
  });
});

describe('Formato', () => {
  it('formatea fechas legibles y tolera valores vacíos', () => {
    expect(formatearFecha('2026-03-10T14:00:00.000Z')).toMatch(/2026/);
    expect(formatearFecha(null)).toBe('—');
    expect(formatearFecha('no-es-fecha')).toBe('—');
  });

  it('formatea montos con moneda', () => {
    expect(formatearMonto(1250000)).toContain('COP');
    expect(formatearMonto(1250000, 'USD')).toContain('USD');
  });

  it('formatea la cuenta regresiva en mm:ss', () => {
    expect(formatearCuentaRegresiva(180)).toBe('3:00');
    expect(formatearCuentaRegresiva(59)).toBe('0:59');
    expect(formatearCuentaRegresiva(-5)).toBe('0:00');
  });
});
