# VC Webhook

Express service that listens to events, opens a door when a process finishes successfully, and anchors verifiable credentials on a `CredentialRegistry` contract on Base Sepolia.

## Requirements

- Node.js 20 or later
- npm 10+
- RPC endpoint accessible for Base Sepolia

## Installation

```bash
npm install
```

Create a `.env` file at the root:

```
WEBHOOK_PORT=3000
DOOR0_URL=https://example.com/door
REGISTRY_ADDRESS=0x...
RPC_URL=https://base-sepolia.infura.io/v3/...
CHAIN_ID=84532
PRIVATE_KEY=0x...
```

## Usage

```bash
npm run dev
```

The server will be available at `http://localhost:WEBHOOK_PORT`.

## Main endpoints

- `POST /verify`  
  Receives a plain text body; if `type` contains `"succeeded"` it makes a `GET` request to `DOOR0_URL` and enqueues the message.

- `GET /checktopics`  
  Returns and removes the oldest message in the queue (or 404 after `topicTimeoutMs`).

- `POST /issue`  
  Expects a JSON payload with `vc` and `metadata`. It canonicalizes the VC, computes the SHA-256 hash, and calls `storeCredential` on the on-chain registry.

- `GET /issue/health`  
  Validates that the on-chain configuration is correct and exposes the issuer address, RPC, and contract.

## Curl examples

```bash
# Successful event
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: text/plain" \
  -d '{"type":"process_succeeded","payload":{"id":"demo-123"}}'


# Register credential
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

## Verification script

To confirm a hash stored in the contract:

```bash
node check.js 0x<credentialHash>
```

The script queries `getCredential`, `exists`, and `isActive` using the credentials from `.env`.

## Revoke or reactivate a credential

```bash
curl -X POST http://localhost:3000/issue/status \
  -H "Content-Type: application/json" \
  -d '{
    "credentialHash": "0x...",
    "active": false
  }'
```

The `/issue/status` endpoint calls `setCredentialStatus` on the contract to revoke (`active: false`) or reactivate (`active: true`) a credential.
