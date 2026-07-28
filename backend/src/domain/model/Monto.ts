import { ErrorValidacion } from '../exception/errores';

/**
 * Objeto de valor: monto de la compra.
 *
 * Se guarda en centavos (entero) para no arrastrar los errores de redondeo del
 * punto flotante: 0.1 + 0.2 !== 0.3 también en dinero.
 */
export class Monto {
  private static readonly MAXIMO_CENTAVOS = 999_999_999_999; // ~10 mil millones

  private constructor(
    readonly centavos: number,
    readonly moneda: string,
  ) {}

  static de(valor: number | string | null | undefined, moneda = 'COP'): Monto {
    const numero = typeof valor === 'string' ? Number(valor) : valor;
    if (numero === null || numero === undefined || !Number.isFinite(numero)) {
      throw new ErrorValidacion('El monto debe ser un número');
    }
    if (numero <= 0) {
      throw new ErrorValidacion('El monto debe ser mayor que cero');
    }
    const centavos = Math.round(numero * 100);
    if (Math.abs(numero * 100 - centavos) > 1e-6) {
      throw new ErrorValidacion('El monto admite máximo dos decimales');
    }
    if (centavos > Monto.MAXIMO_CENTAVOS) {
      throw new ErrorValidacion('El monto excede el máximo permitido');
    }
    const monedaNormalizada = (moneda ?? 'COP').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(monedaNormalizada)) {
      throw new ErrorValidacion('La moneda debe ser un código ISO-4217 de 3 letras');
    }
    return new Monto(centavos, monedaNormalizada);
  }

  static desdeCentavos(centavos: number, moneda: string): Monto {
    return Monto.de(centavos / 100, moneda);
  }

  get valor(): number {
    return this.centavos / 100;
  }

  /** Representación para PDF y UI: "$ 1.250.000,00 COP". */
  formatear(): string {
    const formateado = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.valor);
    return `$ ${formateado} ${this.moneda}`;
  }
}
