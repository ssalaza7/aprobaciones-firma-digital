import { VistaSolicitud } from '../../dto/vistas';

export interface ComandoAprobador {
  nombre: string;
  correo: string;
  rol: string;
}

export interface ComandoCrearSolicitud {
  titulo: string;
  descripcion: string;
  monto: number | string;
  moneda?: string;
  solicitante: { nombre: string; correo: string };
  aprobadores: ComandoAprobador[];
}

export interface ResultadoCrearSolicitud {
  solicitud: VistaSolicitud;
  /**
   * Enlaces generados por aprobador. Se devuelven para facilitar la prueba del
   * flujo sin abrir el buzón simulado; en producción solo viajarían por correo.
   */
  enlacesAprobacion: Array<{ rol: string; correo: string; enlace: string }>;
}

/** Puerto de entrada: alta de una solicitud de compra con sus tres aprobadores. */
export interface CrearSolicitudUseCase {
  ejecutar(comando: ComandoCrearSolicitud): Promise<ResultadoCrearSolicitud>;
}
