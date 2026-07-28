import React from 'react';
import { createRoot } from 'react-dom/client';
import '@aprobaciones/shared/src/estilos.css';
import AplicacionSolicitante from './AplicacionSolicitante';

/**
 * Arranque en modo autónomo: permite desarrollar y probar este microfrontend
 * sin levantar el host. Dentro del host solo se consumen los componentes
 * expuestos, no este archivo.
 */
const contenedor = document.getElementById('raiz');
if (contenedor) {
  createRoot(contenedor).render(
    <React.StrictMode>
      <AplicacionSolicitante />
    </React.StrictMode>,
  );
}
