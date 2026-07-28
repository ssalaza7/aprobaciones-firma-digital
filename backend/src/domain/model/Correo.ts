import { ErrorValidacion } from '../exception/errores';

/**
 * Objeto de valor: dirección de correo electrónico.
 *
 * Se normaliza a minúsculas para que la comparación de aprobadores duplicados
 * no dependa de cómo el solicitante escribió el correo.
 */
export class Correo {
  private static readonly PATRON = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  private constructor(readonly valor: string) {}

  static de(valor: string | null | undefined, campo = 'correo'): Correo {
    const normalizado = (valor ?? '').trim().toLowerCase();
    if (normalizado.length === 0) {
      throw new ErrorValidacion(`El campo ${campo} es obligatorio`);
    }
    if (normalizado.length > 254 || !Correo.PATRON.test(normalizado)) {
      throw new ErrorValidacion(`El campo ${campo} no tiene un formato válido: "${valor}"`);
    }
    return new Correo(normalizado);
  }

  equals(otro: Correo): boolean {
    return this.valor === otro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
