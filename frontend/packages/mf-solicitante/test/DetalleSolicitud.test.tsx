import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, ErrorDeApi } from '@aprobaciones/shared';
import DetalleSolicitud from '../src/componentes/DetalleSolicitud';
import { aprobadorDe, solicitudDe } from '../../../test/dobles/api';

jest.mock('@aprobaciones/shared', () => ({
  ...jest.requireActual('@aprobaciones/shared'),
  api: {
    obtenerSolicitud: jest.fn(),
    bandeja: jest.fn(),
    urlEvidencia: (id: string) => `http://api.local/api/solicitudes/${id}/evidencia.pdf`,
  },
}));

const apiMock = api as jest.Mocked<typeof api>;

const solicitudFirmada = () =>
  solicitudDe({
    estado: 'COMPLETADA',
    firmasRegistradas: 3,
    evidenciaDisponible: true,
    urlEvidencia: '/api/solicitudes/sol-1/evidencia.pdf',
    aprobadores: [
      aprobadorDe(1, {
        estado: 'FIRMADO',
        firmadoEn: '2026-03-10T15:00:00.000Z',
        trazoFirma: 'Carlos P.',
        secuenciaFirma: 1,
        hashFirma: 'a'.repeat(64),
      }),
      aprobadorDe(2, {
        estado: 'FIRMADO',
        firmadoEn: '2026-03-10T16:00:00.000Z',
        trazoFirma: 'Diana G.',
        secuenciaFirma: 2,
        hashFirma: 'b'.repeat(64),
      }),
      aprobadorDe(3, {
        estado: 'FIRMADO',
        firmadoEn: '2026-03-10T17:00:00.000Z',
        trazoFirma: 'Esteban R.',
        secuenciaFirma: 3,
        hashFirma: 'c'.repeat(64),
      }),
    ],
  });

describe('DetalleSolicitud', () => {
  it('muestra los datos de la compra y el estado de cada aprobador', async () => {
    apiMock.obtenerSolicitud.mockResolvedValue(
      solicitudDe({
        aprobadores: [
          aprobadorDe(1, {
            estado: 'FIRMADO',
            firmadoEn: '2026-03-10T15:00:00.000Z',
            trazoFirma: 'Carlos P.',
            secuenciaFirma: 1,
            hashFirma: 'abc123',
          }),
          aprobadorDe(2, {
            estado: 'RECHAZADO',
            rechazadoEn: '2026-03-10T16:00:00.000Z',
            motivoRechazo: 'Excede el presupuesto',
          }),
          aprobadorDe(3),
        ],
        firmasRegistradas: 1,
        estado: 'RECHAZADA',
      }),
    );

    render(<DetalleSolicitud solicitudId="sol-1" />);

    expect(await screen.findByText('$ 45.000.000,00 COP')).toBeInTheDocument();
    expect(screen.getByText('Carlos P.')).toBeInTheDocument();
    expect(screen.getByTestId('estado-FIRMADO')).toBeInTheDocument();
    expect(screen.getByTestId('estado-RECHAZADO')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Excede el presupuesto')).toBeInTheDocument();
    expect(screen.getByText('Sin firma')).toBeInTheDocument();
  });

  it('deja el botón de PDF inhabilitado mientras falten firmas', async () => {
    apiMock.obtenerSolicitud.mockResolvedValue(solicitudDe());
    render(<DetalleSolicitud solicitudId="sol-1" />);

    expect(await screen.findByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
  });

  it('ofrece el PDF como enlace de descarga al completarse las firmas', async () => {
    apiMock.obtenerSolicitud.mockResolvedValue(solicitudFirmada());
    render(<DetalleSolicitud solicitudId="sol-1" />);

    const enlace = await screen.findByRole('link', { name: 'Descargar PDF' });
    expect(enlace).toHaveAttribute('href', 'http://api.local/api/solicitudes/sol-1/evidencia.pdf');
  });

  it('muestra la cadena de firmas con su secuencia y hash', async () => {
    apiMock.obtenerSolicitud.mockResolvedValue(solicitudFirmada());
    render(<DetalleSolicitud solicitudId="sol-1" />);

    expect(await screen.findByText(/#1 · aaaaaaaa/)).toBeInTheDocument();
    expect(screen.getByText(/#3 · cccccccc/)).toBeInTheDocument();
  });

  it('permite consultar el buzón simulado', async () => {
    apiMock.obtenerSolicitud.mockResolvedValue(solicitudDe());
    apiMock.bandeja.mockResolvedValue({
      total: 1,
      correos: [
        {
          id: 'c1',
          para: 'carlos@empresa.com',
          asunto: 'Su firma es requerida',
          cuerpo: '...',
          enviadoEn: '2026-03-10T14:00:00.000Z',
          contexto: {
            solicitudId: 'sol-1',
            tipo: 'INVITACION_APROBACION',
            enlace: 'http://app.local/approve?solicitud_id=sol-1&approver_token=t1',
          },
        },
      ],
    });
    const usuario = userEvent.setup();

    render(<DetalleSolicitud solicitudId="sol-1" />);
    await usuario.click(await screen.findByRole('button', { name: /Ver correos simulados/ }));

    expect(await screen.findByText('Su firma es requerida')).toBeInTheDocument();
    expect(apiMock.bandeja).toHaveBeenCalledWith('sol-1');
  });

  it('permite volver al panel cuando la solicitud no existe', async () => {
    apiMock.obtenerSolicitud.mockRejectedValue(
      new ErrorDeApi('NO_ENCONTRADO', 'No existe la solicitud sol-x'),
    );
    const onVolver = jest.fn();
    const usuario = userEvent.setup();

    render(<DetalleSolicitud solicitudId="sol-x" onVolver={onVolver} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No existe la solicitud');
    await usuario.click(screen.getByRole('button', { name: 'Volver al panel' }));
    expect(onVolver).toHaveBeenCalled();
  });

  it('recarga el estado bajo demanda', async () => {
    apiMock.obtenerSolicitud.mockResolvedValue(solicitudDe());
    const usuario = userEvent.setup();

    render(<DetalleSolicitud solicitudId="sol-1" />);
    await usuario.click(await screen.findByRole('button', { name: 'Actualizar estado' }));

    await waitFor(() => expect(apiMock.obtenerSolicitud).toHaveBeenCalledTimes(2));
  });
});
