/**
 * Puertos de salida para las dos fuentes de indeterminismo del flujo: el reloj
 * y el generador de identificadores/códigos.
 *
 * Inyectarlos es lo que permite probar la expiración del OTP a los 3 minutos
 * sin esperar 3 minutos, y afirmar sobre tokens conocidos.
 */
export interface RelojPort {
  ahora(): Date;
}

export interface GeneradorIdentificadoresPort {
  /** UUID v4 para ids de solicitud, aprobador, token de enlace y de sesión. */
  uuid(): string;
  /** Código numérico de 6 dígitos para el OTP. */
  otp(): string;
}
