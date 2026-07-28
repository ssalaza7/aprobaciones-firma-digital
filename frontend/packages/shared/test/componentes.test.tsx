import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Campo, Cargando, Estado, MensajeError, MensajeExito, Progreso } from '../src/componentes';

describe('Componentes compartidos', () => {
  it('Estado traduce el código del backend a una etiqueta legible', () => {
    render(<Estado valor="FIRMADO" />);
    expect(screen.getByTestId('estado-FIRMADO')).toHaveTextContent('Firmado');
    expect(screen.getByTestId('estado-FIRMADO')).toHaveClass('estado--firmado');
  });

  it('Cargando se anuncia a lectores de pantalla', () => {
    render(<Cargando texto="Cargando solicitudes…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando solicitudes…');
  });

  it('MensajeError no renderiza nada sin error', () => {
    const { container } = render(<MensajeError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('MensajeError ofrece reintentar cuando se le pasa la acción', async () => {
    const onReintentar = jest.fn();
    const usuario = userEvent.setup();

    render(<MensajeError error="Se cayó la red" onReintentar={onReintentar} />);
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Se cayó la red');
    expect(onReintentar).toHaveBeenCalled();
  });

  it('MensajeExito solo aparece con texto', () => {
    const { container, rerender } = render(<MensajeExito texto={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<MensajeExito texto="Listo" />);
    expect(screen.getByRole('status')).toHaveTextContent('Listo');
  });

  it('Campo asocia etiqueta, ayuda y error', () => {
    const { rerender } = render(
      <Campo etiqueta="Monto" ayuda="En pesos colombianos">
        <input />
      </Campo>,
    );
    expect(screen.getByText('En pesos colombianos')).toBeInTheDocument();

    rerender(
      <Campo etiqueta="Monto" ayuda="En pesos colombianos" error="Debe ser mayor que cero">
        <input />
      </Campo>,
    );
    expect(screen.getByText('Debe ser mayor que cero')).toBeInTheDocument();
    // Con error, la ayuda cede el espacio al mensaje que importa.
    expect(screen.queryByText('En pesos colombianos')).not.toBeInTheDocument();
  });

  it('Progreso expone el avance de firmas de forma accesible', () => {
    render(<Progreso firmadas={2} total={3} />);

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '2');
    expect(barra).toHaveAttribute('aria-valuemax', '3');
    expect(barra).toHaveTextContent('2 de 3 firmas');
  });
});
