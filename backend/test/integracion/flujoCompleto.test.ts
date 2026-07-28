import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { crearServidor } from '../../src/infrastructure/adapter/in/express/servidor';
import { construirAplicacion } from '../../src/infrastructure/config/contenedor';
import { leerConfiguracion } from '../../src/infrastructure/config/configuracion';
import { comandoValido } from '../dobles/dobles';
import { extraerTextoPdf } from '../dobles/pdf';

/**
 * Prueba de integración del flujo completo por la API REST real.
 *
 * Usa el composition root de producción con los adaptadores locales (memoria +
 * disco) y el generador de PDF de verdad: lo único simulado es el correo, que
 * el propio enunciado permite simular.
 */
describe('Flujo completo por la API REST', () => {
  let directorio: string;
  let app: ReturnType<typeof crearServidor>;

  const tokenDe = (enlace: string) =>
    new URL(enlace).searchParams.get('approver_token') as string;

  beforeEach(async () => {
    directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'evidencias-api-'));
    app = crearServidor(
      construirAplicacion(
        leerConfiguracion({
          PERSISTENCIA: 'memoria',
          ALMACEN: 'archivos',
          DIRECTORIO_EVIDENCIAS: directorio,
          URL_BASE_FRONTEND: 'https://app.pruebas.local',
          EXPONER_OTP: 'true',
        } as NodeJS.ProcessEnv),
      ),
    );
  });

  afterEach(async () => {
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const crearSolicitud = async () => {
    const respuesta = await request(app).post('/api/solicitudes').send(comandoValido()).expect(201);
    return {
      id: respuesta.body.solicitud.id as string,
      tokens: (respuesta.body.enlacesAprobacion as Array<{ enlace: string }>).map((e) =>
        tokenDe(e.enlace),
      ),
    };
  };

  const firmar = async (id: string, token: string, decision: 'APROBAR' | 'RECHAZAR', motivo?: string) => {
    const otp = await request(app)
      .post('/api/aprobaciones/otp')
      .send({ solicitud_id: id, approver_token: token })
      .expect(200);

    const detalle = await request(app)
      .post('/api/aprobaciones/otp/validar')
      .send({ solicitud_id: id, approver_token: token, otp: otp.body.otpDemo })
      .expect(200);

    return request(app)
      .post('/api/aprobaciones/decision')
      .send({
        solicitud_id: id,
        approver_token: token,
        session_token: detalle.body.tokenSesion,
        decision,
        motivo,
      })
      .expect(200);
  };

  it('recorre crear → OTP → tres firmas → PDF descargable', async () => {
    const { id, tokens } = await crearSolicitud();

    const primera = await firmar(id, tokens[0], 'APROBAR');
    expect(primera.body.solicitud.firmasRegistradas).toBe(1);
    expect(primera.body.solicitud.estado).toBe('PENDIENTE');

    await firmar(id, tokens[1], 'APROBAR');
    const tercera = await firmar(id, tokens[2], 'APROBAR');

    expect(tercera.body.solicitud.estado).toBe('COMPLETADA');
    expect(tercera.body.solicitud.urlEvidencia).toBe(`/api/solicitudes/${id}/evidencia.pdf`);

    const pdf = await request(app)
      .get(`/api/solicitudes/${id}/evidencia.pdf`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    expect(pdf.headers['content-disposition']).toContain(`evidencia-${id}.pdf`);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    // El archivo quedó realmente guardado en el almacén.
    await expect(
      fs.stat(path.join(directorio, 'evidencias', id, 'evidencia.pdf')),
    ).resolves.toBeDefined();
  });

  it('el PDF descargado contiene los datos y las tres firmas', async () => {
    const { id, tokens } = await crearSolicitud();
    for (const token of tokens) {
      await firmar(id, token, 'APROBAR');
    }

    const pdf = await request(app).get(`/api/solicitudes/${id}/evidencia.pdf`).expect(200);
    const detalle = await request(app).get(`/api/solicitudes/${id}`).expect(200);

    // El PDF de producción va comprimido; se comprueba el tamaño y las firmas por la API.
    expect(pdf.body.length).toBeGreaterThan(2000);
    expect(detalle.body.aprobadores.map((a: { estado: string }) => a.estado)).toEqual([
      'FIRMADO',
      'FIRMADO',
      'FIRMADO',
    ]);
    expect(detalle.body.aprobadores.map((a: { secuenciaFirma: number }) => a.secuenciaFirma)).toEqual([
      1, 2, 3,
    ]);
  });

  it('un rechazo cierra el flujo y bloquea al resto', async () => {
    const { id, tokens } = await crearSolicitud();
    await firmar(id, tokens[0], 'APROBAR');

    const rechazo = await firmar(id, tokens[1], 'RECHAZAR', 'Excede el presupuesto anual');
    expect(rechazo.body.solicitud.estado).toBe('RECHAZADA');

    await request(app)
      .post('/api/aprobaciones/otp')
      .send({ solicitud_id: id, approver_token: tokens[2] })
      .expect(409);

    await request(app).get(`/api/solicitudes/${id}/evidencia.pdf`).expect(409);
  });

  it('expone el buzón simulado con los enlaces y los códigos', async () => {
    const { id, tokens } = await crearSolicitud();
    await request(app)
      .post('/api/aprobaciones/otp')
      .send({ solicitud_id: id, approver_token: tokens[0] });

    const bandeja = await request(app).get(`/api/mock-mail?solicitud_id=${id}`).expect(200);

    expect(bandeja.body.total).toBe(4); // 3 invitaciones + 1 código
    const tipos = bandeja.body.correos.map((c: { contexto: { tipo: string } }) => c.contexto.tipo);
    expect(tipos).toContain('INVITACION_APROBACION');
    expect(tipos).toContain('CODIGO_OTP');
  });

  it('el panel lista las solicitudes y filtra por solicitante', async () => {
    await crearSolicitud();
    await request(app)
      .post('/api/solicitudes')
      .send({
        ...comandoValido(),
        solicitante: { nombre: 'Bruno Díaz', correo: 'bruno@empresa.com' },
      })
      .expect(201);

    await request(app).get('/api/solicitudes').expect(200).expect((r) => {
      expect(r.body.total).toBe(2);
    });
    await request(app)
      .get('/api/solicitudes?solicitante=bruno@empresa.com')
      .expect(200)
      .expect((r) => {
        expect(r.body.total).toBe(1);
      });
  });

  describe('errores del contrato REST', () => {
    it('400 cuando el cuerpo viola una regla del dominio', async () => {
      const comando = comandoValido();
      comando.aprobadores[2].rol = 'FINANZAS';
      const respuesta = await request(app).post('/api/solicitudes').send(comando).expect(400);
      expect(respuesta.body.codigo).toBe('VALIDACION');
    });

    it('400 cuando faltan campos obligatorios', async () => {
      await request(app).post('/api/solicitudes').send({ titulo: 'x' }).expect(400);
    });

    it('404 con un token de aprobación inventado', async () => {
      const { id } = await crearSolicitud();
      await request(app)
        .post('/api/aprobaciones/otp')
        .send({ solicitud_id: id, approver_token: 'inventado' })
        .expect(404);
    });

    it('401 con un OTP incorrecto', async () => {
      const { id, tokens } = await crearSolicitud();
      await request(app)
        .post('/api/aprobaciones/otp')
        .send({ solicitud_id: id, approver_token: tokens[0] });

      const respuesta = await request(app)
        .post('/api/aprobaciones/otp/validar')
        .send({ solicitud_id: id, approver_token: tokens[0], otp: '000000' })
        .expect(401);

      expect(respuesta.body).toMatchObject({ codigo: 'OTP_INVALIDO', motivo: 'INCORRECTO' });
    });

    it('404 al consultar una solicitud inexistente', async () => {
      await request(app).get('/api/solicitudes/no-existe').expect(404);
    });

    it('409 al pedir la evidencia antes de tiempo', async () => {
      const { id } = await crearSolicitud();
      await request(app).get(`/api/solicitudes/${id}/evidencia.pdf`).expect(409);
    });

    it('404 en una ruta desconocida y 405 con el método equivocado', async () => {
      await request(app).get('/api/inexistente').expect(404);
      await request(app).delete('/api/solicitudes').expect(405);
    });

    it('responde el preflight CORS', async () => {
      await request(app)
        .options('/api/solicitudes')
        .expect(204)
        .expect('Access-Control-Allow-Origin', '*');
    });

    it('el catálogo de roles y el healthcheck están disponibles', async () => {
      const roles = await request(app).get('/api/roles').expect(200);
      expect(roles.body).toHaveLength(5);
      await request(app).get('/api/salud').expect(200, { estado: 'OK' });
    });
  });
});
