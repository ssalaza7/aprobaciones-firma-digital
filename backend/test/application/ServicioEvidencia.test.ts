import { ErrorRecursoNoEncontrado, ErrorTransicionInvalida } from '../../src/domain/exception/errores';
import { ServicioEvidencia } from '../../src/application/service/ServicioEvidencia';
import { comandoValido } from '../dobles/dobles';
import { crearEntorno, decidir, Entorno } from '../dobles/entorno';

describe('ServicioEvidencia', () => {
  let entorno: Entorno;
  let solicitudId: string;
  let tokens: string[];

  const firmarTodo = async () => {
    for (const token of tokens) {
      await decidir(entorno, solicitudId, token, 'APROBAR');
    }
  };

  beforeEach(async () => {
    entorno = crearEntorno();
    const resultado = await entorno.crear.ejecutar(comandoValido());
    solicitudId = resultado.solicitud.id;
    tokens = resultado.enlacesAprobacion.map(
      ({ enlace }) => new URL(enlace).searchParams.get('approver_token') as string,
    );
  });

  it('entrega el PDF una vez completadas las tres firmas', async () => {
    await firmarTodo();

    const documento = await entorno.evidencia.descargar(solicitudId);

    expect(documento.contentType).toBe('application/pdf');
    expect(documento.nombreArchivo).toBe(`evidencia-${solicitudId}.pdf`);
    expect(documento.contenido.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('no genera evidencia mientras falten firmas', async () => {
    await decidir(entorno, solicitudId, tokens[0], 'APROBAR');
    await expect(entorno.evidencia.descargar(solicitudId)).rejects.toThrow(ErrorTransicionInvalida);
  });

  it('falla con una solicitud inexistente', async () => {
    await expect(entorno.evidencia.descargar('no-existe')).rejects.toThrow(ErrorRecursoNoEncontrado);
  });

  it('dibuja el PDF con la solicitud ya cerrada, no con el estado anterior', async () => {
    await firmarTodo();

    // La evidencia es el documento oficial del cierre: si dijera PENDIENTE,
    // contradiría al propio flujo que certifica.
    expect(entorno.generadorPdf.estadosRecibidos).toEqual(['COMPLETADA']);
  });

  it('no regenera el PDF en descargas sucesivas', async () => {
    await firmarTodo();
    await entorno.evidencia.descargar(solicitudId);
    await entorno.evidencia.descargar(solicitudId);

    expect(entorno.generadorPdf.llamadas).toBe(1);
  });

  it('reconstruye el PDF si el objeto desapareció del almacén', async () => {
    await firmarTodo();
    entorno.almacen.documentos.clear();

    const documento = await entorno.evidencia.descargar(solicitudId);

    expect(documento.contenido.length).toBeGreaterThan(0);
    expect(entorno.generadorPdf.llamadas).toBe(2);
  });

  it('reintenta la generación fallida en la primera descarga', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    entorno.generadorPdf.fallar = true;
    await firmarTodo();
    expect((await entorno.consultar.porId(solicitudId)).estado).toBe('PENDIENTE');

    entorno.generadorPdf.fallar = false;
    await entorno.evidencia.descargar(solicitudId);

    expect((await entorno.consultar.porId(solicitudId)).estado).toBe('COMPLETADA');
  });

  it('usa una clave de almacenamiento estable por solicitud', () => {
    expect(ServicioEvidencia.claveDe('abc')).toBe('evidencias/abc/evidencia.pdf');
  });
});
