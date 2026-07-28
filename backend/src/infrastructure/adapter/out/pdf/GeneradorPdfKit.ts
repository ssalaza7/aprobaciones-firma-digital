import PDFDocument from 'pdfkit';
import { GeneradorPdfPort } from '../../../../application/port/out/GeneradorPdfPort';
import { CalculadorHash } from '../../../../domain/model/CalculadorHash';
import { etiquetaRol } from '../../../../domain/model/RolAprobador';
import { Solicitud } from '../../../../domain/model/Solicitud';

const MARGEN = 48;
const ANCHO_PAGINA = 595.28; // A4 en puntos
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

const GRIS = '#5b6472';
const TINTA = '#12203a';
const BORDE = '#d5dbe4';
const ACENTO = '#1d4ed8';

/**
 * Adaptador de generación de PDF con pdfkit.
 *
 * pdfkit es JavaScript puro (sin binarios nativos), lo que evita problemas de
 * empaquetado en Lambda. Se dibuja a mano en lugar de renderizar HTML para no
 * arrastrar un navegador headless a la función.
 */
export class GeneradorPdfKit implements GeneradorPdfPort {
  /**
   * @param comprimir Desactivarlo deja el texto legible dentro del archivo;
   *   se usa en las pruebas para poder afirmar sobre el contenido del PDF.
   */
  constructor(
    private readonly hash: CalculadorHash,
    private readonly comprimir = true,
  ) {}

  generarEvidencia(solicitud: Solicitud): Promise<Buffer> {
    return new Promise((resolver, rechazar) => {
      try {
        const documento = new PDFDocument({
          size: 'A4',
          margin: MARGEN,
          compress: this.comprimir,
          info: {
            Title: `Evidencia de aprobación - ${solicitud.titulo}`,
            Author: 'Flujo de aprobaciones con firma digital',
            Subject: `Solicitud ${solicitud.id}`,
          },
        });

        const partes: Buffer[] = [];
        documento.on('data', (parte: Buffer) => partes.push(parte));
        documento.on('error', rechazar);
        documento.on('end', () => resolver(Buffer.concat(partes)));

        this.dibujar(documento, solicitud);
        documento.end();
      } catch (error) {
        rechazar(error as Error);
      }
    });
  }

  private dibujar(doc: PDFKit.PDFDocument, solicitud: Solicitud): void {
    const verificacion = solicitud.verificarCadenaFirmas(this.hash);

    this.encabezado(doc, solicitud);
    this.datosSolicitud(doc, solicitud);
    this.tablaFirmas(doc, solicitud);
    this.cadena(doc, solicitud, verificacion.integra);
    this.pie(doc, solicitud);
  }

  private encabezado(doc: PDFKit.PDFDocument, solicitud: Solicitud): void {
    doc.rect(0, 0, ANCHO_PAGINA, 92).fill(TINTA);
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('Evidencia de aprobación', MARGEN, 30);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#c3cede')
      .text('Firma digital concatenada · documento generado automáticamente', MARGEN, 56);
    doc
      .fontSize(9)
      .text(`Solicitud ${solicitud.id}`, MARGEN, 72, { width: ANCHO_UTIL });
    doc.fillColor(TINTA).y = 120;
  }

  private datosSolicitud(doc: PDFKit.PDFDocument, solicitud: Solicitud): void {
    this.titulo(doc, 'Datos de la solicitud');

    const filas: Array<[string, string]> = [
      ['Título', solicitud.titulo],
      ['Descripción', solicitud.descripcion],
      ['Monto', solicitud.monto.formatear()],
      ['Fecha de creación', formatearFecha(solicitud.creadaEn)],
      ['Solicitante', `${solicitud.solicitante.nombre} <${solicitud.solicitante.correo.valor}>`],
      ['Estado', solicitud.estado],
    ];

    doc.fontSize(10);
    for (const [etiqueta, valor] of filas) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fillColor(GRIS).text(etiqueta, MARGEN, y, { width: 120 });
      doc
        .font('Helvetica')
        .fillColor(TINTA)
        .text(valor, MARGEN + 130, y, { width: ANCHO_UTIL - 130 });
      doc.moveDown(0.45);
    }
    doc.moveDown(0.8);
  }

  private tablaFirmas(doc: PDFKit.PDFDocument, solicitud: Solicitud): void {
    this.titulo(doc, 'Aprobadores y firmas');

    const columnas = [
      { etiqueta: 'Rol', ancho: 92 },
      { etiqueta: 'Aprobador', ancho: 150 },
      { etiqueta: 'Estado', ancho: 66 },
      { etiqueta: 'Fecha y hora', ancho: 110 },
      { etiqueta: 'Firma', ancho: ANCHO_UTIL - 92 - 150 - 66 - 110 },
    ];

    let y = doc.y;
    doc.rect(MARGEN, y, ANCHO_UTIL, 22).fill('#eef2f8');
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(9);
    let x = MARGEN;
    for (const columna of columnas) {
      doc.text(columna.etiqueta, x + 6, y + 7, { width: columna.ancho - 12 });
      x += columna.ancho;
    }
    y += 22;

    for (const aprobador of solicitud.aprobadores) {
      const firma = aprobador.firma;
      const alto = 46;
      doc.rect(MARGEN, y, ANCHO_UTIL, alto).lineWidth(0.5).stroke(BORDE);

      x = MARGEN;
      doc.font('Helvetica').fontSize(9).fillColor(TINTA);
      doc.text(etiquetaRol(aprobador.rol), x + 6, y + 8, { width: columnas[0].ancho - 12 });
      x += columnas[0].ancho;

      doc.text(aprobador.nombre, x + 6, y + 8, { width: columnas[1].ancho - 12 });
      doc
        .fontSize(7.5)
        .fillColor(GRIS)
        .text(aprobador.correo.valor, x + 6, y + 22, { width: columnas[1].ancho - 12 });
      x += columnas[1].ancho;

      doc
        .fontSize(9)
        .fillColor(colorEstado(aprobador.estado))
        .font('Helvetica-Bold')
        .text(aprobador.estado, x + 6, y + 8, { width: columnas[2].ancho - 12 });
      x += columnas[2].ancho;

      const momento = aprobador.decididoEn;
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(TINTA)
        .text(momento ? formatearFecha(momento) : '—', x + 6, y + 8, {
          width: columnas[3].ancho - 12,
        });
      x += columnas[3].ancho;

      if (firma) {
        // Firma simulada: el trazo en cursiva sobre una línea, como en papel.
        doc
          .font('Helvetica-BoldOblique')
          .fontSize(13)
          .fillColor(ACENTO)
          .text(firma.trazo, x + 6, y + 6, { width: columnas[4].ancho - 12 });
        doc
          .moveTo(x + 6, y + 27)
          .lineTo(x + columnas[4].ancho - 10, y + 27)
          .lineWidth(0.5)
          .stroke(BORDE);
        doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor(GRIS)
          .text(`#${firma.secuencia} · ${firma.hash.slice(0, 24)}…`, x + 6, y + 31, {
            width: columnas[4].ancho - 12,
          });
      } else {
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor(GRIS)
          .text('Sin firma', x + 6, y + 18, { width: columnas[4].ancho - 12 });
      }

      y += alto;
    }

    doc.y = y + 18;
    doc.x = MARGEN;
  }

  private cadena(doc: PDFKit.PDFDocument, solicitud: Solicitud, integra: boolean): void {
    this.titulo(doc, 'Cadena de firmas');
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(GRIS)
      .text(
        'Cada firma incluye el hash SHA-256 de la anterior. La primera se ancla al contenido de la solicitud, ' +
          'de modo que modificar los datos o el orden invalida toda la cadena.',
        MARGEN,
        doc.y,
        { width: ANCHO_UTIL },
      );
    doc.moveDown(0.6);

    doc.font('Courier').fontSize(7.5).fillColor(TINTA);
    doc.text(`semilla  ${solicitud.semillaCadena(this.hash)}`, { width: ANCHO_UTIL });
    for (const firma of solicitud.firmasEnOrden) {
      doc.text(`firma ${firma.secuencia}  ${firma.hash}`, { width: ANCHO_UTIL });
    }
    doc.moveDown(0.5);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(integra ? '#116b3a' : '#a3221f')
      // Sin glifos fuera de WinAnsi: las fuentes base de PDF no los tienen y
      // saldrían como un carácter cualquiera.
      .text(
        integra
          ? 'Cadena verificada: las firmas son consistentes con el contenido de la solicitud.'
          : 'La cadena no pudo verificarse: la evidencia no es confiable.',
        { width: ANCHO_UTIL },
      );
    doc.moveDown(1);
  }

  private pie(doc: PDFKit.PDFDocument, solicitud: Solicitud): void {
    const y = 780;
    doc.moveTo(MARGEN, y).lineTo(ANCHO_PAGINA - MARGEN, y).lineWidth(0.5).stroke(BORDE);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(GRIS)
      .text(
        `Documento generado el ${formatearFecha(new Date(solicitud.evidencia?.generadaEn ?? Date.now()))} · Solicitud ${solicitud.id}`,
        MARGEN,
        y + 8,
        { width: ANCHO_UTIL, align: 'center' },
      );
  }

  private titulo(doc: PDFKit.PDFDocument, texto: string): void {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA).text(texto, MARGEN, doc.y);
    doc.moveDown(0.5);
  }
}

function colorEstado(estado: string): string {
  if (estado === 'FIRMADO') return '#116b3a';
  if (estado === 'RECHAZADO') return '#a3221f';
  return '#8a6d1f';
}

function formatearFecha(fecha: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'America/Bogota',
  }).format(fecha);
}
