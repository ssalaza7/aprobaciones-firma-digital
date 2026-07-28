import {
  ErrorSesionInvalida,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../../src/domain/exception/errores';
import { Aprobador } from '../../src/domain/model/Aprobador';

const AHORA = new Date('2026-03-10T14:00:00.000Z');
const eslabon = { secuencia: 1, hashAnterior: 'semilla', hash: 'hash-1' };

const crear = () =>
  Aprobador.crear({
    id: 'a1',
    nombre: 'Carlos Andrés Pérez',
    correo: 'Carlos@Empresa.com',
    rol: 'JEFE_AREA',
    token: 't1',
  });

describe('Aprobador', () => {
  it('normaliza el correo y arranca pendiente', () => {
    const aprobador = crear();
    expect(aprobador.correo.valor).toBe('carlos@empresa.com');
    expect(aprobador.estado).toBe('PENDIENTE');
    expect(aprobador.estaPendiente()).toBe(true);
  });

  it('rechaza nombres demasiado cortos o largos', () => {
    expect(() => Aprobador.crear({ id: 'a', nombre: 'Al', correo: 'a@b.com', rol: 'LEGAL', token: 't' })).toThrow(
      ErrorValidacion,
    );
    expect(() =>
      Aprobador.crear({ id: 'a', nombre: 'A'.repeat(121), correo: 'a@b.com', rol: 'LEGAL', token: 't' }),
    ).toThrow(ErrorValidacion);
  });

  it('abre sesión cuando el OTP es correcto', () => {
    const aprobador = crear();
    aprobador.emitirOtp('123456', AHORA);

    const resultado = aprobador.verificarOtp('123456', 'sesion-1', AHORA);

    expect(resultado.valido).toBe(true);
    expect(() => aprobador.exigirSesionValida('sesion-1', AHORA)).not.toThrow();
  });

  it('no abre sesión cuando el OTP es incorrecto', () => {
    const aprobador = crear();
    aprobador.emitirOtp('123456', AHORA);

    expect(aprobador.verificarOtp('000000', 'sesion-1', AHORA).valido).toBe(false);
    expect(() => aprobador.exigirSesionValida('sesion-1', AHORA)).toThrow(ErrorSesionInvalida);
  });

  it('exige haber pedido un código antes de validarlo', () => {
    expect(() => crear().verificarOtp('123456', 'sesion-1', AHORA)).toThrow(ErrorSesionInvalida);
  });

  it('caduca la sesión a los 15 minutos', () => {
    const aprobador = crear();
    aprobador.emitirOtp('123456', AHORA);
    aprobador.verificarOtp('123456', 'sesion-1', AHORA);

    const despues = new Date(AHORA.getTime() + Aprobador.VIGENCIA_SESION_MS + 1000);
    expect(() => aprobador.exigirSesionValida('sesion-1', despues)).toThrow(ErrorSesionInvalida);
  });

  it('rechaza un token de sesión que no es el suyo', () => {
    const aprobador = crear();
    aprobador.emitirOtp('123456', AHORA);
    aprobador.verificarOtp('123456', 'sesion-1', AHORA);
    expect(() => aprobador.exigirSesionValida('otra-sesion', AHORA)).toThrow(ErrorSesionInvalida);
  });

  it('al firmar registra nombre, fecha y trazo, e invalida OTP y sesión', () => {
    const aprobador = crear();
    aprobador.emitirOtp('123456', AHORA);
    aprobador.verificarOtp('123456', 'sesion-1', AHORA);

    const firma = aprobador.firmar(AHORA, eslabon);

    expect(firma.nombre).toBe('Carlos Andrés Pérez');
    expect(firma.firmadoEn).toBe(AHORA.toISOString());
    expect(firma.trazo).toBe('Carlos A. P.');
    expect(firma.hash).toBe('hash-1');
    expect(aprobador.estado).toBe('FIRMADO');
    expect(aprobador.otp).toBeNull();
    expect(() => aprobador.exigirSesionValida('sesion-1', AHORA)).toThrow(ErrorSesionInvalida);
  });

  it('al rechazar guarda motivo y fecha', () => {
    const aprobador = crear();
    aprobador.rechazar(AHORA, '  Excede el presupuesto  ');

    expect(aprobador.estado).toBe('RECHAZADO');
    expect(aprobador.motivoRechazo).toBe('Excede el presupuesto');
    expect(aprobador.decididoEn?.toISOString()).toBe(AHORA.toISOString());
  });

  it('acepta rechazar sin motivo', () => {
    const aprobador = crear();
    aprobador.rechazar(AHORA);
    expect(aprobador.motivoRechazo).toBeNull();
  });

  it('rechaza un motivo excesivamente largo', () => {
    expect(() => crear().rechazar(AHORA, 'x'.repeat(501))).toThrow(ErrorValidacion);
  });

  it('bloquea cualquier acción después de decidir', () => {
    const aprobador = crear();
    aprobador.firmar(AHORA, eslabon);

    expect(() => aprobador.firmar(AHORA, eslabon)).toThrow(ErrorTransicionInvalida);
    expect(() => aprobador.rechazar(AHORA)).toThrow(ErrorTransicionInvalida);
    expect(() => aprobador.emitirOtp('999999', AHORA)).toThrow(ErrorTransicionInvalida);
  });

  it('reemplaza el OTP anterior al pedir uno nuevo', () => {
    const aprobador = crear();
    aprobador.emitirOtp('111111', AHORA);
    aprobador.verificarOtp('999999', 'sesion-1', AHORA);
    aprobador.emitirOtp('222222', AHORA);

    expect(aprobador.otp?.intentos).toBe(0);
    expect(aprobador.verificarOtp('222222', 'sesion-2', AHORA).valido).toBe(true);
  });

  it('conserva su estado al rehidratarse', () => {
    const aprobador = crear();
    aprobador.emitirOtp('123456', AHORA);
    aprobador.verificarOtp('123456', 'sesion-1', AHORA);

    const revivido = Aprobador.rehidratar(JSON.parse(JSON.stringify(aprobador.instantanea())));
    expect(() => revivido.exigirSesionValida('sesion-1', AHORA)).not.toThrow();
  });
});
