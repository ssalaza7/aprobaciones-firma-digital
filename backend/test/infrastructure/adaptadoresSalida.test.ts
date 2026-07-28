import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlmacenEvidenciasArchivos } from '../../src/infrastructure/adapter/out/almacen/AlmacenEvidenciasArchivos';
import { AlmacenEvidenciasS3 } from '../../src/infrastructure/adapter/out/almacen/AlmacenEvidenciasS3';
import { NotificadorDynamo } from '../../src/infrastructure/adapter/out/notificacion/NotificadorDynamo';
import { NotificadorEnMemoria } from '../../src/infrastructure/adapter/out/notificacion/NotificadorEnMemoria';
import {
  GeneradorIdentificadoresCrypto,
  RelojSistema,
  sha256,
} from '../../src/infrastructure/adapter/out/sistema/adaptadoresSistema';
import { CorreoSimulado } from '../../src/application/port/out/NotificadorPort';

const correo = (id: string, solicitudId = 'sol-1'): CorreoSimulado => ({
  id,
  para: 'carlos@empresa.com',
  asunto: 'asunto',
  cuerpo: 'cuerpo',
  enviadoEn: '2026-03-10T14:00:00.000Z',
  contexto: { solicitudId, tipo: 'CODIGO_OTP', otp: '123456' },
});

describe('AlmacenEvidenciasArchivos', () => {
  let directorio: string;

  beforeEach(async () => {
    directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'evidencias-'));
  });

  afterEach(async () => {
    await fs.rm(directorio, { recursive: true, force: true });
  });

  it('guarda y recupera el documento creando los directorios', async () => {
    const almacen = new AlmacenEvidenciasArchivos(directorio);
    await almacen.guardar('evidencias/sol-1/evidencia.pdf', Buffer.from('%PDF-1.7'), 'application/pdf');

    const documento = await almacen.obtener('evidencias/sol-1/evidencia.pdf');
    expect(documento?.contenido.toString()).toBe('%PDF-1.7');
    expect(documento?.contentType).toBe('application/pdf');
  });

  it('devuelve null si el archivo no existe', async () => {
    await expect(new AlmacenEvidenciasArchivos(directorio).obtener('no/existe.pdf')).resolves.toBeNull();
  });

  it('rechaza claves que intentan salir del directorio base', async () => {
    const almacen = new AlmacenEvidenciasArchivos(directorio);
    await expect(almacen.guardar('../fuera.pdf', Buffer.from('x'), 'application/pdf')).rejects.toThrow(
      /Clave de evidencia inválida/,
    );
  });
});

describe('AlmacenEvidenciasS3', () => {
  it('sube el objeto al bucket configurado', async () => {
    const send = jest.fn().mockResolvedValue({});
    const almacen = new AlmacenEvidenciasS3({ send } as never, 'mi-bucket');

    await almacen.guardar('clave.pdf', Buffer.from('%PDF'), 'application/pdf');

    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'mi-bucket',
      Key: 'clave.pdf',
      ContentType: 'application/pdf',
    });
  });

  it('descarga y convierte el cuerpo a Buffer', async () => {
    const send = jest.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([37, 80, 68, 70]) },
      ContentType: 'application/pdf',
    });
    const almacen = new AlmacenEvidenciasS3({ send } as never, 'mi-bucket');

    const documento = await almacen.obtener('clave.pdf');
    expect(documento?.contenido.toString()).toBe('%PDF');
  });

  it('devuelve null cuando el objeto no existe', async () => {
    const send = jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));
    await expect(new AlmacenEvidenciasS3({ send } as never, 'b').obtener('x')).resolves.toBeNull();
  });

  it('devuelve null si S3 responde sin cuerpo', async () => {
    const send = jest.fn().mockResolvedValue({});
    await expect(new AlmacenEvidenciasS3({ send } as never, 'b').obtener('x')).resolves.toBeNull();
  });

  it('propaga cualquier otro error de S3', async () => {
    const send = jest.fn().mockRejectedValue(Object.assign(new Error('denegado'), { name: 'AccessDenied' }));
    await expect(new AlmacenEvidenciasS3({ send } as never, 'b').obtener('x')).rejects.toThrow('denegado');
  });
});

describe('NotificadorEnMemoria', () => {
  it('devuelve los correos del más reciente al más antiguo', async () => {
    const notificador = new NotificadorEnMemoria();
    await notificador.enviar(correo('c1'));
    await notificador.enviar(correo('c2'));

    expect((await notificador.bandeja()).map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('filtra por solicitud y por destinatario', async () => {
    const notificador = new NotificadorEnMemoria();
    await notificador.enviar(correo('c1', 'sol-1'));
    await notificador.enviar({ ...correo('c2', 'sol-2'), para: 'otro@empresa.com' });

    expect(await notificador.bandeja({ solicitudId: 'sol-1' })).toHaveLength(1);
    expect(await notificador.bandeja({ para: 'OTRO@empresa.com' })).toHaveLength(1);
  });

  it('descarta los correos más viejos al llegar al tope', async () => {
    const notificador = new NotificadorEnMemoria(2);
    await notificador.enviar(correo('c1'));
    await notificador.enviar(correo('c2'));
    await notificador.enviar(correo('c3'));

    expect((await notificador.bandeja()).map((c) => c.id)).toEqual(['c3', 'c2']);
  });
});

describe('NotificadorDynamo', () => {
  it('persiste el correo con TTL para que el buzón sobreviva a la Lambda', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new NotificadorDynamo({ send } as never, 'tabla').enviar(correo('c1'));

    const item = send.mock.calls[0][0].input.Item;
    expect(item.PK).toBe('MAIL#c1');
    expect(item.GSI2PK).toBe('MAIL');
    expect(item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('lee el buzón por el índice de tipo y aplica los filtros', async () => {
    const send = jest.fn().mockResolvedValue({
      Items: [
        { PK: 'MAIL#c1', SK: 'MAIL', GSI2PK: 'MAIL', GSI2SK: 'x', ttl: 1, ...correo('c1', 'sol-1') },
        { PK: 'MAIL#c2', SK: 'MAIL', GSI2PK: 'MAIL', GSI2SK: 'x', ttl: 1, ...correo('c2', 'sol-2') },
      ],
    });
    const notificador = new NotificadorDynamo({ send } as never, 'tabla');

    const bandeja = await notificador.bandeja({ solicitudId: 'sol-2' });

    expect(send.mock.calls[0][0].input.IndexName).toBe('gsi2-tipo');
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0]).not.toHaveProperty('PK');
  });
});

describe('Adaptadores de sistema', () => {
  it('el reloj devuelve la hora actual', () => {
    const antes = Date.now();
    expect(new RelojSistema().ahora().getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('genera UUID distintos', () => {
    const generador = new GeneradorIdentificadoresCrypto();
    expect(generador.uuid()).not.toBe(generador.uuid());
    expect(generador.uuid()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('genera OTP de seis dígitos', () => {
    const generador = new GeneradorIdentificadoresCrypto();
    for (let i = 0; i < 50; i += 1) {
      expect(generador.otp()).toMatch(/^\d{6}$/);
    }
  });

  it('sha256 es estable y sensible al contenido', () => {
    expect(sha256('hola')).toBe(sha256('hola'));
    expect(sha256('hola')).not.toBe(sha256('holA'));
    expect(sha256('hola')).toHaveLength(64);
  });
});
