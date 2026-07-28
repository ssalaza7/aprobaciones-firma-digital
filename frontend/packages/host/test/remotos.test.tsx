import React from 'react';
import { render, screen } from '@testing-library/react';
import { LimiteDeError, Remoto } from '../src/remotos';

describe('Carga de microfrontends remotos', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('renderiza el remoto cuando carga bien', () => {
    render(
      <Remoto nombre="solicitante">
        <p>contenido remoto</p>
      </Remoto>,
    );
    expect(screen.getByText('contenido remoto')).toBeInTheDocument();
  });

  it('el contenedor sobrevive si un remoto falla y explica qué pasó', () => {
    function Explosivo(): JSX.Element {
      throw new Error('remoteEntry.js no disponible');
    }

    render(
      <LimiteDeError nombre="aprobador">
        <Explosivo />
      </LimiteDeError>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No fue posible cargar el módulo «aprobador»',
    );
  });

  it('muestra un estado de carga mientras llega el módulo', () => {
    const Diferido = React.lazy(() => new Promise<never>(() => undefined));

    render(
      <Remoto nombre="solicitante">
        <Diferido />
      </Remoto>,
    );

    expect(screen.getByText(/Cargando módulo «solicitante»/)).toBeInTheDocument();
  });
});
