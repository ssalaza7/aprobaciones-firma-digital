/** Correo simulado tal como lo expone `GET /api/mock-mail`. */
export interface CorreoSimulado {
  id: string;
  para: string;
  asunto: string;
  cuerpo: string;
  enviadoEn: string;
  /** Metadatos útiles para probar sin abrir el "buzón": enlace y OTP. */
  contexto: {
    solicitudId: string;
    tipo: 'INVITACION_APROBACION' | 'CODIGO_OTP' | 'RESULTADO_SOLICITUD';
    enlace?: string;
    otp?: string;
  };
}

/**
 * Puerto de salida de notificaciones.
 *
 * El enunciado permite simular el envío: la implementación por defecto escribe
 * en log y guarda el mensaje para exponerlo en `/api/mock-mail`. Cambiar a SES
 * o SMTP es escribir otro adaptador, sin tocar los casos de uso.
 */
export interface NotificadorPort {
  enviar(correo: CorreoSimulado): Promise<void>;
  /** Buzón simulado, más reciente primero. */
  bandeja(filtro?: { solicitudId?: string; para?: string }): Promise<CorreoSimulado[]>;
}
