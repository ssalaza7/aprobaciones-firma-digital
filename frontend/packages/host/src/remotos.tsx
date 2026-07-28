import React from 'react';

/**
 * Punto único de acoplamiento con los remotos de Module Federation.
 *
 * Aislarlo aquí tiene dos efectos: el resto del host no sabe que los
 * componentes vienen de otro bundle, y las pruebas pueden sustituir este
 * módulo por dobles sin montar webpack.
 */

// Los módulos federados se resuelven en tiempo de ejecución; TypeScript
// necesita la declaración de `src/modulos-federados.d.ts` para conocer su forma.
export const PanelSolicitudes = React.lazy(() => import('solicitante/Panel'));
export const FormularioSolicitud = React.lazy(() => import('solicitante/Formulario'));
export const DetalleSolicitud = React.lazy(() => import('solicitante/Detalle'));
export const PantallaAprobacion = React.lazy(() => import('aprobador/PantallaAprobacion'));

interface EstadoLimite {
  fallo: Error | null;
}

/**
 * Si un microfrontend no está disponible, el contenedor debe seguir en pie y
 * decir qué pasó, no quedarse en blanco.
 */
export class LimiteDeError extends React.Component<
  { children: React.ReactNode; nombre: string },
  EstadoLimite
> {
  constructor(propiedades: { children: React.ReactNode; nombre: string }) {
    super(propiedades);
    this.state = { fallo: null };
  }

  static getDerivedStateFromError(error: Error): EstadoLimite {
    return { fallo: error };
  }

  componentDidCatch(error: Error): void {
    console.error(`Falló el microfrontend "${this.props.nombre}"`, error);
  }

  render(): React.ReactNode {
    if (this.state.fallo) {
      return (
        <div className="alerta alerta--error" role="alert">
          No fue posible cargar el módulo «{this.props.nombre}». Verifique que su servidor esté
          arriba y recargue la página.
        </div>
      );
    }
    return this.props.children;
  }
}

/** Envuelve un remoto con su límite de error y su estado de carga. */
export function Remoto({
  nombre,
  children,
}: {
  nombre: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <LimiteDeError nombre={nombre}>
      <React.Suspense fallback={<p className="cargando">Cargando módulo «{nombre}»…</p>}>
        {children}
      </React.Suspense>
    </LimiteDeError>
  );
}
