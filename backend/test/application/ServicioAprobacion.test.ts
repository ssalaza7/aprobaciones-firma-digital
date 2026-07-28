import {
  ErrorOtpInvalido,
  ErrorRecursoNoEncontrado,
  ErrorSesionInvalida,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../../src/domain/exception/errores';
import { CodigoOtp } from '../../src/domain/model/CodigoOtp';
import { comandoValido } from '../dobles/dobles';
import { crearEntorno, decidir, Entorno } from '../dobles/entorno';

describe('ServicioAprobacion', () => {
  let entorno: Entorno;
  let solicitudId: string;
  let tokens: string[];

  beforeEach(async () => {
    entorno = crearEntorno();
    const resultado = await entorno.crear.ejecutar(comandoValido());
    solicitudId = resultado.solicitud.id;
    tokens = resultado.enlacesAprobacion.map(
      ({ enlace }) => new URL(enlace).searchParams.get('approver_token') as string,
    );
  });

  describe('solicitud del OTP', () => {
    it('emite un código y lo envía por el buzón simulado', async () => {
      const resultado = await entorno.aprobacion.solicitarOtp({
        solicitudId,
        tokenAprobador: tokens[0],
      });

      expect(resultado.segundosVigencia).toBe(180);
      const correos = await entorno.notificador.bandeja({ solicitudId });
      const correoOtp = correos.find((correo) => correo.contexto.tipo === 'CODIGO_OTP');
      expect(correoOtp?.contexto.otp).toBe(resultado.otpDemo);
      expect(correoOtp?.para).toBe('carlos.perez@empresa.com');
    });

    it('no revela el correo completo del aprobador en la respuesta', async () => {
      const resultado = await entorno.aprobacion.solicitarOtp({
        solicitudId,
        tokenAprobador: tokens[0],
      });
      expect(resultado.enviadoA).not.toBe('carlos.perez@empresa.com');
      expect(resultado.enviadoA).toMatch(/^c\*+@empresa\.com$/);
    });

    it('no expone el OTP cuando la demo está desactivada', async () => {
      const cerrado = crearEntorno({ exponerOtp: false });
      const creada = await cerrado.crear.ejecutar(comandoValido());
      const token = new URL(creada.enlacesAprobacion[0].enlace).searchParams.get(
        'approver_token',
      ) as string;

      const resultado = await cerrado.aprobacion.solicitarOtp({
        solicitudId: creada.solicitud.id,
        tokenAprobador: token,
      });
      expect(resultado.otpDemo).toBeNull();
    });

    it('rechaza un token que no existe', async () => {
      await expect(
        entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: 'token-falso' }),
      ).rejects.toThrow(ErrorRecursoNoEncontrado);
    });

    it('rechaza un token válido con el id de otra solicitud', async () => {
      const otra = await entorno.crear.ejecutar({
        ...comandoValido(),
        titulo: 'Otra compra distinta',
      });
      await expect(
        entorno.aprobacion.solicitarOtp({ solicitudId: otra.solicitud.id, tokenAprobador: tokens[0] }),
      ).rejects.toThrow(ErrorRecursoNoEncontrado);
    });

    it('exige ambos parámetros del enlace', async () => {
      await expect(
        entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: '' }),
      ).rejects.toThrow(ErrorValidacion);
    });
  });

  describe('validación del OTP', () => {
    it('muestra el detalle de la compra cuando el código es correcto', async () => {
      const { otpDemo } = await entorno.aprobacion.solicitarOtp({
        solicitudId,
        tokenAprobador: tokens[1],
      });

      const detalle = await entorno.aprobacion.validarOtp({
        solicitudId,
        tokenAprobador: tokens[1],
        codigo: otpDemo as string,
      });

      expect(detalle.solicitud.titulo).toBe('Compra de 15 portátiles');
      expect(detalle.solicitud.monto.valor).toBe(45_000_000);
      expect(detalle.aprobador.rol).toBe('FINANZAS');
      expect(detalle.tokenSesion).toBeTruthy();
    });

    it('rechaza un código incorrecto', async () => {
      await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      await expect(
        entorno.aprobacion.validarOtp({ solicitudId, tokenAprobador: tokens[0], codigo: '000000' }),
      ).rejects.toThrow(ErrorOtpInvalido);
    });

    it('rechaza el código después de 3 minutos', async () => {
      const { otpDemo } = await entorno.aprobacion.solicitarOtp({
        solicitudId,
        tokenAprobador: tokens[0],
      });
      entorno.reloj.avanzar(CodigoOtp.VIGENCIA_MS + 1000);

      await expect(
        entorno.aprobacion.validarOtp({
          solicitudId,
          tokenAprobador: tokens[0],
          codigo: otpDemo as string,
        }),
      ).rejects.toMatchObject({ motivo: 'EXPIRADO' });
    });

    it('acepta el código justo antes de que expire', async () => {
      const { otpDemo } = await entorno.aprobacion.solicitarOtp({
        solicitudId,
        tokenAprobador: tokens[0],
      });
      entorno.reloj.avanzar(CodigoOtp.VIGENCIA_MS - 1000);

      await expect(
        entorno.aprobacion.validarOtp({
          solicitudId,
          tokenAprobador: tokens[0],
          codigo: otpDemo as string,
        }),
      ).resolves.toBeDefined();
    });

    it('persiste los intentos fallidos y bloquea al sexto', async () => {
      await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });

      for (let i = 0; i < CodigoOtp.MAX_INTENTOS; i += 1) {
        await expect(
          entorno.aprobacion.validarOtp({ solicitudId, tokenAprobador: tokens[0], codigo: '000000' }),
        ).rejects.toMatchObject({ motivo: 'INCORRECTO' });
      }

      await expect(
        entorno.aprobacion.validarOtp({ solicitudId, tokenAprobador: tokens[0], codigo: '000000' }),
      ).rejects.toMatchObject({ motivo: 'BLOQUEADO' });
    });

    it('un OTP nuevo desbloquea tras los intentos fallidos', async () => {
      await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      for (let i = 0; i < CodigoOtp.MAX_INTENTOS; i += 1) {
        await entorno.aprobacion
          .validarOtp({ solicitudId, tokenAprobador: tokens[0], codigo: '000000' })
          .catch(() => undefined);
      }

      const nuevo = await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      await expect(
        entorno.aprobacion.validarOtp({
          solicitudId,
          tokenAprobador: tokens[0],
          codigo: nuevo.otpDemo as string,
        }),
      ).resolves.toBeDefined();
    });

    it('exige que el código sea numérico', async () => {
      await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      await expect(
        entorno.aprobacion.validarOtp({ solicitudId, tokenAprobador: tokens[0], codigo: 'abcdef' }),
      ).rejects.toThrow(ErrorValidacion);
    });

    it('exige haber pedido un código antes', async () => {
      await expect(
        entorno.aprobacion.validarOtp({ solicitudId, tokenAprobador: tokens[0], codigo: '123456' }),
      ).rejects.toThrow(ErrorSesionInvalida);
    });
  });

  describe('registro de la decisión', () => {
    it('firma y refleja el avance', async () => {
      const resultado = await decidir(entorno, solicitudId, tokens[0], 'APROBAR');

      expect(resultado.solicitud.firmasRegistradas).toBe(1);
      expect(resultado.solicitud.estado).toBe('PENDIENTE');
      expect(resultado.solicitud.aprobadores[0].estado).toBe('FIRMADO');
      expect(resultado.solicitud.aprobadores[0].firmadoEn).toBe(
        entorno.reloj.ahora().toISOString(),
      );
      expect(resultado.mensaje).toContain('1 de 3');
    });

    it('rechaza y cierra el flujo con motivo y fecha', async () => {
      const resultado = await decidir(
        entorno,
        solicitudId,
        tokens[1],
        'RECHAZAR',
        'Excede el presupuesto',
      );

      expect(resultado.solicitud.estado).toBe('RECHAZADA');
      expect(resultado.solicitud.aprobadores[1].motivoRechazo).toBe('Excede el presupuesto');
      expect(resultado.solicitud.aprobadores[1].rechazadoEn).toBeTruthy();
    });

    it('impide decidir sin sesión válida', async () => {
      await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      await expect(
        entorno.aprobacion.registrarDecision({
          solicitudId,
          tokenAprobador: tokens[0],
          tokenSesion: 'inventado',
          decision: 'APROBAR',
        }),
      ).rejects.toThrow(ErrorSesionInvalida);
    });

    it('impide decidir dos veces con la misma sesión', async () => {
      const otp = await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      const detalle = await entorno.aprobacion.validarOtp({
        solicitudId,
        tokenAprobador: tokens[0],
        codigo: otp.otpDemo as string,
      });
      const comando = {
        solicitudId,
        tokenAprobador: tokens[0],
        tokenSesion: detalle.tokenSesion,
        decision: 'APROBAR' as const,
      };

      await entorno.aprobacion.registrarDecision(comando);
      await expect(entorno.aprobacion.registrarDecision(comando)).rejects.toThrow(
        ErrorTransicionInvalida,
      );
    });

    it('impide decidir sobre una solicitud ya rechazada', async () => {
      await decidir(entorno, solicitudId, tokens[0], 'RECHAZAR');
      await expect(
        entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[1] }),
      ).rejects.toThrow(ErrorTransicionInvalida);
    });

    it('valida que la decisión sea APROBAR o RECHAZAR', async () => {
      const otp = await entorno.aprobacion.solicitarOtp({ solicitudId, tokenAprobador: tokens[0] });
      const detalle = await entorno.aprobacion.validarOtp({
        solicitudId,
        tokenAprobador: tokens[0],
        codigo: otp.otpDemo as string,
      });

      await expect(
        entorno.aprobacion.registrarDecision({
          solicitudId,
          tokenAprobador: tokens[0],
          tokenSesion: detalle.tokenSesion,
          decision: 'QUIZAS' as never,
        }),
      ).rejects.toThrow(ErrorValidacion);
    });

    it('avisa al solicitante en cada decisión', async () => {
      await decidir(entorno, solicitudId, tokens[0], 'APROBAR');
      const avisos = (await entorno.notificador.bandeja({ solicitudId })).filter(
        (correo) => correo.contexto.tipo === 'RESULTADO_SOLICITUD',
      );
      expect(avisos[0].para).toBe('ana.restrepo@empresa.com');
    });
  });

  describe('cierre con las tres firmas', () => {
    const firmarTodo = async () => {
      for (const token of tokens) {
        entorno.reloj.avanzar(60_000);
        await decidir(entorno, solicitudId, token, 'APROBAR');
      }
    };

    it('genera la evidencia y marca la solicitud COMPLETADA', async () => {
      await firmarTodo();

      const solicitud = await entorno.consultar.porId(solicitudId);
      expect(solicitud.estado).toBe('COMPLETADA');
      expect(solicitud.evidenciaDisponible).toBe(true);
      expect(solicitud.urlEvidencia).toBe(`/api/solicitudes/${solicitudId}/evidencia.pdf`);
      expect(entorno.generadorPdf.llamadas).toBe(1);
    });

    it('encadena las tres firmas en orden', async () => {
      await firmarTodo();

      const solicitud = await entorno.consultar.porId(solicitudId);
      expect(solicitud.aprobadores.map((a) => a.secuenciaFirma)).toEqual([1, 2, 3]);
      const hashes = solicitud.aprobadores.map((a) => a.hashFirma);
      expect(new Set(hashes).size).toBe(3);
    });

    it('no pierde la firma si falla la generación del PDF', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      entorno.generadorPdf.fallar = true;

      await firmarTodo();

      const solicitud = await entorno.consultar.porId(solicitudId);
      expect(solicitud.firmasRegistradas).toBe(3);
      expect(solicitud.estado).toBe('PENDIENTE');
      expect(solicitud.evidenciaDisponible).toBe(false);
    });
  });
});
