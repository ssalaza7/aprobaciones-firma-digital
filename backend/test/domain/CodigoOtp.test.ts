import { CodigoOtp } from '../../src/domain/model/CodigoOtp';

const INICIO = new Date('2026-03-10T14:00:00.000Z');
const enSegundos = (segundos: number) => new Date(INICIO.getTime() + segundos * 1000);

describe('CodigoOtp', () => {
  it('vence exactamente a los 3 minutos, como pide el enunciado', () => {
    const otp = CodigoOtp.emitir('123456', INICIO);
    expect(CodigoOtp.VIGENCIA_MS).toBe(180_000);
    expect(otp.estaExpirado(enSegundos(179))).toBe(false);
    expect(otp.estaExpirado(enSegundos(181))).toBe(true);
  });

  it('acepta el código correcto dentro de la vigencia', () => {
    const resultado = CodigoOtp.emitir('123456', INICIO).verificar('123456', enSegundos(60));
    expect(resultado.valido).toBe(true);
  });

  it('tolera espacios alrededor del código', () => {
    expect(CodigoOtp.emitir('123456', INICIO).verificar(' 123456 ', INICIO).valido).toBe(true);
  });

  it('rechaza un código incorrecto y contabiliza el intento', () => {
    const resultado = CodigoOtp.emitir('123456', INICIO).verificar('000000', INICIO);
    expect(resultado.valido).toBe(false);
    expect(resultado.otp.intentos).toBe(1);
    if (!resultado.valido) expect(resultado.error.motivo).toBe('INCORRECTO');
  });

  it('rechaza un código vencido sin gastar intentos', () => {
    const otp = CodigoOtp.emitir('123456', INICIO);
    const resultado = otp.verificar('123456', enSegundos(200));
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) expect(resultado.error.motivo).toBe('EXPIRADO');
    expect(resultado.otp.intentos).toBe(0);
  });

  it('bloquea tras cinco intentos fallidos', () => {
    let otp = CodigoOtp.emitir('123456', INICIO);
    for (let i = 0; i < CodigoOtp.MAX_INTENTOS; i += 1) {
      otp = otp.verificar('999999', INICIO).otp;
    }
    const resultado = otp.verificar('123456', INICIO);
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) expect(resultado.error.motivo).toBe('BLOQUEADO');
  });

  it('informa los segundos que le quedan de vida', () => {
    const otp = CodigoOtp.emitir('123456', INICIO);
    expect(otp.segundosRestantes(enSegundos(60))).toBe(120);
    expect(otp.segundosRestantes(enSegundos(500))).toBe(0);
  });

  it('sobrevive a la serialización sin cambiar de comportamiento', () => {
    const original = CodigoOtp.emitir('123456', INICIO).verificar('000000', INICIO).otp;
    const revivido = CodigoOtp.rehidratar(JSON.parse(JSON.stringify(original.instantanea())));
    expect(revivido.intentos).toBe(1);
    expect(revivido.verificar('123456', enSegundos(10)).valido).toBe(true);
  });
});
