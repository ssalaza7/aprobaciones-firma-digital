import { ErrorValidacion } from '../../../../domain/exception/errores';
import { ConsultarSolicitudesUseCase } from '../../../../application/port/in/ConsultarSolicitudesUseCase';
import {
  ComandoCrearSolicitud,
  CrearSolicitudUseCase,
} from '../../../../application/port/in/CrearSolicitudUseCase';
import { EvidenciaUseCase } from '../../../../application/port/in/EvidenciaUseCase';
import { json, PeticionHttp, RespuestaHttp } from './tipos';

/**
 * Adaptador de entrada web para el rol Solicitante.
 *
 * Su única responsabilidad es traducir HTTP ↔ comandos de la capa de
 * aplicación. Ninguna regla de negocio vive aquí.
 */
export class ControladorSolicitudes {
  constructor(
    private readonly crear: CrearSolicitudUseCase,
    private readonly consultar: ConsultarSolicitudesUseCase,
    private readonly evidencia: EvidenciaUseCase,
  ) {}

  crearSolicitud = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const cuerpo = comoObjeto(peticion.cuerpo);
    const comando: ComandoCrearSolicitud = {
      titulo: texto(cuerpo.titulo),
      descripcion: texto(cuerpo.descripcion),
      monto: cuerpo.monto as number | string,
      moneda: cuerpo.moneda ? texto(cuerpo.moneda) : undefined,
      solicitante: {
        nombre: texto(comoObjeto(cuerpo.solicitante, 'solicitante').nombre),
        correo: texto(comoObjeto(cuerpo.solicitante, 'solicitante').correo),
      },
      aprobadores: comoLista(cuerpo.aprobadores, 'aprobadores').map((item, indice) => {
        const aprobador = comoObjeto(item, `aprobadores[${indice}]`);
        return {
          nombre: texto(aprobador.nombre),
          correo: texto(aprobador.correo),
          rol: texto(aprobador.rol),
        };
      }),
    };

    const resultado = await this.crear.ejecutar(comando);
    return {
      estado: 201,
      cuerpo: resultado,
      encabezados: { Location: `/api/solicitudes/${resultado.solicitud.id}` },
    };
  };

  listarSolicitudes = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const correoSolicitante = peticion.query.solicitante?.trim();
    const solicitudes = await this.consultar.listar(
      correoSolicitante ? { correoSolicitante } : undefined,
    );
    return json(200, { total: solicitudes.length, solicitudes });
  };

  obtenerSolicitud = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    return json(200, await this.consultar.porId(peticion.parametrosRuta.id));
  };

  descargarEvidencia = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const documento = await this.evidencia.descargar(peticion.parametrosRuta.id);
    return {
      estado: 200,
      binario: documento.contenido,
      contentType: documento.contentType,
      encabezados: {
        'Content-Disposition': `attachment; filename="${documento.nombreArchivo}"`,
      },
    };
  };
}

export function comoObjeto(valor: unknown, campo = 'cuerpo'): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorValidacion(`El campo ${campo} debe ser un objeto`);
  }
  return valor as Record<string, unknown>;
}

export function comoLista(valor: unknown, campo: string): unknown[] {
  if (!Array.isArray(valor)) {
    throw new ErrorValidacion(`El campo ${campo} debe ser una lista`);
  }
  return valor;
}

export function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : valor === undefined || valor === null ? '' : String(valor);
}
