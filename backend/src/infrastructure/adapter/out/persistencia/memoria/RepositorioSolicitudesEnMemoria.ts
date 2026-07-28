import { RepositorioSolicitudesPort } from '../../../../../application/port/out/RepositorioSolicitudesPort';
import { ErrorConcurrencia, ErrorValidacion } from '../../../../../domain/exception/errores';
import { InstantaneaSolicitud, Solicitud } from '../../../../../domain/model/Solicitud';

/**
 * Adaptador de persistencia en memoria.
 *
 * Se usa en las pruebas y en el modo local sin AWS. Replica el contrato del
 * adaptador de DynamoDB, incluido el bloqueo optimista por versión, para que
 * las pruebas del caso de uso ejerciten el mismo comportamiento.
 */
export class RepositorioSolicitudesEnMemoria implements RepositorioSolicitudesPort {
  private readonly solicitudes = new Map<string, InstantaneaSolicitud>();
  private readonly indiceTokens = new Map<string, string>();

  async crear(solicitud: Solicitud): Promise<void> {
    const instantanea = solicitud.instantanea();
    if (this.solicitudes.has(instantanea.id)) {
      throw new ErrorValidacion(`Ya existe una solicitud con id ${instantanea.id}`);
    }
    this.solicitudes.set(instantanea.id, clonar(instantanea));
    instantanea.aprobadores.forEach((a) => this.indiceTokens.set(a.token, instantanea.id));
  }

  async actualizar(solicitud: Solicitud): Promise<Solicitud> {
    const instantanea = solicitud.instantanea();
    const almacenada = this.solicitudes.get(instantanea.id);
    if (!almacenada) {
      throw new ErrorValidacion(`No existe la solicitud ${instantanea.id}`);
    }
    if (almacenada.version !== instantanea.version) {
      throw new ErrorConcurrencia(
        `La solicitud ${instantanea.id} fue modificada por otro proceso; vuelva a intentarlo`,
      );
    }
    const nueva = { ...clonar(instantanea), version: instantanea.version + 1 };
    this.solicitudes.set(nueva.id, nueva);
    return Solicitud.rehidratar(clonar(nueva));
  }

  async buscarPorId(id: string): Promise<Solicitud | null> {
    const instantanea = this.solicitudes.get(id);
    return instantanea ? Solicitud.rehidratar(clonar(instantanea)) : null;
  }

  async buscarPorTokenAprobador(token: string): Promise<Solicitud | null> {
    const id = this.indiceTokens.get(token);
    return id ? this.buscarPorId(id) : null;
  }

  async listar(filtro?: { correoSolicitante?: string }): Promise<Solicitud[]> {
    const correo = filtro?.correoSolicitante?.trim().toLowerCase();
    return [...this.solicitudes.values()]
      .filter((s) => !correo || s.solicitante.correo === correo)
      .map((s) => Solicitud.rehidratar(clonar(s)));
  }
}

/** Copia profunda para que el llamador no mute el "almacén" por referencia. */
function clonar(instantanea: InstantaneaSolicitud): InstantaneaSolicitud {
  return JSON.parse(JSON.stringify(instantanea)) as InstantaneaSolicitud;
}
