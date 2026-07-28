import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  Cargando,
  Campo,
  DetalleAprobacion,
  ErrorDeApi,
  Estado,
  formatearFecha,
  MensajeError,
  MensajeExito,
  RespuestaOtp,
  ResultadoDecision,
} from '@aprobaciones/shared';
import CuentaRegresiva from './CuentaRegresiva';

export interface PropiedadesAprobacion {
  solicitudId: string;
  tokenAprobador: string;
}

type Paso = 'CARGANDO' | 'OTP' | 'DETALLE' | 'RESUELTO';

/**
 * Pantalla del aprobador, en tres pasos.
 *
 * 1. Al abrir el enlace se solicita el OTP (se envía por correo simulado).
 * 2. Con el OTP válido se muestra el detalle de la compra.
 * 3. El aprobador firma o rechaza; la decisión viaja con el token de sesión
 *    que devolvió la validación, nunca con el OTP.
 */
export default function PantallaAprobacion({
  solicitudId,
  tokenAprobador,
}: PropiedadesAprobacion): JSX.Element {
  const [paso, setPaso] = useState<Paso>('CARGANDO');
  const [envio, setEnvio] = useState<RespuestaOtp | null>(null);
  const [detalle, setDetalle] = useState<DetalleAprobacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoDecision | null>(null);

  const [codigo, setCodigo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const pedirCodigo = useCallback(async () => {
    // Con el enlace incompleto no hay nada que pedir: se avisa sin llamar a la API.
    if (!solicitudId || !tokenAprobador) return;
    setOcupado(true);
    setError(null);
    setCodigo('');
    try {
      setEnvio(await api.solicitarOtp(solicitudId, tokenAprobador));
      setPaso('OTP');
    } catch (fallo) {
      setError((fallo as ErrorDeApi).message);
      setPaso('OTP');
    } finally {
      setOcupado(false);
    }
  }, [solicitudId, tokenAprobador]);

  useEffect(() => {
    void pedirCodigo();
  }, [pedirCodigo]);

  const validar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      setDetalle(await api.validarOtp(solicitudId, tokenAprobador, codigo.trim()));
      setPaso('DETALLE');
    } catch (fallo) {
      setError((fallo as ErrorDeApi).message);
    } finally {
      setOcupado(false);
    }
  };

  const decidir = async (decision: 'APROBAR' | 'RECHAZAR') => {
    if (!detalle) return;
    if (decision === 'RECHAZAR' && !mostrarMotivo) {
      setMostrarMotivo(true);
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      setResultado(
        await api.registrarDecision({
          solicitudId,
          tokenAprobador,
          tokenSesion: detalle.tokenSesion,
          decision,
          motivo: decision === 'RECHAZAR' ? motivo.trim() || undefined : undefined,
        }),
      );
      setPaso('RESUELTO');
    } catch (fallo) {
      setError((fallo as ErrorDeApi).message);
    } finally {
      setOcupado(false);
    }
  };

  if (!solicitudId || !tokenAprobador) {
    return (
      <div className="tarjeta">
        <MensajeError error="El enlace de aprobación está incompleto. Verifique el correo recibido." />
      </div>
    );
  }

  if (paso === 'CARGANDO') return <Cargando texto="Preparando su acceso…" />;

  if (paso === 'RESUELTO' && resultado) {
    const aprobada = resultado.solicitud.estado !== 'RECHAZADA';
    return (
      <section>
        <div className="encabezado-pagina">
          <h1>{aprobada ? 'Firma registrada' : 'Solicitud rechazada'}</h1>
          <p>{resultado.mensaje}</p>
        </div>
        <div className="tarjeta">
          <dl className="datos">
            <dt>Solicitud</dt>
            <dd>{resultado.solicitud.titulo}</dd>
            <dt>Estado</dt>
            <dd>
              <Estado valor={resultado.solicitud.estado} />
            </dd>
            <dt>Firmas</dt>
            <dd>
              {resultado.solicitud.firmasRegistradas} de {resultado.solicitud.aprobadoresRequeridos}
            </dd>
          </dl>
        </div>
        <MensajeExito
          texto={
            resultado.solicitud.evidenciaDisponible
              ? 'Se completaron las tres firmas: la evidencia en PDF ya está disponible para el solicitante.'
              : null
          }
        />
      </section>
    );
  }

  if (paso === 'DETALLE' && detalle) {
    return (
      <section>
        <div className="encabezado-pagina">
          <h1>{detalle.solicitud.titulo}</h1>
          <p>
            Usted revisa esta compra como <strong>{detalle.aprobador.etiquetaRol}</strong> (
            {detalle.aprobador.nombre}).
          </p>
        </div>

        <MensajeError error={error} />

        <div className="tarjeta">
          <h2>Detalle de la compra</h2>
          <dl className="datos">
            <dt>Descripción</dt>
            <dd>{detalle.solicitud.descripcion}</dd>
            <dt>Monto</dt>
            <dd>
              <strong>{detalle.solicitud.monto.formateado}</strong>
            </dd>
            <dt>Solicitante</dt>
            <dd>
              {detalle.solicitud.solicitante.nombre} · {detalle.solicitud.solicitante.correo}
            </dd>
            <dt>Fecha</dt>
            <dd>{formatearFecha(detalle.solicitud.creadaEn)}</dd>
          </dl>
        </div>

        <div className="tarjeta">
          <h2>Estado de las firmas</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Aprobador</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {detalle.solicitud.aprobadores.map((aprobador) => (
                <tr key={aprobador.id}>
                  <td>{aprobador.etiquetaRol}</td>
                  <td>{aprobador.nombre}</td>
                  <td>
                    <Estado valor={aprobador.estado} />
                  </td>
                  <td>{formatearFecha(aprobador.firmadoEn ?? aprobador.rechazadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mostrarMotivo && (
          <div className="tarjeta">
            <Campo etiqueta="Motivo del rechazo (opcional)">
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
                placeholder="Indique por qué no aprueba esta compra"
              />
            </Campo>
          </div>
        )}

        <div className="acciones">
          <button type="button" className="boton" disabled={ocupado} onClick={() => void decidir('APROBAR')}>
            {ocupado ? 'Registrando…' : 'Aprobar y firmar'}
          </button>
          <button
            type="button"
            className="boton boton--peligro"
            disabled={ocupado}
            onClick={() => void decidir('RECHAZAR')}
          >
            {mostrarMotivo ? 'Confirmar rechazo' : 'Rechazar'}
          </button>
          {mostrarMotivo && (
            <button type="button" className="boton boton--texto" onClick={() => setMostrarMotivo(false)}>
              Cancelar
            </button>
          )}
        </div>
        <p className="campo__ayuda" style={{ marginTop: 12 }}>
          Al aprobar se registra su firma con nombre y fecha, encadenada al hash de la firma anterior.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Verificación de identidad</h1>
        <p>
          {envio
            ? `Enviamos un código de un solo uso a ${envio.enviadoA}. Ingréselo para ver el detalle de la compra.`
            : 'Solicite un código para continuar.'}
        </p>
      </div>

      <MensajeError error={error} />

      {envio?.otpDemo && (
        <div className="pista-demo">
          Modo demostración: su código es <code>{envio.otpDemo}</code> (en producción solo llegaría
          por correo).
        </div>
      )}

      <form className="tarjeta" onSubmit={validar}>
        <div className="otp">
          <Campo etiqueta="Código de 6 dígitos">
            <input
              aria-label="Código de verificación"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="······"
            />
          </Campo>
          <button type="submit" className="boton" disabled={ocupado || codigo.length < 4}>
            {ocupado ? 'Validando…' : 'Validar'}
          </button>
        </div>

        {envio && (
          <p className="campo__ayuda">
            El código vence en <CuentaRegresiva expiraEn={envio.expiraEn} />.{' '}
            <button type="button" className="boton boton--texto" onClick={() => void pedirCodigo()}>
              Reenviar código
            </button>
          </p>
        )}
      </form>
    </section>
  );
}
