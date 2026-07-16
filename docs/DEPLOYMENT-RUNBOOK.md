# DEPLOYMENT-RUNBOOK.md: Phase Verification & Infrastructure Commissioning

This document outlines the validation procedures required to deploy and verify the multi-tenant stadium architecture across cloud testing environments.

---

## Phase 1: Local Sandbox Hydration & Verification

Execute these terminal instructions at the root folder path location to compile the dependencies and fire up the local development loop:

```bash
# Install rigid package manifest requirements
npm install

# Initialize local emulator frameworks for Edge Functions & Datastores
# This boots up the Netlify local runtime platform server on port 8888
netlify dev
```

### In-Circuit Sanity Validation Loop

To run a full headless verification check on the token generation, AI parsing logic, and cryptographic block hash linkage structures without loading the UI canvas layer, set the environment flag and fire the test suite:

```bash
RUN_DIAGNOSTIC_SIMULATION=true npx ts-node src/utils/runSimulation.ts
```

---

## Phase 2: Datastore Core Permissions Provisioning

1. Open your target Cloud Database Management Console.
2. Navigate to the Storage Access / Security Rules Engine configuration pane.
3. Paste the contents compiled inside `SECURITY-GATING.md` (`firestore.rules`) directly into the active terminal box.
4. Publish the changes. This guarantees that no field operator session token can read or edit records outside their custom `tenantId` claim context block.

---

## Phase 3: Production Pipeline Infrastructure Commissioning

When syncing this repository out to production infrastructure triggers via automated Git actions, ensure the deployment platform holds the following cluster variables:

| Variable Identifier     | Target Content Context                         | Validation Requirement                                          |
| :---------------------- | :--------------------------------------------- | :-------------------------------------------------------------- |
| `GEMINI_API_KEY`        | Upstream AI LLM Cognitive Inference Engine Key | Required for real-time dispatch textual telemetry translations. |
| `VITE_APP_ENVIRONMENT`  | `production`                                   | Enforces rigid token parsing configurations.                    |
| `VITE_EDGE_GATEWAY_URL` | Live production endpoint DNS string            | Sets target network routes for authentication boots.            |

---

## Phase 4: Operational HUD Handshake Protocols

Once deployment finishes, verify system readiness using this network handshake trace runbook:

```text
[FIELD OPERATIVE COMMS HANDSHAKE DIAGNOSTIC TRACE]
1. Operative presses the Radio Ingestion hotkey on the mobile panel frame.
2. Captured audio streams straight through to /api/ai-orchestrator with a verified tenant header.
3. The AI engine parses coordinates and updates the map canvas at the correct pixel locations.
4. The hook interceptor generates an append-only log entry, calculates the SHA-256 signature chain link, and pushes it to the ledger.
5. The Forensic Timeline dashboard verifies the chain structure live, showing an all-clear green badge indicator.
```

```

```
