import { ErrorRecursoNoEncontrado } from '../../domain/exception/errores';
import { aVistaSolicitud, VistaSolicitud } from '../dto/vistas';
import { ConsultarSolicitudesUseCase } from '../port/in/ConsultarSolicitudesUseCase';
import { RepositorioSolicitudesPort } from '../port/out/RepositorioSolicitudesPort';

/** Caso de uso de lectura para el panel del solicitante. */
export class ServicioConsultarSolicitudes implements ConsultarSolicitudesUseCase {
  constructor(private readonly repositorio: RepositorioSolicitudesPort) {}

  async listar(filtro?: { correoSolicitante?: string }): Promise<VistaSolicitud[]> {
    const solicitudes = await this.repositorio.listar(filtro);
    return solicitudes
      .sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime())
      .map(aVistaSolicitud);
  }

  async porId(id: string): Promise<VistaSolicitud> {
    const solicitud = await this.repositorio.buscarPorId(id);
    if (!solicitud) {
      throw new ErrorRecursoNoEncontrado(`No existe la solicitud ${id}`);
    }
    return aVistaSolicitud(solicitud);
  }
}
