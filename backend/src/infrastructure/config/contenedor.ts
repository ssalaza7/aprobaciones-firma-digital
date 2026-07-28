import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AlmacenEvidenciasPort } from '../../application/port/out/AlmacenEvidenciasPort';
import { NotificadorPort } from '../../application/port/out/NotificadorPort';
import { RepositorioSolicitudesPort } from '../../application/port/out/RepositorioSolicitudesPort';
import { ServicioAprobacion } from '../../application/service/ServicioAprobacion';
import { ServicioBandejaSimulada } from '../../application/service/ServicioBandejaSimulada';
import { ServicioConsultarSolicitudes } from '../../application/service/ServicioConsultarSolicitudes';
import { ServicioCrearSolicitud } from '../../application/service/ServicioCrearSolicitud';
import { ServicioEvidencia } from '../../application/service/ServicioEvidencia';
import { ControladorAprobaciones } from '../adapter/in/http/ControladorAprobaciones';
import { ControladorSolicitudes } from '../adapter/in/http/ControladorSolicitudes';
import { Enrutador } from '../adapter/in/http/enrutador';
import { construirEnrutador } from '../adapter/in/http/rutas';
import { AlmacenEvidenciasArchivos } from '../adapter/out/almacen/AlmacenEvidenciasArchivos';
import { AlmacenEvidenciasS3 } from '../adapter/out/almacen/AlmacenEvidenciasS3';
import { NotificadorDynamo } from '../adapter/out/notificacion/NotificadorDynamo';
import { NotificadorEnMemoria } from '../adapter/out/notificacion/NotificadorEnMemoria';
import { GeneradorPdfKit } from '../adapter/out/pdf/GeneradorPdfKit';
import { RepositorioSolicitudesDynamo } from '../adapter/out/persistencia/dynamo/RepositorioSolicitudesDynamo';
import { RepositorioSolicitudesEnMemoria } from '../adapter/out/persistencia/memoria/RepositorioSolicitudesEnMemoria';
import {
  GeneradorIdentificadoresCrypto,
  RelojSistema,
  sha256,
} from '../adapter/out/sistema/adaptadoresSistema';
import { Configuracion, leerConfiguracion } from './configuracion';

export interface Aplicacion {
  enrutador: Enrutador;
  configuracion: Configuracion;
}

/**
 * Composition root: el único punto donde se eligen implementaciones concretas
 * de los puertos y se conectan con los casos de uso.
 *
 * El resto del código depende de interfaces, así que cambiar DynamoDB por
 * memoria (o S3 por disco) es cambiar una línea aquí.
 */
export function construirAplicacion(configuracion = leerConfiguracion()): Aplicacion {
  const reloj = new RelojSistema();
  const identificadores = new GeneradorIdentificadoresCrypto();

  const clienteDynamo =
    configuracion.persistencia === 'dynamo'
      ? DynamoDBDocumentClient.from(
          new DynamoDBClient(
            // Con endpoint propio (DynamoDB Local) hacen falta credenciales
            // ficticias; en AWS las aporta el rol de ejecución de la Lambda.
            configuracion.endpointDynamo
              ? {
                  endpoint: configuracion.endpointDynamo,
                  region: process.env.AWS_REGION ?? 'us-east-1',
                  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
                }
              : {},
          ),
          { marshallOptions: { removeUndefinedValues: true } },
        )
      : null;

  const repositorio: RepositorioSolicitudesPort =
    configuracion.persistencia === 'dynamo' && clienteDynamo
      ? new RepositorioSolicitudesDynamo(clienteDynamo, configuracion.tablaDynamo)
      : new RepositorioSolicitudesEnMemoria();

  const notificador: NotificadorPort =
    configuracion.persistencia === 'dynamo' && clienteDynamo
      ? new NotificadorDynamo(clienteDynamo, configuracion.tablaDynamo)
      : new NotificadorEnMemoria();

  const almacen: AlmacenEvidenciasPort =
    configuracion.almacen === 's3'
      ? new AlmacenEvidenciasS3(new S3Client({}), configuracion.bucketEvidencias)
      : new AlmacenEvidenciasArchivos(configuracion.directorioEvidencias);

  const generadorPdf = new GeneradorPdfKit(sha256);

  const servicioEvidencia = new ServicioEvidencia(repositorio, generadorPdf, almacen, reloj);
  const servicioCrear = new ServicioCrearSolicitud(
    repositorio,
    notificador,
    reloj,
    identificadores,
    configuracion.urlBaseFrontend,
  );
  const servicioConsultar = new ServicioConsultarSolicitudes(repositorio);
  const servicioAprobacion = new ServicioAprobacion(
    repositorio,
    notificador,
    reloj,
    identificadores,
    servicioEvidencia,
    sha256,
    { exponerOtp: configuracion.exponerOtp },
  );
  const servicioBandeja = new ServicioBandejaSimulada(notificador);

  const enrutador = construirEnrutador(
    new ControladorSolicitudes(servicioCrear, servicioConsultar, servicioEvidencia),
    new ControladorAprobaciones(servicioAprobacion, servicioBandeja),
  );

  return { enrutador, configuracion };
}
