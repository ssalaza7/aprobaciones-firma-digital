import { aRespuestaDeError } from './manejadorErrores';
import { Controlador, MetodoHttp, PeticionHttp, RespuestaHttp } from './tipos';

export interface Ruta {
  metodo: MetodoHttp;
  /** Patrón con segmentos dinámicos, p. ej. `/api/solicitudes/:id`. */
  patron: string;
  controlador: Controlador;
}

interface RutaCompilada extends Ruta {
  segmentos: string[];
}

/**
 * Enrutador propio, deliberadamente pequeño.
 *
 * En Lambda la petición llega ya "enrutada" por API Gateway a un único handler
 * proxy; montar Express dentro del Lambda solo para hacer coincidir rutas
 * añadiría dependencias y arranque en frío sin aportar nada.
 */
export class Enrutador {
  private readonly rutas: RutaCompilada[];

  constructor(rutas: Ruta[]) {
    this.rutas = rutas.map((ruta) => ({ ...ruta, segmentos: partir(ruta.patron) }));
  }

  async resolver(peticion: Omit<PeticionHttp, 'parametrosRuta'>): Promise<RespuestaHttp> {
    const segmentos = partir(peticion.ruta);

    let coincideRuta = false;
    for (const ruta of this.rutas) {
      const parametros = emparejar(ruta.segmentos, segmentos);
      if (!parametros) continue;
      coincideRuta = true;
      if (ruta.metodo !== peticion.metodo) continue;

      try {
        return await ruta.controlador({ ...peticion, parametrosRuta: parametros });
      } catch (error) {
        return aRespuestaDeError(error);
      }
    }

    return coincideRuta
      ? {
          estado: 405,
          cuerpo: { codigo: 'METODO_NO_PERMITIDO', mensaje: `Método ${peticion.metodo} no permitido en ${peticion.ruta}` },
        }
      : {
          estado: 404,
          cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: `No existe el recurso ${peticion.ruta}` },
        };
  }
}

function partir(ruta: string): string[] {
  return ruta.split('/').filter((segmento) => segmento.length > 0);
}

/** Devuelve los parámetros de ruta si el patrón coincide, o null si no. */
function emparejar(patron: string[], ruta: string[]): Record<string, string> | null {
  if (patron.length !== ruta.length) return null;
  const parametros: Record<string, string> = {};
  for (let i = 0; i < patron.length; i += 1) {
    const esperado = patron[i];
    if (esperado.startsWith(':')) {
      parametros[esperado.slice(1)] = decodeURIComponent(ruta[i]);
    } else if (esperado !== ruta[i]) {
      return null;
    }
  }
  return parametros;
}
