import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, ErrorDeApi } from '@aprobaciones/shared';
import FormularioSolicitud from '../src/componentes/FormularioSolicitud';
import { solicitudDe } from '../../../test/dobles/api';

jest.mock('@aprobaciones/shared', () => ({
  ...jest.requireActual('@aprobaciones/shared'),
  api: {
    roles: jest.fn(),
    crearSolicitud: jest.fn(),
  },
}));

const apiMock = api as jest.Mocked<typeof api>;

const ROLES = [
  { rol: 'JEFE_AREA', etiqueta: 'Jefe de Área' },
  { rol: 'FINANZAS', etiqueta: 'Finanzas' },
  { rol: 'GERENCIA', etiqueta: 'Gerencia' },
];

const llenarFormularioValido = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.type(screen.getByPlaceholderText('Compra de 15 portátiles'), 'Compra de portátiles');
  await usuario.type(
    screen.getByPlaceholderText(/Detalle del bien o servicio/),
    'Renovación de equipos del área de operaciones',
  );
  await usuario.type(screen.getByPlaceholderText('45000000'), '45000000');
  await usuario.type(screen.getByPlaceholderText('Ana Restrepo'), 'Ana Restrepo');
  await usuario.type(screen.getByPlaceholderText('ana.restrepo@empresa.com'), 'ana@empresa.com');

  const datos = [
    ['JEFE_AREA', 'Carlos Pérez', 'carlos@empresa.com'],
    ['FINANZAS', 'Diana Gómez', 'diana@empresa.com'],
    ['GERENCIA', 'Esteban Ruiz', 'esteban@empresa.com'],
  ];
  for (let i = 0; i < datos.length; i += 1) {
    await usuario.selectOptions(screen.getByLabelText(`Rol del aprobador ${i + 1}`), datos[i][0]);
    await usuario.type(screen.getByLabelText(`Nombre del aprobador ${i + 1}`), datos[i][1]);
    await usuario.type(screen.getByLabelText(`Correo del aprobador ${i + 1}`), datos[i][2]);
  }
};

describe('FormularioSolicitud', () => {
  beforeEach(() => {
    apiMock.roles.mockResolvedValue(ROLES);
    apiMock.crearSolicitud.mockResolvedValue({
      solicitud: solicitudDe(),
      enlacesAprobacion: [],
    });
  });

  it('carga el catálogo de roles del backend', async () => {
    render(<FormularioSolicitud />);
    await waitFor(() => expect(apiMock.roles).toHaveBeenCalled());
    // Una opción por cada uno de los tres selectores de rol.
    expect(await screen.findAllByRole('option', { name: 'Jefe de Área' })).toHaveLength(3);
  });

  it('pide exactamente tres aprobadores', async () => {
    render(<FormularioSolicitud />);
    await waitFor(() => expect(apiMock.roles).toHaveBeenCalled());

    expect(screen.getByLabelText('Rol del aprobador 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Rol del aprobador 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rol del aprobador 4')).not.toBeInTheDocument();
  });

  it('no envía nada y muestra los errores cuando el formulario está vacío', async () => {
    const usuario = userEvent.setup();
    render(<FormularioSolicitud />);
    await waitFor(() => expect(apiMock.roles).toHaveBeenCalled());

    await usuario.click(screen.getByRole('button', { name: /Crear solicitud/ }));

    expect(await screen.findByText('El título debe tener al menos 5 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Indique su nombre completo')).toBeInTheDocument();
    expect(screen.getAllByText('Seleccione un rol')).toHaveLength(3);
    expect(apiMock.crearSolicitud).not.toHaveBeenCalled();
  });

  it('impide elegir el mismo rol dos veces', async () => {
    const usuario = userEvent.setup();
    render(<FormularioSolicitud />);
    await waitFor(() => expect(apiMock.roles).toHaveBeenCalled());

    await usuario.selectOptions(screen.getByLabelText('Rol del aprobador 1'), 'FINANZAS');

    const opcionesSegundo = screen.getByLabelText('Rol del aprobador 2') as HTMLSelectElement;
    const finanzas = Array.from(opcionesSegundo.options).find((o) => o.value === 'FINANZAS');
    expect(finanzas?.disabled).toBe(true);
  });

  it('envía la solicitud al backend y avisa al host con el id creado', async () => {
    const usuario = userEvent.setup();
    const onCreada = jest.fn();
    render(<FormularioSolicitud onCreada={onCreada} />);
    await waitFor(() => expect(apiMock.roles).toHaveBeenCalled());

    await llenarFormularioValido(usuario);
    await usuario.click(screen.getByRole('button', { name: /Crear solicitud/ }));

    await waitFor(() => expect(apiMock.crearSolicitud).toHaveBeenCalledTimes(1));
    expect(apiMock.crearSolicitud).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Compra de portátiles',
        monto: 45000000,
        moneda: 'COP',
        solicitante: { nombre: 'Ana Restrepo', correo: 'ana@empresa.com' },
        aprobadores: [
          { nombre: 'Carlos Pérez', correo: 'carlos@empresa.com', rol: 'JEFE_AREA' },
          { nombre: 'Diana Gómez', correo: 'diana@empresa.com', rol: 'FINANZAS' },
          { nombre: 'Esteban Ruiz', correo: 'esteban@empresa.com', rol: 'GERENCIA' },
        ],
      }),
    );
    expect(onCreada).toHaveBeenCalledWith('sol-1');
  });

  it('muestra el error del backend sin inventar mensajes propios', async () => {
    const usuario = userEvent.setup();
    apiMock.crearSolicitud.mockRejectedValue(
      new ErrorDeApi('VALIDACION', 'Los tres aprobadores deben tener roles distintos'),
    );
    render(<FormularioSolicitud />);
    await waitFor(() => expect(apiMock.roles).toHaveBeenCalled());

    await llenarFormularioValido(usuario);
    await usuario.click(screen.getByRole('button', { name: /Crear solicitud/ }));

    expect(
      await screen.findByText('Los tres aprobadores deben tener roles distintos'),
    ).toBeInTheDocument();
  });

  it('avisa si no puede cargar los roles', async () => {
    apiMock.roles.mockRejectedValue(new ErrorDeApi('SIN_CONEXION', 'sin red'));
    render(<FormularioSolicitud />);
    expect(await screen.findByText(/No fue posible cargar el catálogo de roles/)).toBeInTheDocument();
  });
});
