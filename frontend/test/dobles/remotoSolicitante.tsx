import React from 'react';

/**
 * Doble de los módulos federados del microfrontend "solicitante".
 *
 * Fuera de webpack los remotos no se pueden resolver; en las pruebas del host
 * interesa verificar el cableado (rutas y props), no volver a probar el
 * remoto, que tiene sus propias pruebas.
 */
export default function RemotoSolicitante(propiedades: Record<string, unknown>): JSX.Element {
  return (
    <div data-testid="remoto-solicitante" data-props={Object.keys(propiedades).sort().join(',')}>
      microfrontend solicitante
      {typeof propiedades.solicitudId === 'string' && (
        <span data-testid="solicitud-id">{propiedades.solicitudId}</span>
      )}
      {typeof propiedades.onNueva === 'function' && (
        <button type="button" onClick={propiedades.onNueva as () => void}>
          ir a nueva
        </button>
      )}
      {typeof propiedades.onAbrir === 'function' && (
        <button type="button" onClick={() => (propiedades.onAbrir as (id: string) => void)('sol-9')}>
          abrir solicitud
        </button>
      )}
      {typeof propiedades.onCreada === 'function' && (
        <button type="button" onClick={() => (propiedades.onCreada as (id: string) => void)('sol-nueva')}>
          crear
        </button>
      )}
      {typeof propiedades.onVolver === 'function' && (
        <button type="button" onClick={propiedades.onVolver as () => void}>
          volver
        </button>
      )}
    </div>
  );
}
