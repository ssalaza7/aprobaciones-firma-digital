import React from 'react';
import { EstadoAprobacion, EstadoSolicitud } from './tipos';

/** Componentes de presentación reutilizados por los dos microfrontends. */

const ETIQUETAS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  FIRMADO: 'Firmado',
  RECHAZADO: 'Rechazado',
  RECHAZADA: 'Rechazada',
  COMPLETADA: 'Completada',
};

export function Estado({ valor }: { valor: EstadoSolicitud | EstadoAprobacion }): JSX.Element {
  return (
    <span className={`estado estado--${valor.toLowerCase()}`} data-testid={`estado-${valor}`}>
      {ETIQUETAS[valor] ?? valor}
    </span>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }): JSX.Element {
  return (
    <p className="cargando" role="status">
      {texto}
    </p>
  );
}

export function MensajeError({
  error,
  onReintentar,
}: {
  error: string | null;
  onReintentar?: () => void;
}): JSX.Element | null {
  if (!error) return null;
  return (
    <div className="alerta alerta--error" role="alert">
      <span>{error}</span>
      {onReintentar && (
        <button type="button" className="boton boton--texto" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function MensajeExito({ texto }: { texto: string | null }): JSX.Element | null {
  if (!texto) return null;
  return (
    <div className="alerta alerta--exito" role="status">
      {texto}
    </div>
  );
}

export function Campo({
  etiqueta,
  error,
  children,
  ayuda,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className={`campo${error ? ' campo--error' : ''}`}>
      <span className="campo__etiqueta">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="campo__ayuda">{ayuda}</span>}
      {error && <span className="campo__error">{error}</span>}
    </label>
  );
}

export function Progreso({ firmadas, total }: { firmadas: number; total: number }): JSX.Element {
  return (
    <div
      className="progreso"
      role="progressbar"
      aria-valuenow={firmadas}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${firmadas} de ${total} firmas`}
    >
      <div className="progreso__barra" style={{ width: `${(firmadas / total) * 100}%` }} />
      <span className="progreso__texto">
        {firmadas} de {total} firmas
      </span>
    </div>
  );
}
