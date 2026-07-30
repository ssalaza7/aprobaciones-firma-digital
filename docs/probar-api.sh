#!/usr/bin/env bash
#
# Recorre el flujo completo de la API y comprueba cada paso.
#
#   ./docs/probar-api.sh                      # contra la API desplegada
#   ./docs/probar-api.sh http://localhost:4000  # contra la ejecución local
#
# Solo necesita curl y python3. Sirve de prueba de humo y, de paso, como
# documentación ejecutable: cada llamada muestra el endpoint y lo que devuelve.

set -euo pipefail

API="${1:-https://gt8jx5d8dk.execute-api.us-east-1.amazonaws.com/dev}"

verde()  { printf '\033[0;32m%s\033[0m\n' "$1"; }
rojo()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }

json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

fallar() { rojo "  ✗ $1"; exit 1; }

titulo "API bajo prueba: $API"

# ---------------------------------------------------------------------------
titulo "1. El servicio responde"
ESTADO=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/salud")
[ "$ESTADO" = "200" ] || fallar "GET /api/salud devolvió $ESTADO"
verde "  ✓ GET /api/salud → 200"

# ---------------------------------------------------------------------------
titulo "2. Catálogo de roles"
ROLES=$(curl -s "$API/api/roles")
TOTAL_ROLES=$(echo "$ROLES" | json "len(d)")
[ "$TOTAL_ROLES" -ge 3 ] || fallar "se esperaban al menos 3 roles, hay $TOTAL_ROLES"
verde "  ✓ GET /api/roles → $TOTAL_ROLES roles disponibles"

# ---------------------------------------------------------------------------
titulo "3. Crear la solicitud con sus tres aprobadores"
RESPUESTA=$(curl -s -X POST "$API/api/solicitudes" -H 'Content-Type: application/json' -d '{
  "titulo": "Compra de 15 portátiles para operaciones",
  "descripcion": "Renovación del parque de equipos del área de operaciones",
  "monto": 45000000,
  "moneda": "COP",
  "solicitante": { "nombre": "Ana Restrepo", "correo": "ana.restrepo@empresa.com" },
  "aprobadores": [
    { "nombre": "Carlos Pérez",  "correo": "carlos.perez@empresa.com",  "rol": "JEFE_AREA" },
    { "nombre": "Diana Gómez",   "correo": "diana.gomez@empresa.com",   "rol": "FINANZAS"  },
    { "nombre": "Esteban Ruiz",  "correo": "esteban.ruiz@empresa.com",  "rol": "GERENCIA"  }
  ]}')

ID=$(echo "$RESPUESTA" | json "d['solicitud']['id']")
ESTADO_INICIAL=$(echo "$RESPUESTA" | json "d['solicitud']['estado']")
[ "$ESTADO_INICIAL" = "PENDIENTE" ] || fallar "la solicitud nació en estado $ESTADO_INICIAL"
verde "  ✓ POST /api/solicitudes → 201 · id $ID · estado PENDIENTE"

TOKENS=$(echo "$RESPUESTA" | json "'\n'.join(e['enlace'].split('approver_token=')[1] for e in d['enlacesAprobacion'])")
verde "  ✓ tres enlaces de aprobación generados, uno por aprobador"

# ---------------------------------------------------------------------------
titulo "4. Rechazo de un código incorrecto"
PRIMERO=$(echo "$TOKENS" | head -1)
curl -s -o /dev/null -X POST "$API/api/aprobaciones/otp" -H 'Content-Type: application/json' \
  -d "{\"solicitud_id\":\"$ID\",\"approver_token\":\"$PRIMERO\"}"
CODIGO_HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/aprobaciones/otp/validar" \
  -H 'Content-Type: application/json' \
  -d "{\"solicitud_id\":\"$ID\",\"approver_token\":\"$PRIMERO\",\"otp\":\"000000\"}")
[ "$CODIGO_HTTP" = "401" ] || fallar "un OTP incorrecto devolvió $CODIGO_HTTP en lugar de 401"
verde "  ✓ OTP incorrecto → 401"

# ---------------------------------------------------------------------------
titulo "5. Las tres firmas"
N=0
for TOKEN in $TOKENS; do
  N=$((N + 1))

  OTP=$(curl -s -X POST "$API/api/aprobaciones/otp" -H 'Content-Type: application/json' \
    -d "{\"solicitud_id\":\"$ID\",\"approver_token\":\"$TOKEN\"}" | json "d['otpDemo']")
  [ "$OTP" != "None" ] || fallar "la API no expone el OTP (EXPONER_OTP=false); léalo en /api/mock-mail"

  SESION=$(curl -s -X POST "$API/api/aprobaciones/otp/validar" -H 'Content-Type: application/json' \
    -d "{\"solicitud_id\":\"$ID\",\"approver_token\":\"$TOKEN\",\"otp\":\"$OTP\"}" | json "d['tokenSesion']")

  MENSAJE=$(curl -s -X POST "$API/api/aprobaciones/decision" -H 'Content-Type: application/json' \
    -d "{\"solicitud_id\":\"$ID\",\"approver_token\":\"$TOKEN\",\"session_token\":\"$SESION\",\"decision\":\"APROBAR\"}" \
    | json "d['mensaje']")
  verde "  ✓ aprobador $N firmó · $MENSAJE"
done

# ---------------------------------------------------------------------------
titulo "6. Estado final y cadena de firmas"
DETALLE=$(curl -s "$API/api/solicitudes/$ID")
ESTADO_FINAL=$(echo "$DETALLE" | json "d['estado']")
[ "$ESTADO_FINAL" = "COMPLETADA" ] || fallar "la solicitud quedó en $ESTADO_FINAL"
verde "  ✓ estado COMPLETADA"
echo "$DETALLE" | json "'\n'.join('    %-14s firma #%d  %s…' % (a['etiquetaRol'], a['secuenciaFirma'], a['hashFirma'][:24]) for a in d['aprobadores'])"

# ---------------------------------------------------------------------------
titulo "7. Descarga de la evidencia"
ARCHIVO="evidencia-$ID.pdf"
CODIGO_HTTP=$(curl -s -o "$ARCHIVO" -w '%{http_code}' "$API/api/solicitudes/$ID/evidencia.pdf")
[ "$CODIGO_HTTP" = "200" ] || fallar "la descarga devolvió $CODIGO_HTTP"
head -c 5 "$ARCHIVO" | grep -q '%PDF-' || fallar "el archivo descargado no es un PDF"
verde "  ✓ GET /api/solicitudes/{id}/evidencia.pdf → 200 · $(wc -c < "$ARCHIVO" | tr -d ' ') bytes"
verde "  ✓ guardado como $ARCHIVO"

# ---------------------------------------------------------------------------
titulo "8. Buzón de correo simulado"
CORREOS=$(curl -s "$API/api/mock-mail?solicitud_id=$ID" | json "d['total']")
verde "  ✓ GET /api/mock-mail → $CORREOS correos simulados de esta solicitud"

titulo "Flujo completo verificado."
echo "  Solicitud: $API/api/solicitudes/$ID"
echo "  Evidencia: $ARCHIVO"
