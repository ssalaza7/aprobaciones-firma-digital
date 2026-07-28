/**
 * Extrae el texto visible de un PDF generado sin compresión.
 *
 * pdfkit escribe las cadenas como hexadecimal dentro de operadores `TJ`, con
 * cortes de kerning. Reconstruirlas permite afirmar sobre el contenido real
 * del documento en lugar de conformarse con "empieza por %PDF".
 */
export function extraerTextoPdf(pdf: Buffer): string {
  const contenido = pdf.toString('latin1');
  const bloques: string[] = [];
  const operadores = /\[([^\]]*)\]\s*TJ/g;

  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = operadores.exec(contenido)) !== null) {
    const cadenas = coincidencia[1].match(/<([0-9a-fA-F]*)>/g) ?? [];
    bloques.push(
      cadenas
        .map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1'))
        .join(''),
    );
  }

  return bloques.join('\n');
}
