# Diagramas de arquitectura

Tres vistas del mismo sistema: **cómo se despliega** (componentes), **cómo se
estructura el código** (hexagonal) y **cómo transcurre el flujo** (secuencia).

---

## 1. Diagrama de componentes

Qué piezas existen desplegadas y cómo se comunican.

```mermaid
flowchart TB
    subgraph navegador["Navegador"]
        host["Host :3000<br/><i>contenedor, rutas y layout</i>"]
        mfs["mf-solicitante :3001<br/><i>crear, panel y detalle</i>"]
        mfa["mf-aprobador :3002<br/><i>OTP, detalle y decisión</i>"]
        host -. "Module Federation<br/>(carga en ejecución)" .-> mfs
        host -. "Module Federation" .-> mfa
    end

    subgraph aws["AWS"]
        s3web["S3 · sitio estático<br/><i>bundles de los 3 paquetes</i>"]
        apigw["API Gateway<br/><i>HTTP API</i>"]
        lambda["Lambda<br/><i>aprobaciones-api</i>"]
        dynamo[("DynamoDB<br/><i>tabla única</i>")]
        s3pdf[("S3<br/><i>evidencias PDF</i>")]
    end

    s3web -- "descarga inicial" --> navegador
    mfs -- "REST · axios" --> apigw
    mfa -- "REST · axios" --> apigw
    apigw -- "proxy ANY /{proxy+}" --> lambda
    lambda -- "solicitudes, tokens<br/>y buzón simulado" --> dynamo
    lambda -- "guarda y lee<br/>el PDF" --> s3pdf

    classDef front fill:#eaf0ff,stroke:#1d4ed8,color:#12203a
    classDef cloud fill:#fdf5e0,stroke:#8a6d1f,color:#12203a
    classDef datos fill:#e6f5ec,stroke:#116b3a,color:#12203a
    class host,mfs,mfa front
    class apigw,lambda,s3web cloud
    class dynamo,s3pdf datos
```

**Lo que conviene notar:**

- El bucket de evidencias es **privado**: el PDF no se descarga de S3 sino a
  través de la API, que es quien decide si el solicitante puede verlo.
- Los microfrontends se cargan **en tiempo de ejecución**, no en compilación:
  el host solo conoce la URL del `remoteEntry.js` de cada remoto.
- Una sola función Lambda atiende todas las rutas. El enrutamiento vive en el
  código, que es el mismo que usa el servidor local de desarrollo.

---

## 2. Arquitectura hexagonal (puertos y adaptadores)

Cómo está organizado el backend. Las flechas son **dependencias**, y todas
apuntan hacia adentro: el dominio no sabe que existe nada de lo que lo rodea.

```mermaid
flowchart TB
    subgraph entrada["🔌 Adaptadores de entrada · infrastructure/adapter/in"]
        direction LR
        lambda["Handler Lambda<br/><i>evento API Gateway v2</i>"]
        express["Servidor Express<br/><i>ejecución local</i>"]
        router["Router + controladores<br/><i>contrato HTTP propio</i>"]
        lambda --> router
        express --> router
    end

    pin["<b>Puertos de entrada</b> · application/port/in<br/>CrearSolicitud · Aprobacion · Evidencia · ConsultarSolicitudes"]

    servicios["<b>Servicios de aplicación</b> · application/service<br/><i>orquestan el caso de uso; no deciden reglas</i>"]

    subgraph dominio["💚 Dominio · domain — sin dependencias externas"]
        direction LR
        agregado["<b>Solicitud</b><br/><i>agregado raíz</i>"]
        entidad["<b>Aprobador</b><br/><i>entidad</i>"]
        valores["<b>Objetos de valor</b><br/>Monto · Correo<br/>CodigoOtp · RolAprobador"]
        hash["<b>CalculadorHash</b><br/><i>servicio de dominio</i>"]
        agregado --> entidad
        agregado --> valores
        agregado --> hash
    end

    pout["<b>Puertos de salida</b> · application/port/out<br/>Repositorio · Notificador · GeneradorPdf · Almacén · Reloj · Identificadores"]

    subgraph salida["🔌 Adaptadores de salida · infrastructure/adapter/out"]
        direction LR
        persistencia["DynamoDB<br/>· o ·<br/>En memoria"]
        almacen["S3<br/>· o ·<br/>Sistema de archivos"]
        pdfkit["pdfkit"]
        correo["Correo simulado"]
        sha["SHA-256<br/><i>node:crypto</i>"]
    end

    router ==> pin
    pin ==> servicios
    servicios ==> dominio
    servicios ==> pout
    pout -. "implementan" .-> persistencia
    pout -. "implementan" .-> almacen
    pout -. "implementan" .-> pdfkit
    pout -. "implementan" .-> correo
    hash -. "implementa" .-> sha

    classDef dom fill:#e6f5ec,stroke:#116b3a,color:#12203a,stroke-width:2px
    classDef app fill:#eaf0ff,stroke:#1d4ed8,color:#12203a
    classDef adap fill:#fdf5e0,stroke:#8a6d1f,color:#12203a
    class agregado,entidad,valores,hash dom
    class pin,servicios,pout app
    class lambda,express,router,persistencia,almacen,pdfkit,correo,sha adap
```

> Las flechas gruesas (`==>`) son **dependencias del código**: siempre hacia el
> centro. Las punteadas son **implementaciones**: la infraestructura depende de
> los puertos, nunca al revés. Por eso el dominio, que está en el medio, no
> importa nada de lo que lo rodea.

**Por qué importa, en la práctica:**

| Consecuencia | Dónde se ve |
|---|---|
| La misma lógica corre en Lambda y en local | `handler.ts` y `servidor.ts` solo traducen hacia el mismo router |
| Correr sin AWS es cambiar una variable | `contenedor.ts` elige DynamoDB o memoria, S3 o disco |
| Las reglas se prueban en milisegundos | El OTP vence a los 3 minutos con un reloj inyectado, sin esperar |
| El dominio no importa `node:crypto` | SHA-256 entra por el puerto `CalculadorHash` |

Cada puerto de salida tiene **dos implementaciones** —una real y una local—, y
las pruebas usan la local. Esa simetría es lo que permite que la prueba de
integración recorra el flujo completo con el composition root de producción.

---

## 3. Diagrama de secuencia: el flujo completo

Desde que el solicitante crea la compra hasta que descarga el PDF firmado.

```mermaid
sequenceDiagram
    autonumber
    actor SOL as Solicitante
    participant FE as Frontend
    participant API as API<br/>(Lambda)
    participant DOM as Solicitud<br/>(agregado)
    participant DB as DynamoDB
    participant MAIL as Correo<br/>(simulado)
    participant S3 as S3
    actor APR as Aprobador

    rect rgb(234, 240, 255)
    note over SOL, MAIL: Alta de la solicitud
    SOL->>FE: título, descripción, monto y 3 aprobadores
    FE->>API: POST /api/solicitudes
    API->>DOM: crear
    DOM-->>API: valida 3 roles distintos,<br/>monto y correos
    API->>DB: transacción: solicitud + 3 índices de token
    API->>MAIL: 3 correos con enlace único
    API-->>FE: 201 · estado PENDIENTE
    end

    rect rgb(253, 245, 224)
    note over APR, DB: Verificación por OTP (se repite por aprobador)
    APR->>FE: abre /approve?solicitud_id&approver_token
    FE->>API: POST /api/aprobaciones/otp
    API->>DOM: emitirOtp
    API->>DB: guarda OTP (vigencia 3 min)
    API->>MAIL: código de un solo uso
    APR->>FE: ingresa el código
    FE->>API: POST /api/aprobaciones/otp/validar
    API->>DOM: verificarOtp
    alt código correcto
        DOM-->>API: abre sesión (15 min)
        API-->>FE: detalle de la compra + tokenSesion
    else incorrecto o vencido
        API->>DB: persiste el intento fallido
        API-->>FE: 401 · motivo INCORRECTO / EXPIRADO
    end
    end

    rect rgb(230, 245, 236)
    note over APR, S3: Decisión y cierre
    APR->>FE: Aprobar o Rechazar
    FE->>API: POST /api/aprobaciones/decision
    alt aprueba
        API->>DOM: registrarFirma
        DOM-->>DOM: encadena SHA-256<br/>de la firma anterior
        API->>DB: guarda con bloqueo optimista
        alt es la tercera firma
            API->>DOM: verificarCadenaFirmas
            API->>S3: guarda el PDF de evidencia
            API->>DB: estado COMPLETADA
        end
    else rechaza
        API->>DOM: registrarRechazo
        API->>DB: estado RECHAZADA · flujo cerrado
    end
    API->>MAIL: avisa al solicitante
    API-->>FE: estado actualizado
    end

    SOL->>FE: Descargar PDF
    FE->>API: GET /api/solicitudes/{id}/evidencia.pdf
    API->>S3: lee el objeto
    API-->>SOL: application/pdf
```

**Detalles del flujo que el diagrama hace explícitos:**

- El **OTP autentica una sola vez**; lo que autoriza la decisión es el
  `tokenSesion` que se emite al validarlo. El código nunca viaja en la firma.
- Los **intentos fallidos se persisten**, para que el bloqueo a los cinco
  intentos no se pueda esquivar reintentando.
- La firma se guarda **antes** de generar el PDF. Si la generación falla, la
  firma no se pierde: la evidencia se reintenta en la primera descarga.
- El **rechazo de uno cierra el flujo** para los demás.

---

## Cadena de firmas

El detalle de cómo se encadenan, que es el corazón del ejercicio.

```mermaid
flowchart LR
    contenido["Contenido de la solicitud<br/><i>id · título · descripción<br/>monto · solicitante · fecha</i>"]
    semilla(["<b>semilla</b><br/>SHA-256"])
    f1(["<b>firma 1</b><br/>Jefe de Área"])
    f2(["<b>firma 2</b><br/>Finanzas"])
    f3(["<b>firma 3</b><br/>Gerencia"])
    pdf["PDF de evidencia<br/><i>imprime la cadena<br/>y la verifica</i>"]

    contenido --> semilla
    semilla -->|"hash anterior"| f1
    f1 -->|"hash anterior"| f2
    f2 -->|"hash anterior"| f3
    f3 --> pdf

    classDef ancla fill:#eaf0ff,stroke:#1d4ed8,color:#12203a
    classDef firma fill:#e6f5ec,stroke:#116b3a,color:#12203a,stroke-width:2px
    class contenido,semilla ancla
    class f1,f2,f3 firma
```

Cada eslabón es `SHA-256("FIRMA" | id | secuencia | aprobador | rol | correo |
fecha | hash_anterior)`. Como el primero está anclado al contenido de la
solicitud, **modificar el monto en la base de datos rompe la verificación de las
tres firmas**, no solo de una.
