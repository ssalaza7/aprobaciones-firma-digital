import { BandejaSimuladaUseCase } from '../port/in/BandejaSimuladaUseCase';
import { CorreoSimulado, NotificadorPort } from '../port/out/NotificadorPort';

/** Caso de uso: leer el buzón simulado que respalda `/api/mock-mail`. */
export class ServicioBandejaSimulada implements BandejaSimuladaUseCase {
  constructor(private readonly notificador: NotificadorPort) {}

  consultar(filtro?: { solicitudId?: string; para?: string }): Promise<CorreoSimulado[]> {
    return this.notificador.bandeja(filtro);
  }
}
