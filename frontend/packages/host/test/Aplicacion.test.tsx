import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Aplicacion from '../src/Aplicacion';

/**
 * Pruebas del contenedor.
 *
 * Los remotos están sustituidos por dobles (ver `jest.config.js`): aquí se
 * verifica el trabajo del host —rutas, layout y paso de navegación— no el
 * contenido de los microfrontends, que tienen sus propias pruebas.
 */
const montarEn = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Aplicacion />
    </MemoryRouter>,
  );

describe('Aplicación host', () => {
  it('monta el microfrontend del solicitante en la raíz', async () => {
    montarEn('/');
    expect(await screen.findByTestId('remoto-solicitante')).toBeInTheDocument();
  });

  it('muestra la navegación y la marca en todas las rutas', () => {
    montarEn('/');
    expect(screen.getByText('Firma digital concatenada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Panel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva solicitud' })).toBeInTheDocument();
  });

  it('monta el formulario en /nueva', async () => {
    montarEn('/nueva');
    expect(await screen.findByText('Nueva solicitud de compra')).toBeInTheDocument();
    expect(await screen.findByTestId('remoto-solicitante')).toBeInTheDocument();
  });

  it('pasa el id de la ruta al detalle', async () => {
    montarEn('/solicitudes/sol-123');
    expect(await screen.findByTestId('solicitud-id')).toHaveTextContent('sol-123');
  });

  it('traduce el enlace del correo a las props del aprobador', async () => {
    montarEn('/approve?solicitud_id=sol-9&approver_token=tok-abc');

    expect(await screen.findByTestId('remoto-aprobador')).toBeInTheDocument();
    expect(screen.getByTestId('solicitud-id')).toHaveTextContent('sol-9');
    expect(screen.getByTestId('token')).toHaveTextContent('tok-abc');
  });

  it('entrega valores vacíos si el enlace viene sin parámetros', async () => {
    montarEn('/approve');
    expect(await screen.findByTestId('token')).toHaveTextContent('');
  });

  it('navega del panel al detalle usando el callback del remoto', async () => {
    const usuario = userEvent.setup();
    montarEn('/');

    await usuario.click(await screen.findByRole('button', { name: 'abrir solicitud' }));

    expect(await screen.findByTestId('solicitud-id')).toHaveTextContent('sol-9');
  });

  it('navega del panel al formulario', async () => {
    const usuario = userEvent.setup();
    montarEn('/');

    await usuario.click(await screen.findByRole('button', { name: 'ir a nueva' }));

    expect(await screen.findByText('Nueva solicitud de compra')).toBeInTheDocument();
  });

  it('navega al detalle recién creado', async () => {
    const usuario = userEvent.setup();
    montarEn('/nueva');

    await usuario.click(await screen.findByRole('button', { name: 'crear' }));

    expect(await screen.findByTestId('solicitud-id')).toHaveTextContent('sol-nueva');
  });

  it('vuelve al panel desde el detalle', async () => {
    const usuario = userEvent.setup();
    montarEn('/solicitudes/sol-1');

    await usuario.click(await screen.findByRole('button', { name: 'volver' }));

    expect(await screen.findByRole('button', { name: 'abrir solicitud' })).toBeInTheDocument();
  });

  it('muestra una página propia para rutas desconocidas', () => {
    montarEn('/ruta-que-no-existe');
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  });
});
