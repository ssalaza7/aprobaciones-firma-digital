import React, { useState } from 'react';
import DetalleSolicitud from './componentes/DetalleSolicitud';
import FormularioSolicitud from './componentes/FormularioSolicitud';
import PanelSolicitudes from './componentes/PanelSolicitudes';

type Vista = { nombre: 'panel' } | { nombre: 'nueva' } | { nombre: 'detalle'; id: string };

/**
 * Cáscara para el modo autónomo del microfrontend.
 *
 * Usa estado local en vez de react-router a propósito: la navegación real la
 * aporta el host, y así este paquete no impone su propio enrutador.
 */
export default function AplicacionSolicitante(): JSX.Element {
  const [vista, setVista] = useState<Vista>({ nombre: 'panel' });

  return (
    <>
      <header className="cabecera">
        <div className="cabecera__contenido">
          <div className="cabecera__marca">
            Solicitante<span>microfrontend autónomo</span>
          </div>
        </div>
      </header>
      <main className="contenido">
        {vista.nombre === 'panel' && (
          <PanelSolicitudes
            onAbrir={(id) => setVista({ nombre: 'detalle', id })}
            onNueva={() => setVista({ nombre: 'nueva' })}
          />
        )}
        {vista.nombre === 'nueva' && (
          <FormularioSolicitud onCreada={(id) => setVista({ nombre: 'detalle', id })} />
        )}
        {vista.nombre === 'detalle' && (
          <DetalleSolicitud solicitudId={vista.id} onVolver={() => setVista({ nombre: 'panel' })} />
        )}
      </main>
    </>
  );
}
