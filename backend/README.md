# Backend — API de aprobaciones

TypeScript sobre Node, arquitectura hexagonal, desplegable como AWS Lambda y
ejecutable en local como servidor Express con el mismo código.

Visión general del proyecto, supuestos y flujo completo: [README raíz](../README.md).

## Comandos

```bash
npm install
npm run dev             # servidor local con recarga (memoria + disco)
npm run dev:dynamo      # igual, pero contra DynamoDB Local
npm test                # pruebas
npm run test:cobertura  # pruebas + cobertura (umbral 60 % global, 90 % dominio)
npm run typecheck       # tsc --noEmit
npm run build           # compila a dist/
npm run tabla:local     # crea la tabla en DynamoDB Local
```

## Mapa del código

| Carpeta | Regla que la gobierna |
|---|---|
| `src/domain` | No importa nada externo. Ni framework, ni SDK, ni `node:crypto`. |
| `src/application` | Solo conoce el dominio y sus propios puertos. Orquesta, no decide. |
| `src/infrastructure` | Puede conocerlo todo. Aquí vive lo reemplazable. |

El punto donde se elige la implementación concreta de cada puerto es
[`infrastructure/config/contenedor.ts`](src/infrastructure/config/contenedor.ts).
Es el único archivo que sabe, a la vez, que existen DynamoDB y el repositorio en
memoria.

### Puertos de salida

| Puerto | Implementaciones |
|---|---|
| `RepositorioSolicitudesPort` | DynamoDB · memoria |
| `AlmacenEvidenciasPort` | S3 · sistema de archivos |
| `NotificadorPort` | memoria · DynamoDB (buzón simulado) |
| `GeneradorPdfPort` | pdfkit |
| `RelojPort`, `GeneradorIdentificadoresPort` | sistema · dobles de prueba |
| `CalculadorHash` (servicio de dominio) | SHA-256 |

Los dos últimos existen para que el indeterminismo entre por inyección: así la
expiración del OTP a los 3 minutos se prueba en milisegundos y los tokens de las
pruebas son predecibles.

## Modelo de datos (DynamoDB, tabla única)

| Elemento | PK | SK | GSI1 (solicitante) | GSI2 (tipo) |
|---|---|---|---|---|
| Solicitud | `SOL#<id>` | `META` | `SOLICITANTE#<correo>` / `creadaEn` | `SOLICITUD` / `creadaEn` |
| Índice de token | `TOK#<token>` | `TOKEN` | — | — |
| Correo simulado | `MAIL#<id>` | `MAIL` | — | `MAIL` / `enviadoEn` |

Los tres aprobadores viajan **dentro** del elemento de la solicitud: son parte del
agregado, se leen y escriben de forma atómica, y por eso la regla de las tres
firmas nunca observa un estado intermedio. El elemento `TOK#` es un índice inverso
para resolver el enlace del correo sin escanear la tabla.

Las escrituras usan `ConditionExpression` sobre `version` (bloqueo optimista): dos
firmas simultáneas no se pisan, una recibe `409`. El alta escribe la solicitud y
los tres índices en una transacción.

Detalle y comentarios: [`esquema.ts`](src/infrastructure/adapter/out/persistencia/dynamo/esquema.ts).

## Pruebas

```
test/domain/         reglas de negocio y casos borde
test/application/    casos de uso con adaptadores en memoria y reloj falso
test/infrastructure/ adaptadores (AWS simulado, PDF real, router, CORS)
test/integracion/    flujo completo por HTTP (Express y Lambda) y DynamoDB Local
```

`test/integracion/dynamoLocal.test.ts` necesita el contenedor levantado; si no
está, las pruebas se omiten solas en lugar de fallar:

```bash
docker compose -f ../infra/docker-compose.yml up -d
npm run tabla:local
npm test
```
