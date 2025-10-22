# VC Webhook

Servicio Express que escucha eventos, abre una puerta cuando un proceso termina con éxito y ancla credenciales verificables en un contrato `CredentialRegistry` en Base Sepolia.

## Requisitos

- Node.js 20 o superior
- npm 10+
- RPC accesible para Base Sepolia

## Instalación

```bash
npm install
```

Crea un archivo `.env` en la raíz:

```
WEBHOOK_PORT=3000
DOOR0_URL=https://example.com/door
REGISTRY_ADDRESS=0x...
RPC_URL=https://base-sepolia.infura.io/v3/...
CHAIN_ID=84532
PRIVATE_KEY=0x...
```

## Uso

```bash
npm run dev
```

El servidor queda disponible en `http://localhost:WEBHOOK_PORT`.

## Endpoints principales

- `POST /verify`  
  Recibe el cuerpo en texto plano; si `type` contiene `"succeeded"` hace `GET` a `DOOR0_URL` y encola el mensaje.

- `GET /checktopics`  
  Devuelve y remueve el mensaje más antiguo de la cola (o 404 después de `topicTimeoutMs`).

- `POST /issue`  
  Espera un JSON con `vc` y `metadata`. Canoniza la VC, calcula el hash SHA‑256 y llama a `storeCredential` en el registro on-chain.

- `GET /issue/health`  
  Verifica que la configuración on-chain sea válida y expone dirección del emisor, RPC y contrato.

## Ejemplos con curl

```bash
# Evento exitoso
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: text/plain" \
  -d '{"type":"process_succeeded","payload":{"id":"demo-123"}}'


# Registrar credencial
curl -X POST http://localhost:3000/issue \
  -H "Content-Type: application/json" \
  -d '{
        "vc": {
          "@context": ["https://www.w3.org/2018/credentials/v1"],
          "type": ["VerifiableCredential"],
          "issuer": "did:example:issuer123",
          "credentialSubject": { "id": "did:example:user789", "name": "Alice" }
        },
        "metadata": { "source": "curl-test", "timestamp": "'$(date +%s)'" }
      }'

# Healthcheck
curl http://localhost:3000/issue/health
```

## Script de verificación

Para confirmar un hash guardado en el contrato:

```bash
node check.js 0x<credentialHash>
```

El script consulta `getCredential`, `exists` e `isActive` usando las credenciales del `.env`.

## Revocar o reactivar una credencial

```bash
curl -X POST http://localhost:3000/issue/status \
  -H "Content-Type: application/json" \
  -d '{
    "credentialHash": "0x...",
    "active": false
  }'
```

El endpoint `/issue/status` llama a `setCredentialStatus` en el contrato para revocar (`active: false`) o reactivar (`active: true`) una credencial.
