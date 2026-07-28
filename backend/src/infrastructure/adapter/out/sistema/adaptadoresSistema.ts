import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  GeneradorIdentificadoresPort,
  RelojPort,
} from '../../../../application/port/out/SistemaPorts';
import { CalculadorHash } from '../../../../domain/model/CalculadorHash';

/** Reloj del sistema. En pruebas se sustituye por uno controlado. */
export class RelojSistema implements RelojPort {
  ahora(): Date {
    return new Date();
  }
}

/**
 * Identificadores y códigos.
 *
 * El OTP usa `randomInt` (CSPRNG) y no `Math.random`: aunque el flujo sea una
 * simulación, un código adivinable haría inútil la validación.
 */
export class GeneradorIdentificadoresCrypto implements GeneradorIdentificadoresPort {
  uuid(): string {
    return randomUUID();
  }

  otp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }
}

/** Implementación SHA-256 del servicio de dominio que encadena las firmas. */
export const sha256: CalculadorHash = (contenido: string): string =>
  createHash('sha256').update(contenido, 'utf8').digest('hex');
