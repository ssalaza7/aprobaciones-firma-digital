import { CorreoSimulado, NotificadorPort } from '../../../../application/port/out/NotificadorPort';

/**
 * Notificador simulado en memoria.
 *
 * Registra el correo en el log (requisito del enunciado) y lo conserva para
 * exponerlo en `GET /api/mock-mail`. Es el adaptador por defecto en local y en
 * las pruebas.
 */
export class NotificadorEnMemoria implements NotificadorPort {
  private readonly correos: CorreoSimulado[] = [];

  constructor(private readonly maximo = 200) {}

  async enviar(correo: CorreoSimulado): Promise<void> {
    console.info('[mock-mail] Correo simulado', {
      para: correo.para,
      asunto: correo.asunto,
      tipo: correo.contexto.tipo,
      enlace: correo.contexto.enlace,
    });
    this.correos.unshift(correo);
    if (this.correos.length > this.maximo) {
      this.correos.length = this.maximo;
    }
  }

  async bandeja(filtro?: { solicitudId?: string; para?: string }): Promise<CorreoSimulado[]> {
    const para = filtro?.para?.trim().toLowerCase();
    return this.correos.filter(
      (correo) =>
        (!filtro?.solicitudId || correo.contexto.solicitudId === filtro.solicitudId) &&
        (!para || correo.para.toLowerCase() === para),
    );
  }
}
