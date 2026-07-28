import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  Cargando,
  ErrorDeApi,
  Estado,
  formatearFecha,
  MensajeError,
  Progreso,
  Solicitud,
} from '@aprobaciones/shared';

export interface PropiedadesPanel {
  onAbrir?: (solicitudId: string) => void;
  onNueva?: () => void;
}

/**
 * Panel del solicitante: listado de solicitudes con su avance de firmas.
 *
 * Permite filtrar por correo porque el ejercicio no incluye autenticación:
 * es el sustituto explícito de "mis solicitudes" (ver README, Supuestos).
 */
export default function PanelSolicitudes({ onAbrir, onNueva }: PropiedadesPanel): JSX.Element {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (correo?: string) => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await api.listarSolicitudes(correo || undefined);
      setSolicitudes(respuesta.solicitudes);
    } catch (fallo) {
      setError((fallo as ErrorDeApi).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Solicitudes de compra</h1>
        <p>Estado de aprobación de cada solicitud y su evidencia firmada.</p>
      </div>

      <div className="acciones" style={{ marginBottom: 18 }}>
        <button type="button" className="boton" onClick={() => onNueva?.()}>
          Nueva solicitud
        </button>
        <input
          aria-label="Filtrar por correo del solicitante"
          placeholder="Filtrar por correo del solicitante"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--borde)', minWidth: 260 }}
        />
        <button type="button" className="boton boton--secundario" onClick={() => void cargar(filtro)}>
          Filtrar
        </button>
        {filtro && (
          <button
            type="button"
            className="boton boton--texto"
            onClick={() => {
              setFiltro('');
              void cargar();
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      <MensajeError error={error} onReintentar={() => void cargar(filtro)} />

      {cargando ? (
        <Cargando texto="Cargando solicitudes…" />
      ) : solicitudes.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Todavía no hay solicitudes registradas.</p>
          <button type="button" className="boton" onClick={() => onNueva?.()}>
            Crear la primera
          </button>
        </div>
      ) : (
        <div className="lista-solicitudes">
          {solicitudes.map((solicitud) => (
            <a
              key={solicitud.id}
              href={`#/solicitudes/${solicitud.id}`}
              className="item-solicitud"
              onClick={(evento) => {
                evento.preventDefault();
                onAbrir?.(solicitud.id);
              }}
            >
              <div className="item-solicitud__fila">
                <h3>{solicitud.titulo}</h3>
                <Estado valor={solicitud.estado} />
              </div>
              <p className="item-solicitud__meta">
                {solicitud.monto.formateado} · {solicitud.solicitante.nombre} ·{' '}
                {formatearFecha(solicitud.creadaEn)}
              </p>
              <div className="item-solicitud__fila">
                <Progreso
                  firmadas={solicitud.firmasRegistradas}
                  total={solicitud.aprobadoresRequeridos}
                />
                {solicitud.evidenciaDisponible && <span className="estado estado--completada">PDF listo</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
