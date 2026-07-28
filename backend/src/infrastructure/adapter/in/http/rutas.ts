import { ROLES_APROBADOR, etiquetaRol } from '../../../../domain/model/RolAprobador';
import { ControladorAprobaciones } from './ControladorAprobaciones';
import { ControladorSolicitudes } from './ControladorSolicitudes';
import { Enrutador, Ruta } from './enrutador';
import { json } from './tipos';

/**
 * Tabla de rutas de la API REST. Es la vista de conjunto del contrato público
 * y debe coincidir con `docs/openapi.yaml`.
 */
export function construirEnrutador(
  solicitudes: ControladorSolicitudes,
  aprobaciones: ControladorAprobaciones,
): Enrutador {
  const rutas: Ruta[] = [
    { metodo: 'GET', patron: '/api/salud', controlador: async () => json(200, { estado: 'OK' }) },
    {
      metodo: 'GET',
      patron: '/api/roles',
      controlador: async () =>
        json(
          200,
          ROLES_APROBADOR.map((rol) => ({ rol, etiqueta: etiquetaRol(rol) })),
        ),
    },

    { metodo: 'POST', patron: '/api/solicitudes', controlador: solicitudes.crearSolicitud },
    { metodo: 'GET', patron: '/api/solicitudes', controlador: solicitudes.listarSolicitudes },
    { metodo: 'GET', patron: '/api/solicitudes/:id', controlador: solicitudes.obtenerSolicitud },
    {
      metodo: 'GET',
      patron: '/api/solicitudes/:id/evidencia.pdf',
      controlador: solicitudes.descargarEvidencia,
    },

    { metodo: 'POST', patron: '/api/aprobaciones/otp', controlador: aprobaciones.solicitarOtp },
    {
      metodo: 'POST',
      patron: '/api/aprobaciones/otp/validar',
      controlador: aprobaciones.validarOtp,
    },
    {
      metodo: 'POST',
      patron: '/api/aprobaciones/decision',
      controlador: aprobaciones.registrarDecision,
    },

    { metodo: 'GET', patron: '/api/mock-mail', controlador: aprobaciones.consultarBandeja },
  ];

  return new Enrutador(rutas);
}
