import { CorreoSimulado } from '../out/NotificadorPort';

/** Puerto de entrada: buzón simulado que expone `/api/mock-mail`. */
export interface BandejaSimuladaUseCase {
  consultar(filtro?: { solicitudId?: string; para?: string }): Promise<CorreoSimulado[]>;
}
