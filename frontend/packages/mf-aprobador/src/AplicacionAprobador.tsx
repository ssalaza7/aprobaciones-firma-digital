import React from 'react';
import PantallaAprobacion from './componentes/PantallaAprobacion';

/** Cáscara para el modo autónomo del microfrontend del aprobador. */
export default function AplicacionAprobador(): JSX.Element {
  const parametros = new URLSearchParams(window.location.search);

  return (
    <>
      <header className="cabecera">
        <div className="cabecera__contenido">
          <div className="cabecera__marca">
            Aprobador<span>microfrontend autónomo</span>
          </div>
        </div>
      </header>
      <main className="contenido contenido--estrecho">
        <PantallaAprobacion
          solicitudId={parametros.get('solicitud_id') ?? ''}
          tokenAprobador={parametros.get('approver_token') ?? ''}
        />
      </main>
    </>
  );
}
