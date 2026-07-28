import React from 'react';
import { createRoot } from 'react-dom/client';
import '@aprobaciones/shared/src/estilos.css';
import AplicacionAprobador from './AplicacionAprobador';

/**
 * Arranque en modo autónomo: lee `solicitud_id` y `approver_token` de la URL,
 * igual que hará el host, para poder probar el enlace del correo sin levantar
 * el contenedor.
 */
const contenedor = document.getElementById('raiz');
if (contenedor) {
  createRoot(contenedor).render(
    <React.StrictMode>
      <AplicacionAprobador />
    </React.StrictMode>,
  );
}
