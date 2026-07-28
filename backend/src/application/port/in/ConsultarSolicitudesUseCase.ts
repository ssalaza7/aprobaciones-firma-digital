import { VistaSolicitud } from '../../dto/vistas';

/** Puerto de entrada: panel del solicitante (listado y detalle). */
export interface ConsultarSolicitudesUseCase {
  listar(filtro?: { correoSolicitante?: string }): Promise<VistaSolicitud[]>;
  porId(id: string): Promise<VistaSolicitud>;
}
