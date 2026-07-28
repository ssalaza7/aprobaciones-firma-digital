import {
  ErrorRecursoNoEncontrado,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../../src/domain/exception/errores';
import { Solicitud } from '../../src/domain/model/Solicitud';
import { hashDePrueba } from '../dobles/dobles';

const AHORA = new Date('2026-03-10T14:00:00.000Z');

const datosBase = () => ({
  id: 'sol-1',
  titulo: 'Compra de 15 portátiles',
  descripcion: 'Renovación del parque de equipos del área de operaciones',
  monto: 45_000_000,
  moneda: 'COP',
  solicitante: { nombre: 'Ana Restrepo', correo: 'ana@empresa.com' },
  aprobadores: [
    { id: 'a1', nombre: 'Carlos Pérez', correo: 'carlos@empresa.com', rol: 'JEFE_AREA', token: 't1' },
    { id: 'a2', nombre: 'Diana Gómez', correo: 'diana@empresa.com', rol: 'FINANZAS', token: 't2' },
    { id: 'a3', nombre: 'Esteban Ruiz', correo: 'esteban@empresa.com', rol: 'GERENCIA', token: 't3' },
  ],
  creadaEn: AHORA,
});

const crear = (cambios: Partial<ReturnType<typeof datosBase>> = {}) =>
  Solicitud.crear({ ...datosBase(), ...cambios });

describe('Solicitud - creación', () => {
  it('nace pendiente, con sus tres aprobadores pendientes', () => {
    const solicitud = crear();
    expect(solicitud.estado).toBe('PENDIENTE');
    expect(solicitud.aprobadores).toHaveLength(3);
    expect(solicitud.aprobadores.every((a) => a.estado === 'PENDIENTE')).toBe(true);
    expect(solicitud.firmasRegistradas).toBe(0);
  });

  it('exige exactamente tres aprobadores', () => {
    expect(() => crear({ aprobadores: datosBase().aprobadores.slice(0, 2) })).toThrow(
      ErrorValidacion,
    );
    expect(() =>
      crear({
        aprobadores: [
          ...datosBase().aprobadores,
          { id: 'a4', nombre: 'Otro Aprobador', correo: 'otro@empresa.com', rol: 'LEGAL', token: 't4' },
        ],
      }),
    ).toThrow(ErrorValidacion);
  });

  it('exige que los tres roles sean distintos', () => {
    const aprobadores = datosBase().aprobadores;
    aprobadores[1].rol = 'JEFE_AREA';
    expect(() => crear({ aprobadores })).toThrow(/roles distintos/);
  });

  it('exige que los tres correos sean distintos', () => {
    const aprobadores = datosBase().aprobadores;
    aprobadores[2].correo = aprobadores[0].correo;
    expect(() => crear({ aprobadores })).toThrow(/correos distintos/);
  });

  it.each([
    ['título corto', { titulo: 'PC' }],
    ['descripción corta', { descripcion: 'poco' }],
    ['monto cero', { monto: 0 }],
    ['solicitante sin nombre', { solicitante: { nombre: '', correo: 'a@b.com' } }],
    ['solicitante sin correo', { solicitante: { nombre: 'Ana Restrepo', correo: '' } }],
  ])('rechaza %s', (_caso, cambios) => {
    expect(() => crear(cambios as never)).toThrow(ErrorValidacion);
  });

  it('resuelve el aprobador por su token y falla con un token desconocido', () => {
    const solicitud = crear();
    expect(solicitud.aprobadorPorToken('t2').rol).toBe('FINANZAS');
    expect(() => solicitud.aprobadorPorToken('inexistente')).toThrow(ErrorRecursoNoEncontrado);
  });

  it('sobrevive al ciclo de serialización de la persistencia', () => {
    const original = crear();
    const revivida = Solicitud.rehidratar(JSON.parse(JSON.stringify(original.instantanea())));
    expect(revivida.instantanea()).toEqual(original.instantanea());
  });
});

describe('Solicitud - flujo de decisiones', () => {
  it('se completa al registrar las tres firmas y adjuntar la evidencia', () => {
    const solicitud = crear();
    solicitud.aprobadores.forEach((aprobador, indice) =>
      solicitud.registrarFirma(aprobador, new Date(AHORA.getTime() + indice * 1000), hashDePrueba),
    );

    expect(solicitud.todasFirmadas()).toBe(true);
    expect(solicitud.estado).toBe('PENDIENTE'); // aún falta el PDF

    solicitud.adjuntarEvidencia('evidencias/sol-1/evidencia.pdf', AHORA);
    expect(solicitud.estado).toBe('COMPLETADA');
    expect(solicitud.evidencia?.clave).toContain('sol-1');
  });

  it('un rechazo cierra el flujo para todos', () => {
    const solicitud = crear();
    solicitud.registrarRechazo(solicitud.aprobadores[1], AHORA, 'Fuera de presupuesto');

    expect(solicitud.estado).toBe('RECHAZADA');
    expect(solicitud.aprobadores[1].motivoRechazo).toBe('Fuera de presupuesto');
    expect(() => solicitud.registrarFirma(solicitud.aprobadores[0], AHORA, hashDePrueba)).toThrow(
      ErrorTransicionInvalida,
    );
  });

  it('impide que un aprobador decida dos veces', () => {
    const solicitud = crear();
    solicitud.registrarFirma(solicitud.aprobadores[0], AHORA, hashDePrueba);
    expect(() => solicitud.registrarFirma(solicitud.aprobadores[0], AHORA, hashDePrueba)).toThrow(
      ErrorTransicionInvalida,
    );
  });

  it('no genera evidencia mientras falten firmas', () => {
    const solicitud = crear();
    solicitud.registrarFirma(solicitud.aprobadores[0], AHORA, hashDePrueba);
    expect(() => solicitud.adjuntarEvidencia('clave', AHORA)).toThrow(ErrorTransicionInvalida);
  });
});

describe('Solicitud - cadena de firmas concatenadas', () => {
  const firmarTodas = (solicitud: Solicitud) =>
    solicitud.aprobadores.forEach((aprobador, indice) =>
      solicitud.registrarFirma(aprobador, new Date(AHORA.getTime() + indice * 1000), hashDePrueba),
    );

  it('encadena cada firma con el hash de la anterior', () => {
    const solicitud = crear();
    firmarTodas(solicitud);

    const firmas = solicitud.firmasEnOrden;
    expect(firmas.map((f) => f.secuencia)).toEqual([1, 2, 3]);
    expect(firmas[0].hashAnterior).toBe(solicitud.semillaCadena(hashDePrueba));
    expect(firmas[1].hashAnterior).toBe(firmas[0].hash);
    expect(firmas[2].hashAnterior).toBe(firmas[1].hash);
  });

  it('verifica la cadena completa', () => {
    const solicitud = crear();
    firmarTodas(solicitud);
    expect(solicitud.verificarCadenaFirmas(hashDePrueba)).toEqual({ integra: true, eslabones: 3 });
  });

  it('detecta la manipulación de una firma ya registrada', () => {
    const solicitud = crear();
    firmarTodas(solicitud);

    const instantanea = solicitud.instantanea();
    instantanea.aprobadores[1].firma!.firmadoEn = '2020-01-01T00:00:00.000Z';
    const manipulada = Solicitud.rehidratar(instantanea);

    expect(manipulada.verificarCadenaFirmas(hashDePrueba).integra).toBe(false);
  });

  it('detecta la manipulación del contenido de la solicitud', () => {
    const solicitud = crear();
    firmarTodas(solicitud);

    const instantanea = solicitud.instantanea();
    instantanea.montoCentavos = 100;
    const manipulada = Solicitud.rehidratar(instantanea);

    expect(manipulada.verificarCadenaFirmas(hashDePrueba).integra).toBe(false);
  });

  it('la cadena de una solicitud sin firmas es íntegra pero vacía', () => {
    expect(crear().verificarCadenaFirmas(hashDePrueba)).toEqual({ integra: true, eslabones: 0 });
  });

  it('la semilla depende del contenido de la solicitud', () => {
    expect(crear().semillaCadena(hashDePrueba)).not.toBe(
      crear({ monto: 1_000 }).semillaCadena(hashDePrueba),
    );
  });
});
