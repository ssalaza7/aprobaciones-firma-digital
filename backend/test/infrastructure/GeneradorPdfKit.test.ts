import { Solicitud } from '../../src/domain/model/Solicitud';
import { GeneradorPdfKit } from '../../src/infrastructure/adapter/out/pdf/GeneradorPdfKit';
import { sha256 } from '../../src/infrastructure/adapter/out/sistema/adaptadoresSistema';
import { hashDePrueba } from '../dobles/dobles';
import { extraerTextoPdf } from '../dobles/pdf';

const AHORA = new Date('2026-03-10T14:00:00.000Z');

const solicitudFirmada = (firmar = true) => {
  const solicitud = Solicitud.crear({
    id: 'sol-1',
    titulo: 'Compra de 15 portátiles',
    descripcion: 'Renovación del parque de equipos del área de operaciones',
    monto: 45_000_000,
    solicitante: { nombre: 'Ana Restrepo', correo: 'ana@empresa.com' },
    aprobadores: [
      { id: 'a1', nombre: 'Carlos Pérez', correo: 'carlos@empresa.com', rol: 'JEFE_AREA', token: 't1' },
      { id: 'a2', nombre: 'Diana Gómez', correo: 'diana@empresa.com', rol: 'FINANZAS', token: 't2' },
      { id: 'a3', nombre: 'Esteban Ruiz', correo: 'esteban@empresa.com', rol: 'GERENCIA', token: 't3' },
    ],
    creadaEn: AHORA,
  });
  if (firmar) {
    solicitud.aprobadores.forEach((aprobador, indice) =>
      solicitud.registrarFirma(aprobador, new Date(AHORA.getTime() + indice * 60_000), sha256),
    );
    solicitud.adjuntarEvidencia('evidencias/sol-1/evidencia.pdf', AHORA);
  }
  return solicitud;
};

describe('GeneradorPdfKit', () => {
  const generador = new GeneradorPdfKit(sha256);

  it('produce un PDF válido y no trivial', async () => {
    const pdf = await generador.generarEvidencia(solicitudFirmada());

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('incluye los datos de la solicitud, los aprobadores y sus firmas', async () => {
    // Sin compresión el texto queda legible dentro del archivo y se puede afirmar sobre él.
    const solicitud = solicitudFirmada();
    const pdf = await new GeneradorPdfKit(sha256, false).generarEvidencia(solicitud);
    const texto = extraerTextoPdf(pdf);

    expect(texto).toContain('Evidencia de aprobación');
    expect(texto).toContain('Compra de 15 portátiles');
    expect(texto).toContain('Renovación del parque de equipos');
    expect(texto).toContain('Ana Restrepo');
    expect(texto).toContain('COP');

    ['Jefe de Área', 'Finanzas', 'Gerencia'].forEach((rol) => expect(texto).toContain(rol));
    ['Carlos Pérez', 'Diana Gómez', 'Esteban Ruiz'].forEach((nombre) =>
      expect(texto).toContain(nombre),
    );
    expect(texto).toContain('Carlos P.'); // trazo de firma simulada
    expect(texto).toContain('Cadena verificada');
    solicitud.firmasEnOrden.forEach((firma) => expect(texto).toContain(firma.hash));
  });

  it('marca la evidencia como no confiable si la cadena fue manipulada', async () => {
    const solicitud = solicitudFirmada();
    const instantanea = solicitud.instantanea();
    instantanea.aprobadores[0].firma!.firmadoEn = '2020-01-01T00:00:00.000Z';

    const pdf = await new GeneradorPdfKit(sha256, false).generarEvidencia(
      Solicitud.rehidratar(instantanea),
    );

    expect(extraerTextoPdf(pdf)).toContain('no pudo verificarse');
  });

  it('muestra "Sin firma" para los aprobadores que aún no deciden', async () => {
    const pdf = await new GeneradorPdfKit(sha256, false).generarEvidencia(solicitudFirmada(false));
    expect(extraerTextoPdf(pdf)).toContain('Sin firma');
  });

  it('también genera el documento con firmas pendientes', async () => {
    const pdf = await generador.generarEvidencia(solicitudFirmada(false));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('usa el calculador de hash inyectado para verificar la cadena', async () => {
    const espia = jest.fn(hashDePrueba);
    await new GeneradorPdfKit(espia).generarEvidencia(solicitudFirmada());
    expect(espia).toHaveBeenCalled();
  });

  it('propaga el error si la generación falla', async () => {
    const solicitudRota = {
      verificarCadenaFirmas: () => {
        throw new Error('fallo al verificar');
      },
    } as unknown as Solicitud;

    await expect(generador.generarEvidencia(solicitudRota)).rejects.toThrow('fallo al verificar');
  });
});
