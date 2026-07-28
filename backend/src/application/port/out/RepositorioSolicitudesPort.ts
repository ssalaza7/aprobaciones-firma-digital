import { Solicitud } from '../../../domain/model/Solicitud';

/**
 * Puerto de salida hacia la persistencia del agregado `Solicitud`.
 *
 * Lo implementan DynamoDB (producción) y un adaptador en memoria (pruebas y
 * ejecución local). El caso de uso no sabe cuál de los dos está detrás.
 */
export interface RepositorioSolicitudesPort {
  /** Inserta una solicitud nueva. Falla si el id ya existe. */
  crear(solicitud: Solicitud): Promise<void>;

  /**
   * Guarda cambios sobre una solicitud existente usando bloqueo optimista:
   * si otro proceso la modificó, lanza `ErrorConcurrencia`.
   */
  actualizar(solicitud: Solicitud): Promise<Solicitud>;

  buscarPorId(id: string): Promise<Solicitud | null>;

  /** Resuelve el enlace del aprobador (token único) a su solicitud. */
  buscarPorTokenAprobador(token: string): Promise<Solicitud | null>;

  /** Listado para el panel del solicitante; sin filtro devuelve todas. */
  listar(filtro?: { correoSolicitante?: string }): Promise<Solicitud[]>;
}
