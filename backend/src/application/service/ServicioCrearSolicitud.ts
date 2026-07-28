import { Aprobador } from '../../domain/model/Aprobador';
import { etiquetaRol } from '../../domain/model/RolAprobador';
import { Solicitud } from '../../domain/model/Solicitud';
import { aVistaSolicitud } from '../dto/vistas';
import {
  ComandoCrearSolicitud,
  CrearSolicitudUseCase,
  ResultadoCrearSolicitud,
} from '../port/in/CrearSolicitudUseCase';
import { NotificadorPort } from '../port/out/NotificadorPort';
import { RepositorioSolicitudesPort } from '../port/out/RepositorioSolicitudesPort';
import { GeneradorIdentificadoresPort, RelojPort } from '../port/out/SistemaPorts';

/**
 * Caso de uso: crear la solicitud, generar el token único de cada aprobador y
 * disparar la notificación con el enlace de aprobación.
 *
 * No valida nada por su cuenta: delega en el agregado `Solicitud`, que es quien
 * conoce las reglas (tres roles distintos, monto positivo, etc.).
 */
export class ServicioCrearSolicitud implements CrearSolicitudUseCase {
  constructor(
    private readonly repositorio: RepositorioSolicitudesPort,
    private readonly notificador: NotificadorPort,
    private readonly reloj: RelojPort,
    private readonly identificadores: GeneradorIdentificadoresPort,
    private readonly urlBaseFrontend: string,
  ) {}

  async ejecutar(comando: ComandoCrearSolicitud): Promise<ResultadoCrearSolicitud> {
    const ahora = this.reloj.ahora();
    const id = this.identificadores.uuid();

    const solicitud = Solicitud.crear({
      id,
      titulo: comando.titulo,
      descripcion: comando.descripcion,
      monto: comando.monto,
      moneda: comando.moneda,
      solicitante: comando.solicitante,
      aprobadores: (comando.aprobadores ?? []).map((a) => ({
        id: this.identificadores.uuid(),
        nombre: a?.nombre,
        correo: a?.correo,
        rol: a?.rol,
        token: this.identificadores.uuid(),
      })),
      creadaEn: ahora,
    });

    await this.repositorio.crear(solicitud);

    const enlaces = solicitud.aprobadores.map((aprobador) => ({
      rol: aprobador.rol,
      correo: aprobador.correo.valor,
      enlace: this.enlaceDe(solicitud, aprobador),
    }));

    // El envío es simulado; si fallara no debe tumbar la creación, porque el
    // enlace se puede reenviar desde el buzón o desde la respuesta.
    await Promise.all(
      solicitud.aprobadores.map((aprobador) =>
        this.notificador
          .enviar({
            id: this.identificadores.uuid(),
            para: aprobador.correo.valor,
            asunto: `[Aprobaciones] Su firma es requerida: ${solicitud.titulo}`,
            cuerpo: cuerpoInvitacion(solicitud, aprobador, this.enlaceDe(solicitud, aprobador)),
            enviadoEn: ahora.toISOString(),
            contexto: {
              solicitudId: solicitud.id,
              tipo: 'INVITACION_APROBACION',
              enlace: this.enlaceDe(solicitud, aprobador),
            },
          })
          .catch((error) => {
            console.error('No se pudo simular el envío de la invitación', {
              solicitudId: solicitud.id,
              aprobador: aprobador.correo.valor,
              error,
            });
          }),
      ),
    );

    return { solicitud: aVistaSolicitud(solicitud), enlacesAprobacion: enlaces };
  }

  private enlaceDe(solicitud: Solicitud, aprobador: Aprobador): string {
    const base = this.urlBaseFrontend.replace(/\/+$/, '');
    return `${base}/approve?solicitud_id=${solicitud.id}&approver_token=${aprobador.token}`;
  }
}

function cuerpoInvitacion(solicitud: Solicitud, aprobador: Aprobador, enlace: string): string {
  return [
    `Hola ${aprobador.nombre},`,
    '',
    `${solicitud.solicitante.nombre} creó la solicitud de compra "${solicitud.titulo}" por ${solicitud.monto.formatear()} y requiere su firma como ${etiquetaRol(aprobador.rol)}.`,
    '',
    `Para revisarla y firmar, abra este enlace: ${enlace}`,
    '',
    'Al abrirlo se le enviará un código de un solo uso, válido por 3 minutos.',
  ].join('\n');
}
