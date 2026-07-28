import React from 'react';

/** Doble del módulo federado del microfrontend "aprobador". */
export default function RemotoAprobador({
  solicitudId,
  tokenAprobador,
}: {
  solicitudId: string;
  tokenAprobador: string;
}): JSX.Element {
  return (
    <div data-testid="remoto-aprobador">
      <span data-testid="solicitud-id">{solicitudId}</span>
      <span data-testid="token">{tokenAprobador}</span>
    </div>
  );
}
