/**
 * Declaraciones de los módulos federados.
 *
 * Module Federation los resuelve en tiempo de ejecución, así que TypeScript
 * necesita conocer aquí su contrato. Es el precio de federar: el compilador no
 * puede verificar el otro repositorio, pero sí obliga a declarar qué se espera.
 */

declare module 'solicitante/Panel' {
  const Panel: React.ComponentType<{
    onAbrir?: (solicitudId: string) => void;
    onNueva?: () => void;
  }>;
  export default Panel;
}

declare module 'solicitante/Formulario' {
  const Formulario: React.ComponentType<{ onCreada?: (solicitudId: string) => void }>;
  export default Formulario;
}

declare module 'solicitante/Detalle' {
  const Detalle: React.ComponentType<{ solicitudId: string; onVolver?: () => void }>;
  export default Detalle;
}

declare module 'aprobador/PantallaAprobacion' {
  const PantallaAprobacion: React.ComponentType<{
    solicitudId: string;
    tokenAprobador: string;
  }>;
  export default PantallaAprobacion;
}
