import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, ErrorDeApi } from '@aprobaciones/shared';
import PantallaAprobacion from '../src/componentes/PantallaAprobacion';
import { detalleDe, respuestaOtpDe, solicitudDe } from '../../../test/dobles/api';

jest.mock('@aprobaciones/shared', () => ({
  ...jest.requireActual('@aprobaciones/shared'),
  api: {
    solicitarOtp: jest.fn(),
    validarOtp: jest.fn(),
    registrarDecision: jest.fn(),
  },
}));

const apiMock = api as jest.Mocked<typeof api>;

const montar = () =>
  render(<PantallaAprobacion solicitudId="sol-1" tokenAprobador="token-1" />);

const validarConCodigo = async (usuario: ReturnType<typeof userEvent.setup>, codigo = '123456') => {
  await usuario.type(await screen.findByLabelText('Código de verificación'), codigo);
  await usuario.click(screen.getByRole('button', { name: 'Validar' }));
};

describe('PantallaAprobacion', () => {
  beforeEach(() => {
    apiMock.solicitarOtp.mockResolvedValue(respuestaOtpDe());
    apiMock.validarOtp.mockResolvedValue(detalleDe());
    apiMock.registrarDecision.mockResolvedValue({
      solicitud: solicitudDe({ firmasRegistradas: 1 }),
      mensaje: 'Firma registrada. 1 de 3 aprobadores han firmado.',
    });
  });

  it('pide el código al abrir el enlace y no muestra la compra todavía', async () => {
    montar();

    await waitFor(() => expect(apiMock.solicitarOtp).toHaveBeenCalledWith('sol-1', 'token-1'));
    expect(await screen.findByText(/Enviamos un código de un solo uso/)).toBeInTheDocument();
    expect(screen.queryByText('$ 45.000.000,00 COP')).not.toBeInTheDocument();
  });

  it('rechaza el enlace incompleto sin llamar al backend', () => {
    render(<PantallaAprobacion solicitudId="" tokenAprobador="" />);

    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de aprobación está incompleto');
    expect(apiMock.solicitarOtp).not.toHaveBeenCalled();
  });

  it('muestra el detalle de la compra cuando el OTP es correcto', async () => {
    const usuario = userEvent.setup();
    montar();

    await validarConCodigo(usuario);

    await waitFor(() => expect(apiMock.validarOtp).toHaveBeenCalledWith('sol-1', 'token-1', '123456'));
    expect(await screen.findByText('$ 45.000.000,00 COP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar y firmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('muestra el mensaje del backend cuando el OTP expiró', async () => {
    const usuario = userEvent.setup();
    apiMock.validarOtp.mockRejectedValue(
      new ErrorDeApi('OTP_INVALIDO', 'El código expiró. Solicite uno nuevo.', 'EXPIRADO', 401),
    );
    montar();

    await validarConCodigo(usuario);

    expect(await screen.findByRole('alert')).toHaveTextContent('El código expiró');
    expect(screen.queryByText('$ 45.000.000,00 COP')).not.toBeInTheDocument();
  });

  it('permite reenviar el código', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(await screen.findByRole('button', { name: 'Reenviar código' }));

    await waitFor(() => expect(apiMock.solicitarOtp).toHaveBeenCalledTimes(2));
  });

  it('solo admite dígitos en el campo del código', async () => {
    const usuario = userEvent.setup();
    montar();

    const campo = await screen.findByLabelText('Código de verificación');
    await usuario.type(campo, '12ab34');

    expect(campo).toHaveValue('1234');
  });

  it('registra la firma con el token de sesión, nunca con el OTP', async () => {
    const usuario = userEvent.setup();
    montar();
    await validarConCodigo(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Aprobar y firmar' }));

    await waitFor(() =>
      expect(apiMock.registrarDecision).toHaveBeenCalledWith({
        solicitudId: 'sol-1',
        tokenAprobador: 'token-1',
        tokenSesion: 'sesion-1',
        decision: 'APROBAR',
        motivo: undefined,
      }),
    );
    expect(await screen.findByText('Firma registrada')).toBeInTheDocument();
  });

  it('pide confirmación y motivo antes de rechazar', async () => {
    const usuario = userEvent.setup();
    apiMock.registrarDecision.mockResolvedValue({
      solicitud: solicitudDe({ estado: 'RECHAZADA' }),
      mensaje: 'Solicitud rechazada. Se notificó al solicitante.',
    });
    montar();
    await validarConCodigo(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Rechazar' }));
    expect(apiMock.registrarDecision).not.toHaveBeenCalled();

    await usuario.type(screen.getByRole('textbox'), 'Excede el presupuesto');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() =>
      expect(apiMock.registrarDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'RECHAZAR', motivo: 'Excede el presupuesto' }),
      ),
    );
    expect(await screen.findByText('Solicitud rechazada')).toBeInTheDocument();
  });

  it('anuncia la evidencia cuando la firma completa el flujo', async () => {
    const usuario = userEvent.setup();
    apiMock.registrarDecision.mockResolvedValue({
      solicitud: solicitudDe({
        estado: 'COMPLETADA',
        firmasRegistradas: 3,
        evidenciaDisponible: true,
      }),
      mensaje: 'Firma registrada. 3 de 3 aprobadores han firmado.',
    });
    montar();
    await validarConCodigo(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Aprobar y firmar' }));

    expect(await screen.findByText(/la evidencia en PDF ya está disponible/)).toBeInTheDocument();
  });

  it('informa cuando el aprobador ya había decidido', async () => {
    const usuario = userEvent.setup();
    apiMock.registrarDecision.mockRejectedValue(
      new ErrorDeApi('TRANSICION_INVALIDA', 'Usted ya registró su decisión sobre esta solicitud'),
    );
    montar();
    await validarConCodigo(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Aprobar y firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ya registró su decisión');
  });

  it('muestra el código en modo demostración', async () => {
    montar();
    expect(await screen.findByText('123456')).toBeInTheDocument();
  });

  it('no muestra pista de demostración si el backend no expone el OTP', async () => {
    apiMock.solicitarOtp.mockResolvedValue(respuestaOtpDe({ otpDemo: null }));
    montar();

    await screen.findByLabelText('Código de verificación');
    expect(screen.queryByText(/Modo demostración/)).not.toBeInTheDocument();
  });

  it('muestra el error si no se puede pedir el código', async () => {
    apiMock.solicitarOtp.mockRejectedValue(
      new ErrorDeApi('NO_ENCONTRADO', 'El enlace de aprobación no es válido'),
    );
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de aprobación no es válido');
  });
});
