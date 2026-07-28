import { ErrorValidacion } from '../../src/domain/exception/errores';
import { Correo } from '../../src/domain/model/Correo';
import { Monto } from '../../src/domain/model/Monto';
import { ROLES_APROBADOR, esRolAprobador, etiquetaRol, rolDe } from '../../src/domain/model/RolAprobador';

describe('Correo', () => {
  it('normaliza a minúsculas y recorta espacios', () => {
    expect(Correo.de('  Ana.Restrepo@Empresa.COM ').valor).toBe('ana.restrepo@empresa.com');
  });

  it('considera iguales dos correos que solo difieren en mayúsculas', () => {
    expect(Correo.de('a@b.com').equals(Correo.de('A@B.com'))).toBe(true);
  });

  it.each([['', 'vacío'], ['sin-arroba', 'sin @'], ['a@b', 'sin dominio'], ['a b@c.com', 'con espacio']])(
    'rechaza "%s" (%s)',
    (valor) => {
      expect(() => Correo.de(valor)).toThrow(ErrorValidacion);
    },
  );

  it('rechaza correos absurdamente largos', () => {
    expect(() => Correo.de(`${'a'.repeat(250)}@empresa.com`)).toThrow(ErrorValidacion);
  });
});

describe('Monto', () => {
  it('guarda el valor en centavos para evitar errores de punto flotante', () => {
    expect(Monto.de(0.1 + 0.2).centavos).toBe(30);
  });

  it('acepta el monto como texto', () => {
    expect(Monto.de('1500.50').valor).toBe(1500.5);
  });

  it('formatea con separadores y moneda', () => {
    expect(Monto.de(1_250_000).formatear()).toContain('COP');
    expect(Monto.de(1_250_000).formatear()).toMatch(/1\D?250\D?000/);
  });

  it('reconstruye desde centavos sin perder precisión', () => {
    expect(Monto.desdeCentavos(4_500_099, 'USD').valor).toBe(45000.99);
  });

  it.each([[0], [-5], ['abc'], [Number.POSITIVE_INFINITY], [1.234]])(
    'rechaza el monto inválido %p',
    (valor) => {
      expect(() => Monto.de(valor as number)).toThrow(ErrorValidacion);
    },
  );

  it('rechaza montos por encima del máximo', () => {
    expect(() => Monto.de(99_999_999_999_99)).toThrow(ErrorValidacion);
  });

  it('rechaza monedas que no son ISO-4217', () => {
    expect(() => Monto.de(100, 'pesos')).toThrow(ErrorValidacion);
  });
});

describe('RolAprobador', () => {
  it('acepta los roles del catálogo', () => {
    ROLES_APROBADOR.forEach((rol) => expect(rolDe(rol)).toBe(rol));
  });

  it('rechaza un rol fuera del catálogo', () => {
    expect(() => rolDe('AUDITORIA')).toThrow(ErrorValidacion);
    expect(esRolAprobador('AUDITORIA')).toBe(false);
  });

  it('expone una etiqueta legible para la UI y el PDF', () => {
    expect(etiquetaRol('JEFE_AREA')).toBe('Jefe de Área');
  });
});
