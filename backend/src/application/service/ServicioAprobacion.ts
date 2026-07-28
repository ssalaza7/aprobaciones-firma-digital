import {
  ErrorRecursoNoEncontrado,
  ErrorTransicionInvalida,
  ErrorValidacion,
} from '../../domain/exception/errores';
import { Aprobador } from '../../domain/model/Aprobador';
import { CalculadorHash } from '../../domain/model/CalculadorHash';
import { CodigoOtp } from '../../domain/model/CodigoOtp';
import { etiquetaRol } from '../../domain/model/RolAprobador';
import { Solicitud } from '../../domain/model/Solicitud';
import { aVistaAprobador, aVistaSolicitud, VistaDetalleAprobacion } from '../dto/vistas';
import {
  AprobacionUseCase,
  ComandoRegistrarDecision,
  ComandoSolicitarOtp,
  ComandoValidarOtp,
  ResultadoDecision,
  ResultadoSolicitarOtp,
} from '../port/in/AprobacionUseCase';
import { NotificadorPort } from '../port/out/NotificadorPort';
import { RepositorioSolicitudesPort } from '../port/out/RepositorioSolicitudesPort';
import { GeneradorIdentificadoresPort, RelojPort } from '../port/out/SistemaPorts';
import { GeneradorEvidenciaInterno } from './ServicioEvidencia';

export interface OpcionesAprobacion {
  /**
   * Devuelve el OTP en la respuesta HTTP. Solo para entornos de demostración:
   * ver README, sección "Supuestos".
   */
  exponerOtp: boolean;
}

/**
 * Caso de uso del aprobador: pedir el código, validarlo y registrar la
 * decisión. Al completarse la tercera firma dispara la evidencia y el cierre.
 */
export class ServicioAprobacion implements AprobacionUseCase {
  constructor(
    private readonly repositorio: RepositorioSolicitudesPort,
    private readonly notificador: NotificadorPort,
    private readonly reloj: RelojPort,
    private readonly identificadores: GeneradorIdentificadoresPort,
    private readonly evidencia: GeneradorEvidenciaInterno,
    private readonly hash: CalculadorHash,
    private readonly opciones: OpcionesAprobacion = { exponerOtp: false },
  ) {}

  async solicitarOtp(comando: ComandoSolicitarOtp): Promise<ResultadoSolicitarOtp> {
    const { solicitud, aprobador } = await this.resolver(comando.solicitudId, comando.tokenAprobador);
    this.exigirFlujoAbierto(solicitud, aprobador);

    const ahora = this.reloj.ahora();
    const otp = aprobador.emitirOtp(this.identificadores.otp(), ahora);
    await this.repositorio.actualizar(solicitud);

    await this.notificador.enviar({
      id: this.identificadores.uuid(),
      para: aprobador.correo.valor,
      asunto: `[Aprobaciones] Su código de verificación es ${otp.codigo}`,
      cuerpo: [
        `Hola ${aprobador.nombre},`,
        '',
        `Su código para revisar la solicitud "${solicitud.titulo}" es: ${otp.codigo}`,
        '',
        'Vence en 3 minutos y solo puede usarse una vez.',
      ].join('\n'),
      enviadoEn: ahora.toISOString(),
      contexto: { solicitudId: solicitud.id, tipo: 'CODIGO_OTP', otp: otp.codigo },
    });

    return {
      solicitudId: solicitud.id,
      tituloSolicitud: solicitud.titulo,
      aprobador: {
        nombre: aprobador.nombre,
        correo: enmascarar(aprobador.correo.valor),
        rol: aprobador.rol,
        etiquetaRol: etiquetaRol(aprobador.rol),
      },
      enviadoA: enmascarar(aprobador.correo.valor),
      expiraEn: otp.expiraEn.toISOString(),
      segundosVigencia: Math.round(CodigoOtp.VIGENCIA_MS / 1000),
      otpDemo: this.opciones.exponerOtp ? otp.codigo : null,
    };
  }

  async validarOtp(comando: ComandoValidarOtp): Promise<VistaDetalleAprobacion> {
    const { solicitud, aprobador } = await this.resolver(comando.solicitudId, comando.tokenAprobador);
    this.exigirFlujoAbierto(solicitud, aprobador);

    if (!/^\d{4,8}$/.test((comando.codigo ?? '').trim())) {
      throw new ErrorValidacion('El código debe ser numérico');
    }

    const ahora = this.reloj.ahora();
    const tokenSesion = this.identificadores.uuid();
    const resultado = aprobador.verificarOtp(comando.codigo, tokenSesion, ahora);

    // Se persiste siempre: incluso el intento fallido cuenta para el bloqueo.
    await this.repositorio.actualizar(solicitud);
    if (!resultado.valido) {
      throw resultado.error;
    }

    const vista = aVistaSolicitud(solicitud);
    return {
      solicitud: {
        id: vista.id,
        titulo: vista.titulo,
        descripcion: vista.descripcion,
        monto: vista.monto,
        solicitante: vista.solicitante,
        estado: vista.estado,
        creadaEn: vista.creadaEn,
        actualizadaEn: vista.actualizadaEn,
        aprobadores: vista.aprobadores,
        firmasRegistradas: vista.firmasRegistradas,
        aprobadoresRequeridos: vista.aprobadoresRequeridos,
      },
      aprobador: aVistaAprobador(aprobador),
      tokenSesion,
      sesionExpiraEn: new Date(ahora.getTime() + Aprobador.VIGENCIA_SESION_MS).toISOString(),
    };
  }

  async registrarDecision(comando: ComandoRegistrarDecision): Promise<ResultadoDecision> {
    const { solicitud, aprobador } = await this.resolver(comando.solicitudId, comando.tokenAprobador);
    this.exigirFlujoAbierto(solicitud, aprobador);

    const ahora = this.reloj.ahora();
    aprobador.exigirSesionValida(comando.tokenSesion, ahora);

    if (comando.decision !== 'APROBAR' && comando.decision !== 'RECHAZAR') {
      throw new ErrorValidacion('La decisión debe ser APROBAR o RECHAZAR');
    }

    if (comando.decision === 'APROBAR') {
      solicitud.registrarFirma(aprobador, ahora, this.hash);
    } else {
      solicitud.registrarRechazo(aprobador, ahora, comando.motivo);
    }

    let actualizada = await this.repositorio.actualizar(solicitud);

    if (comando.decision === 'APROBAR' && actualizada.todasFirmadas()) {
      // La firma ya está persistida; si el PDF falla, la solicitud no se pierde
      // y la evidencia se reintenta en la primera descarga.
      try {
        actualizada = await this.evidencia.asegurar(actualizada);
      } catch (error) {
        console.error('No se pudo generar la evidencia tras la última firma', {
          solicitudId: actualizada.id,
          error,
        });
      }
    }

    await this.notificarSolicitante(actualizada, aprobador, ahora).catch((error) =>
      console.error('No se pudo simular el aviso al solicitante', error),
    );

    return {
      solicitud: aVistaSolicitud(actualizada),
      mensaje:
        comando.decision === 'APROBAR'
          ? `Firma registrada. ${actualizada.firmasRegistradas} de ${actualizada.aprobadores.length} aprobadores han firmado.`
          : 'Solicitud rechazada. Se notificó al solicitante.',
    };
  }

  /** Resuelve token → solicitud y verifica que corresponda al id recibido. */
  private async resolver(
    solicitudId: string,
    tokenAprobador: string,
  ): Promise<{ solicitud: Solicitud; aprobador: Aprobador }> {
    if (!tokenAprobador || !solicitudId) {
      throw new ErrorValidacion('Se requieren solicitud_id y approver_token');
    }
    const solicitud = await this.repositorio.buscarPorTokenAprobador(tokenAprobador);
    if (!solicitud || solicitud.id !== solicitudId) {
      throw new ErrorRecursoNoEncontrado('El enlace de aprobación no es válido');
    }
    return { solicitud, aprobador: solicitud.aprobadorPorToken(tokenAprobador) };
  }

  private exigirFlujoAbierto(solicitud: Solicitud, aprobador: Aprobador): void {
    if (!solicitud.estaEnCurso()) {
      throw new ErrorTransicionInvalida(
        `La solicitud ya está ${solicitud.estado.toLowerCase()}; no admite más decisiones`,
      );
    }
    if (!aprobador.estaPendiente()) {
      throw new ErrorTransicionInvalida(
        `Usted ya registró su decisión sobre esta solicitud (${aprobador.estado})`,
      );
    }
  }

  private async notificarSolicitante(
    solicitud: Solicitud,
    aprobador: Aprobador,
    ahora: Date,
  ): Promise<void> {
    const resumen =
      solicitud.estado === 'RECHAZADA'
        ? `${aprobador.nombre} (${etiquetaRol(aprobador.rol)}) rechazó la solicitud.`
        : solicitud.estado === 'COMPLETADA'
          ? 'Se completaron las tres firmas. La evidencia en PDF ya está disponible.'
          : `${aprobador.nombre} (${etiquetaRol(aprobador.rol)}) firmó. Faltan ${
              solicitud.aprobadores.length - solicitud.firmasRegistradas
            } firma(s).`;

    await this.notificador.enviar({
      id: this.identificadores.uuid(),
      para: solicitud.solicitante.correo.valor,
      asunto: `[Aprobaciones] ${solicitud.titulo}: ${solicitud.estado}`,
      cuerpo: `Hola ${solicitud.solicitante.nombre},\n\n${resumen}`,
      enviadoEn: ahora.toISOString(),
      contexto: { solicitudId: solicitud.id, tipo: 'RESULTADO_SOLICITUD' },
    });
  }
}

/** j***@empresa.com — no se devuelve el correo completo a quien abre el enlace. */
function enmascarar(correo: string): string {
  const [usuario, dominio] = correo.split('@');
  const visible = usuario.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(usuario.length - 1, 1))}@${dominio}`;
}
