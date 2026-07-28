# Frontend — microfrontends del flujo de aprobaciones

React 18 con **Module Federation** de webpack 5: un contenedor y dos remotos
independientes, en un monorepo de workspaces de npm.

Visión general del proyecto y supuestos: [README raíz](../README.md).

## Paquetes

| Paquete | Puerto | Rol |
|---|---|---|
| `@aprobaciones/host` | 3000 | Contenedor: layout, rutas y carga de los remotos |
| `@aprobaciones/mf-solicitante` | 3001 | Crear solicitud, panel y detalle |
| `@aprobaciones/mf-aprobador` | 3002 | OTP, detalle de la compra y decisión |
| `@aprobaciones/shared` | — | Cliente axios, tipos de la API y componentes comunes |

## Comandos

```bash
npm install
npm run dev             # levanta los tres a la vez → http://localhost:3000
npm run build           # compila los tres dist/
npm test                # pruebas
npm run test:cobertura  # pruebas + cobertura (umbral 60 %)
npm run typecheck

# un microfrontend por separado, sin el contenedor
npm run dev -w @aprobaciones/mf-aprobador   # → http://localhost:3002
```

Cada remoto tiene su propio `index.html` y arranca solo. Es la comprobación
práctica de que son independientes: si necesitaran al host para funcionar, no
serían microfrontends.

## Rutas del host

| Ruta | Microfrontend | Pantalla |
|---|---|---|
| `/` | solicitante | Panel de solicitudes con su avance |
| `/nueva` | solicitante | Formulario de creación |
| `/solicitudes/:id` | solicitante | Detalle, firmas y descarga del PDF |
| `/approve?solicitud_id=…&approver_token=…` | aprobador | OTP → detalle → firmar/rechazar |

La última es la que llega por correo, con la forma exacta del enunciado.

## Contrato entre host y remotos

Los remotos **exponen componentes, no rutas**, y no importan `react-router`. La
navegación entra por props:

```tsx
<PanelSolicitudes onAbrir={(id) => navegar(`/solicitudes/${id}`)} onNueva={…} />
<PantallaAprobacion solicitudId={…} tokenAprobador={…} />
```

El host es el único que traduce URLs a props
([`Aplicacion.tsx`](packages/host/src/Aplicacion.tsx)), y todo el acoplamiento con
Module Federation está confinado a un archivo
([`remotos.tsx`](packages/host/src/remotos.tsx)), que además aísla los fallos: si
un remoto no carga, el contenedor sigue en pie y dice cuál falló.

Como los módulos federados se resuelven en tiempo de ejecución, su contrato se
declara a mano en
[`modulos-federados.d.ts`](packages/host/src/modulos-federados.d.ts). Es el precio
de federar: TypeScript no puede verificar el otro bundle, pero sí obliga a
escribir qué se espera de él.

## Configuración de build

| Variable | Por defecto | Para qué |
|---|---|---|
| `API_URL` | `http://localhost:4000` | URL del backend, inyectada por `DefinePlugin` |
| `URL_MF_SOLICITANTE` | `http://localhost:3001` | Origen del remoto (solo host) |
| `URL_MF_APROBADOR` | `http://localhost:3002` | Origen del remoto (solo host) |

```bash
API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/dev \
URL_MF_SOLICITANTE=https://cdn.ejemplo.com/solicitante \
URL_MF_APROBADOR=https://cdn.ejemplo.com/aprobador \
npm run build
```

## Pruebas

Testing Library sobre comportamiento observable: qué ve el usuario, qué se envía
al backend y qué ocurre cuando la API falla. En las pruebas del host los remotos
se sustituyen por dobles (`moduleNameMapper` en `jest.config.js`), porque fuera de
webpack no se pueden resolver y porque cada remoto ya tiene sus propias pruebas.
