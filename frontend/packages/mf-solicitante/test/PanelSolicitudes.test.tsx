import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, ErrorDeApi } from '@aprobaciones/shared';
import PanelSolicitudes from '../src/componentes/PanelSolicitudes';
import { solicitudDe } from '../../../test/dobles/api';

jest.mock('@aprobaciones/shared', () => ({
  ...jest.requireActual('@aprobaciones/shared'),
  api: { listarSolicitudes: jest.fn() },
}));

const apiMock = api as jest.Mocked<typeof api>;

describe('PanelSolicitudes', () => {
  it('muestra el listado con estado y avance de firmas', async () => {
    apiMock.listarSolicitudes.mockResolvedValue({
      total: 2,
      solicitudes: [
        solicitudDe({ id: 'sol-1', titulo: 'Compra de portátiles', firmasRegistradas: 2 }),
        solicitudDe({
          id: 'sol-2',
          titulo: 'Compra de sillas',
          estado: 'COMPLETADA',
          firmasRegistradas: 3,
          evidenciaDisponible: true,
        }),
      ],
    });

    render(<PanelSolicitudes />);

    expect(await screen.findByText('Compra de portátiles')).toBeInTheDocument();
    expect(screen.getByText('2 de 3 firmas')).toBeInTheDocument();
    expect(screen.getByTestId('estado-COMPLETADA')).toBeInTheDocument();
    expect(screen.getByText('PDF listo')).toBeInTheDocument();
  });

  it('muestra el estado vacío e invita a crear la primera', async () => {
    apiMock.listarSolicitudes.mockResolvedValue({ total: 0, solicitudes: [] });
    const onNueva = jest.fn();
    const usuario = userEvent.setup();

    render(<PanelSolicitudes onNueva={onNueva} />);

    await usuario.click(await screen.findByRole('button', { name: 'Crear la primera' }));
    expect(onNueva).toHaveBeenCalled();
  });

  it('avisa al host cuando se abre una solicitud', async () => {
    apiMock.listarSolicitudes.mockResolvedValue({
      total: 1,
      solicitudes: [solicitudDe({ id: 'sol-42' })],
    });
    const onAbrir = jest.fn();
    const usuario = userEvent.setup();

    render(<PanelSolicitudes onAbrir={onAbrir} />);
    await usuario.click(await screen.findByText('Compra de 15 portátiles'));

    expect(onAbrir).toHaveBeenCalledWith('sol-42');
  });

  it('filtra por el correo del solicitante', async () => {
    apiMock.listarSolicitudes.mockResolvedValue({ total: 0, solicitudes: [] });
    const usuario = userEvent.setup();

    render(<PanelSolicitudes />);
    await waitFor(() => expect(apiMock.listarSolicitudes).toHaveBeenCalledWith(undefined));

    await usuario.type(
      screen.getByLabelText('Filtrar por correo del solicitante'),
      'ana@empresa.com',
    );
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() =>
      expect(apiMock.listarSolicitudes).toHaveBeenLastCalledWith('ana@empresa.com'),
    );
  });

  it('muestra el error de la API y permite reintentar', async () => {
    apiMock.listarSolicitudes.mockRejectedValueOnce(
      new ErrorDeApi('SIN_CONEXION', 'No fue posible conectar con el servidor.'),
    );
    apiMock.listarSolicitudes.mockResolvedValueOnce({ total: 0, solicitudes: [] });
    const usuario = userEvent.setup();

    render(<PanelSolicitudes />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible conectar');
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
