import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  Cargando,
  CorreoSimulado,
  ErrorDeApi,
  Estado,
  formatearFecha,
  MensajeError,
  Progreso,
  Solicitud,
} from '@aprobaciones/shared';

export interface PropiedadesDetalle {
  solicitudId: string;
  onVolver?: () => void;
}

/**
 * Detalle de una solicitud: datos, estado por aprobador con fecha de firma o
 * rechazo, y descarga del PDF cuando el flujo está completo.
 */
export default function DetalleSolicitud({ solicitudId, onVolver }: PropiedadesDetalle): JSX.Element {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [correos, setCorreos] = useState<CorreoSimulado[]>([]);
  const [verBuzon, setVerBuzon] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setSolicitud(await api.obtenerSolicitud(solicitudId));
    } catch (fallo) {
      setError((fallo as ErrorDeApi).message);
    } finally {
      setCargando(false);
    }
  }, [solicitudId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternarBuzon = async () => {
    if (!verBuzon) {
      try {
        setCorreos((await api.bandeja(solicitudId)).correos);
      } catch (fallo) {
        setError((fallo as ErrorDeApi).message);
        return;
      }
    }
    setVerBuzon((previo) => !previo);
  };

  if (cargando) return <Cargando texto="Cargando la solicitud…" />;

  if (error || !solicitud) {
    return (
      <section>
        <MensajeError error={error ?? 'No se encontró la solicitud'} onReintentar={() => void cargar()} />
        <button type="button" className="boton boton--secundario" onClick={() => onVolver?.()}>
          Volver al panel
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="encabezado-pagina">
        <button type="button" className="boton--texto boton" onClick={() => onVolver?.()}>
          ← Volver al panel
        </button>
        <h1>{solicitud.titulo}</h1>
        <p>
          Creada el {formatearFecha(solicitud.creadaEn)} · <Estado valor={solicitud.estado} />
        </p>
      </div>

      <div className="tarjeta">
        <h2>Datos de la solicitud</h2>
        <dl className="datos">
          <dt>Descripción</dt>
          <dd>{solicitud.descripcion}</dd>
          <dt>Monto</dt>
          <dd>{solicitud.monto.formateado}</dd>
          <dt>Solicitante</dt>
          <dd>
            {solicitud.solicitante.nombre} · {solicitud.solicitante.correo}
          </dd>
          <dt>Última actualización</dt>
          <dd>{formatearFecha(solicitud.actualizadaEn)}</dd>
          <dt>Avance</dt>
          <dd>
            <Progreso
              firmadas={solicitud.firmasRegistradas}
              total={solicitud.aprobadoresRequeridos}
            />
          </dd>
        </dl>
      </div>

      <div className="tarjeta">
        <h2>Aprobadores</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Rol</th>
              <th>Aprobador</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Firma</th>
            </tr>
          </thead>
          <tbody>
            {solicitud.aprobadores.map((aprobador) => (
              <tr key={aprobador.id}>
                <td>{aprobador.etiquetaRol}</td>
                <td>
                  {aprobador.nombre}
                  <br />
                  <span className="campo__ayuda">{aprobador.correo}</span>
                </td>
                <td>
                  <Estado valor={aprobador.estado} />
                </td>
                <td>{formatearFecha(aprobador.firmadoEn ?? aprobador.rechazadoEn)}</td>
                <td>
                  {aprobador.trazoFirma ? (
                    <>
                      <span className="firma">{aprobador.trazoFirma}</span>
                      <br />
                      <span className="hash" title="Hash del eslabón de la cadena de firmas">
                        #{aprobador.secuenciaFirma} · {aprobador.hashFirma?.slice(0, 24)}…
                      </span>
                    </>
                  ) : aprobador.motivoRechazo ? (
                    <span className="campo__ayuda">Motivo: {aprobador.motivoRechazo}</span>
                  ) : (
                    <span className="campo__ayuda">Sin firma</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="acciones">
        {solicitud.evidenciaDisponible ? (
          <a
            className="boton"
            href={api.urlEvidencia(solicitud.id)}
            target="_blank"
            rel="noreferrer"
          >
            Descargar PDF
          </a>
        ) : (
          <button type="button" className="boton" disabled title="Disponible al completar las tres firmas">
            Descargar PDF
          </button>
        )}
        <button type="button" className="boton boton--secundario" onClick={() => void cargar()}>
          Actualizar estado
        </button>
        <button type="button" className="boton boton--texto" onClick={() => void alternarBuzon()}>
          {verBuzon ? 'Ocultar' : 'Ver'} correos simulados
        </button>
      </div>

      {verBuzon && (
        <div className="tarjeta" style={{ marginTop: 16 }}>
          <h2>Buzón simulado</h2>
          {correos.length === 0 ? (
            <p className="campo__ayuda">No hay correos para esta solicitud.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Para</th>
                  <th>Asunto</th>
                  <th>Enlace / código</th>
                  <th>Enviado</th>
                </tr>
              </thead>
              <tbody>
                {correos.map((correo) => (
                  <tr key={correo.id}>
                    <td>{correo.para}</td>
                    <td>{correo.asunto}</td>
                    <td>
                      {correo.contexto.enlace && (
                        <a href={correo.contexto.enlace} className="hash">
                          {correo.contexto.enlace}
                        </a>
                      )}
                      {correo.contexto.otp && <code>{correo.contexto.otp}</code>}
                    </td>
                    <td>{formatearFecha(correo.enviadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
