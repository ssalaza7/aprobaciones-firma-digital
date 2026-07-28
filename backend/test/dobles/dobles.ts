import {
  GeneradorIdentificadoresPort,
  RelojPort,
} from '../../src/application/port/out/SistemaPorts';
import { CalculadorHash } from '../../src/domain/model/CalculadorHash';

/** Reloj controlado: hace que la expiración del OTP sea comprobable sin esperar. */
export class RelojFalso implements RelojPort {
  constructor(private instante: Date = new Date('2026-03-10T14:00:00.000Z')) {}

  ahora(): Date {
    return new Date(this.instante);
  }

  avanzar(milisegundos: number): void {
    this.instante = new Date(this.instante.getTime() + milisegundos);
  }

  fijar(instante: Date): void {
    this.instante = new Date(instante);
  }
}

/** Identificadores deterministas: los tokens del test son predecibles. */
export class GeneradorSecuencial implements GeneradorIdentificadoresPort {
  private contadorUuid = 0;
  private contadorOtp = 0;

  uuid(): string {
    this.contadorUuid += 1;
    return `id-${String(this.contadorUuid).padStart(4, '0')}`;
  }

  otp(): string {
    this.contadorOtp += 1;
    return String(100000 + this.contadorOtp);
  }
}

/**
 * Hash trivial pero sensible al contenido: sirve para verificar el encadenado
 * sin depender de SHA-256 (que se prueba aparte en el adaptador real).
 */
export const hashDePrueba: CalculadorHash = (contenido: string): string => {
  let acumulado = 0;
  for (let i = 0; i < contenido.length; i += 1) {
    acumulado = (acumulado * 31 + contenido.charCodeAt(i)) >>> 0;
  }
  return `h${acumulado.toString(16).padStart(8, '0')}`;
};

export const comandoValido = () => ({
  titulo: 'Compra de 15 portátiles',
  descripcion: 'Renovación del parque de equipos del área de operaciones para el segundo semestre',
  monto: 45_000_000,
  moneda: 'COP',
  solicitante: { nombre: 'Ana Restrepo', correo: 'ana.restrepo@empresa.com' },
  aprobadores: [
    { nombre: 'Carlos Pérez', correo: 'carlos.perez@empresa.com', rol: 'JEFE_AREA' },
    { nombre: 'Diana Gómez', correo: 'diana.gomez@empresa.com', rol: 'FINANZAS' },
    { nombre: 'Esteban Ruiz', correo: 'esteban.ruiz@empresa.com', rol: 'GERENCIA' },
  ],
});
