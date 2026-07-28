import { DetalleAprobacion, RespuestaOtp, Solicitud } from '@aprobaciones/shared';

/**
 * Fábricas de datos para las pruebas.
 *
 * Reproducen el contrato real del backend; si la API cambia, TypeScript rompe
 * aquí antes que en producción.
 */

export const aprobadorDe = (
  indice: number,
  cambios: Partial<Solicitud['aprobadores'][number]> = {},
): Solicitud['aprobadores'][number] => ({
  id: `a${indice}`,
  nombre: ['Carlos Pérez', 'Diana Gómez', 'Esteban Ruiz'][indice - 1],
  correo: ['carlos@empresa.com', 'diana@empresa.com', 'esteban@empresa.com'][indice - 1],
  rol: ['JEFE_AREA', 'FINANZAS', 'GERENCIA'][indice - 1],
  etiquetaRol: ['Jefe de Área', 'Finanzas', 'Gerencia'][indice - 1],
  estado: 'PENDIENTE',
  firmadoEn: null,
  trazoFirma: null,
  rechazadoEn: null,
  motivoRechazo: null,
  secuenciaFirma: null,
  hashFirma: null,
  ...cambios,
});

export const solicitudDe = (cambios: Partial<Solicitud> = {}): Solicitud => ({
  id: 'sol-1',
  titulo: 'Compra de 15 portátiles',
  descripcion: 'Renovación del parque de equipos del área de operaciones',
  monto: { valor: 45000000, moneda: 'COP', formateado: '$ 45.000.000,00 COP' },
  solicitante: { nombre: 'Ana Restrepo', correo: 'ana@empresa.com' },
  estado: 'PENDIENTE',
  creadaEn: '2026-03-10T14:00:00.000Z',
  actualizadaEn: '2026-03-10T14:00:00.000Z',
  aprobadores: [aprobadorDe(1), aprobadorDe(2), aprobadorDe(3)],
  firmasRegistradas: 0,
  aprobadoresRequeridos: 3,
  evidenciaDisponible: false,
  urlEvidencia: null,
  ...cambios,
});

export const respuestaOtpDe = (cambios: Partial<RespuestaOtp> = {}): RespuestaOtp => ({
  solicitudId: 'sol-1',
  tituloSolicitud: 'Compra de 15 portátiles',
  aprobador: {
    nombre: 'Carlos Pérez',
    correo: 'c*****@empresa.com',
    rol: 'JEFE_AREA',
    etiquetaRol: 'Jefe de Área',
  },
  enviadoA: 'c*****@empresa.com',
  expiraEn: new Date(Date.now() + 180_000).toISOString(),
  segundosVigencia: 180,
  otpDemo: '123456',
  ...cambios,
});

export const detalleDe = (cambios: Partial<DetalleAprobacion> = {}): DetalleAprobacion => {
  const { evidenciaDisponible, urlEvidencia, ...solicitud } = solicitudDe();
  return {
    solicitud,
    aprobador: aprobadorDe(1),
    tokenSesion: 'sesion-1',
    sesionExpiraEn: new Date(Date.now() + 900_000).toISOString(),
    ...cambios,
  };
};
