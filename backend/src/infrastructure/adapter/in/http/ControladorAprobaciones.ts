import { AprobacionUseCase, Decision } from '../../../../application/port/in/AprobacionUseCase';
import { BandejaSimuladaUseCase } from '../../../../application/port/in/BandejaSimuladaUseCase';
import { comoObjeto, texto } from './ControladorSolicitudes';
import { json, PeticionHttp, RespuestaHttp } from './tipos';

/**
 * Adaptador de entrada web para el rol Aprobador: solicitar OTP, validarlo y
 * registrar la decisión. También expone el buzón simulado.
 */
export class ControladorAprobaciones {
  constructor(
    private readonly aprobacion: AprobacionUseCase,
    private readonly bandeja: BandejaSimuladaUseCase,
  ) {}

  solicitarOtp = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const cuerpo = comoObjeto(peticion.cuerpo);
    return json(
      200,
      await this.aprobacion.solicitarOtp({
        solicitudId: texto(cuerpo.solicitud_id ?? cuerpo.solicitudId),
        tokenAprobador: texto(cuerpo.approver_token ?? cuerpo.tokenAprobador),
      }),
    );
  };

  validarOtp = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const cuerpo = comoObjeto(peticion.cuerpo);
    return json(
      200,
      await this.aprobacion.validarOtp({
        solicitudId: texto(cuerpo.solicitud_id ?? cuerpo.solicitudId),
        tokenAprobador: texto(cuerpo.approver_token ?? cuerpo.tokenAprobador),
        codigo: texto(cuerpo.otp ?? cuerpo.codigo),
      }),
    );
  };

  registrarDecision = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const cuerpo = comoObjeto(peticion.cuerpo);
    return json(
      200,
      await this.aprobacion.registrarDecision({
        solicitudId: texto(cuerpo.solicitud_id ?? cuerpo.solicitudId),
        tokenAprobador: texto(cuerpo.approver_token ?? cuerpo.tokenAprobador),
        tokenSesion: texto(cuerpo.session_token ?? cuerpo.tokenSesion),
        decision: texto(cuerpo.decision).toUpperCase() as Decision,
        motivo: cuerpo.motivo === undefined ? undefined : texto(cuerpo.motivo),
      }),
    );
  };

  consultarBandeja = async (peticion: PeticionHttp): Promise<RespuestaHttp> => {
    const correos = await this.bandeja.consultar({
      solicitudId: peticion.query.solicitud_id ?? peticion.query.solicitudId,
      para: peticion.query.para,
    });
    return json(200, { total: correos.length, correos });
  };
}
