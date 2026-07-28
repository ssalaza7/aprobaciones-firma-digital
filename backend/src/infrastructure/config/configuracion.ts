/**
 * Configuración por variables de entorno.
 *
 * Un único lugar que lee `process.env`: el resto del código recibe la
 * configuración ya resuelta, lo que hace que las pruebas no dependan del
 * entorno de quien las ejecuta.
 */
export interface Configuracion {
  /** `dynamo` en AWS, `memoria` para la demo local sin credenciales. */
  persistencia: 'dynamo' | 'memoria';
  /** `s3` en AWS, `archivos` en local. */
  almacen: 's3' | 'archivos';
  tablaDynamo: string;
  /** Endpoint alterno de DynamoDB (DynamoDB Local). Vacío = el de AWS. */
  endpointDynamo: string;
  bucketEvidencias: string;
  directorioEvidencias: string;
  urlBaseFrontend: string;
  /** Devuelve el OTP en la respuesta de `/api/aprobaciones/otp`. */
  exponerOtp: boolean;
  puerto: number;
  origenesPermitidos: string[];
}

export function leerConfiguracion(entorno: NodeJS.ProcessEnv = process.env): Configuracion {
  const persistencia = (entorno.PERSISTENCIA ?? (entorno.TABLA_DYNAMO ? 'dynamo' : 'memoria')) as
    | 'dynamo'
    | 'memoria';
  const almacen = (entorno.ALMACEN ?? (entorno.BUCKET_EVIDENCIAS ? 's3' : 'archivos')) as
    | 's3'
    | 'archivos';

  return {
    persistencia,
    almacen,
    tablaDynamo: entorno.TABLA_DYNAMO ?? 'aprobaciones',
    endpointDynamo: entorno.DYNAMO_ENDPOINT ?? '',
    bucketEvidencias: entorno.BUCKET_EVIDENCIAS ?? '',
    directorioEvidencias: entorno.DIRECTORIO_EVIDENCIAS ?? '.datos/evidencias',
    urlBaseFrontend: entorno.URL_BASE_FRONTEND ?? 'http://localhost:3000',
    exponerOtp: (entorno.EXPONER_OTP ?? 'true').toLowerCase() === 'true',
    puerto: Number(entorno.PUERTO ?? 4000),
    origenesPermitidos: (entorno.ORIGENES_PERMITIDOS ?? '*')
      .split(',')
      .map((origen) => origen.trim())
      .filter(Boolean),
  };
}
