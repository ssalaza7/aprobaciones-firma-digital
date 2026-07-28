import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@aprobaciones/shared/src/estilos.css';
import Aplicacion from './Aplicacion';

/**
 * Arranque del contenedor. Es asíncrono (`index.ts` lo importa con `import()`)
 * porque Module Federation debe negociar antes las dependencias compartidas.
 */
const contenedor = document.getElementById('raiz');
if (contenedor) {
  createRoot(contenedor).render(
    <React.StrictMode>
      <BrowserRouter>
        <Aplicacion />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
