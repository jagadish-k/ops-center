# Architecture Summary & Decision Ledger

> **Resolved architecture:** This summary reflects the Netlify-only platform
> per [ADR-0001](adr/0001-frontend-stack-hybriderui-react-router-tailwind.md)
> through [ADR-0008](adr/0008-defer-social-listening.md). Earlier drafts
> assumed Firebase/Firestore — those assumptions are superseded. See
> [`CONTEXT.md`](../CONTEXT.md) for the glossary.

This document serves as a master summary of the entire architectural design for the **Stadium Ops Grid Matrix**. It defines the core engineering choices, maps out the subsystem interfaces, and tracks every artifact.

---

## 1. Core Architectural Pillars & Strategy Decisions

During the design session, the platform was modeled around four non-negotiable architectural requirements:

### A. Multi-Tenant Data Isolation (Zero-Leakage Guarantee)

Instead of provisioning separate databases per customer, the system implements a **shared-process, partitioned-data SaaS architecture**.

- **Decisions:** Tenant boundaries are governed using a single key (`tenantId`). See [ADR-0002](adr/0002-netlify-postgres-blobs-data-layer.md).
- **Enforcement:** Security boundaries are applied at the network edge via RS256 JWT claims (ADR-0003), validated inside Netlify Functions, and enforced at the storage tier using imperative `tenant_id` column checks in Postgres queries. Operators can never access or accidentally read telemetry belonging to another stadium.

### B. Serverless Cognitive Telemetry Extraction

Field operations use asynchronous radio voice/text dispatches that lack structured tracking formats.

- **Decisions:** A serverless gateway endpoint utilizes upstream LLM cognitive models (Gemini) to execute real-time, structured JSON payload extractions. See [ADR-0006](adr/0006-whisper-gemini-voice-pipeline.md).
- **Enforcement:** The gateway takes noisy radio inputs and maps them into rigid coordinate coordinates $(x, y)$, emergency classification zones, severity indices, and structured operational action descriptions.

### C. Hardware-Accelerated Dynamic Map Canvas

Rendering dozens of moving security assets and live incoming emergency vectors can degrade web application layout loops.

- **Decisions:** Shift away from heavy DOM node tracking elements or high-overhead map styling layers.
- **Enforcement:** An optimized, double-buffered HTML5 2D canvas context drives the UI layout. Repainting runs via a native `requestAnimationFrame` render loop, utilizing custom math vector boundary intersections to handle smooth asset tooltips and canvas selections.

### D. Write-Once, Read-Many (WORM) Forensic Compliance Ledger

To protect historical records against internal administrative tampering or database intrusions, security event timelines require forensic verify-at-will guarantees.

- **Decisions:** An append-only ledger system applies cryptographic constraints to every single event mutation. See [ADR-0005](adr/0005-tamper-evident-audit-chain.md).
- **Enforcement:** Each log entry captures state differences (`before` and `after` deltas), computes a deterministic SHA-256 hash **server-side** of the payload, and signs it against the hash of the preceding block log. The chain is stored in Netlify Blobs. A separate validation engine can instantly trace the historical chain to identify the exact block entry where data corruption or tampering occurred. _Note: this is tamper-evident (detectable), not tamper-proof (preventable)._

### E. Fully Custom Client Domain Integration & Ingress Redirection — DEFERRED

- **Decisions**: Supported dynamic hostname resolution to facilitate white-labeled application deployment.
- **Status**: Deferred to a future phase after the core platform ships. See `docs/CUSTOM-DOMAINS.md` for the reference design.

---

## 2. Master System Blueprint & Component Interconnections

The components are organized as a decoupled, reactive single page application (SPA) backed by serverless edge routers:

```
  [ Operative Voice/Text Radio Inputs ]
                  │
                  ▼
   [ /api/ai-orchestrator (Edge) ] ───► Uses Gemini to extract structured coordinates
                  │
                  ▼
     [ Auth & Tenant Rule Gates ] ────► Sanitizes & restricts data by tenantId
                  │
                  ▼
     [ useTenantMutations Proxy ] ────► Intercepts state & signs cryptographic logs
                  │
                  ├──► [ WORM Audit Ledger Store ] (SHA-256 Linked Block Chain)
                  │
                  ▼
 [ OptimizedStadiumMapCanvas (UI) ] ──► Hardware-accelerated 2D tracking matrix view
```

---

## 3. Comprehensive Artifact Manifest Registry

Below is a complete index of all configuration blueprints, logic modules, and UI layout controllers established during the system design session:

| File Pattern Path                                     | Module Subsystem              | Operational Responsibility                                                                                           |
| :---------------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `src/types/index.ts`                                  | **Global Typings Core**       | Establishes domain data shapes for coordinate pairs, incidents, users, and audit envelopes.                          |
| `src/context/AuthContext.tsx`                         | **Identity Management**       | Validates session bootstraps, manages authorization web tokens, and extracts tenant claims.                          |
| `src/context/ActiveMatchContext.tsx`                  | **Data Streaming Layer**      | Handles live datastore subscription channels matching the authenticated operator's workspace domain.                 |
| `src/hooks/useTenantMutations.ts`                     | **State Interception**        | Acts as a proxy guard for incident updates, forcing a linked cryptographic logging trail on mutation writes.         |
| `src/utils/auditLogger.ts`                            | **SHA-256 Block Ledger**      | Generates deterministic hash structures to append signed, chained records to the immutable audit timeline.           |
| `src/utils/ledgerVerifier.ts`                         | **Forensic Scanner**          | Performs a linear walk across historical logs to find integrity breaks or signature mismatches.                      |
| `src/components/shared/OptimizedStadiumMapCanvas.tsx` | **Tactical Canvas Map**       | Renders high-performance asset updates, grids, and event hotspots using double-buffered 2D canvas steps.             |
| `src/components/mobile/VoiceIngest.tsx`               | **Radio Transceiver**         | Emulates Push-To-Talk radio captures, sending audio telemetry metadata out to edge extractions.                      |
| `src/components/dashboard/OperationalDashboard.tsx`   | **Unified Command Shell**     | The central interface matrix linking the canvas view, administrative controls, tenant selectors, and logs.           |
| `netlify/functions/ai-triage.ts`                      | **Serverless AI Gateway**     | Whisper transcription + Gemini structured extraction pipeline (ADR-0006).                                            |
| `netlify/edge-functions/telemetry-monitor.ts`         | **System Diagnostics**        | Collects error telemetry, catching environment issues and system delays before they cascade.                         |
| `netlify/functions/mutations.ts`                      | **Mutation + Authz Layer**    | Server-side tenant-guarded CRUD + audit hook. Replaces `firestore.rules` with imperative checks. |
| `package.json`                                        | **System Manifest**           | Standardizes structural framework versions, tool build targets, and lint dependencies.                               |
| `vite.config.ts` (`@tailwindcss/vite`)                 | **HUD Styling Theme**         | Tailwind v4 CSS-first config (`@theme` directive); dark slate styles and tactical color palettes.                    |
| `netlify.toml`                                        | **Edge Ingress Controller**   | Provisions proxy routes, secure CSP headers, and edge execution pathways.                                            |
| `src/utils/runSimulation.ts`                          | **Lifecycle Testing Harness** | A sandbox execution engine that validates token handling, AI extractions, and ledger immutability out-of-the-box.    |

---

## 4. Current Platform State & Readiness Vector

> The architectural decisions are recorded in [`docs/adr/`](adr/). The reference
> implementations in `docs/*.md` are written against Firebase + shadcn/ui and
> must be treated as **reference pseudo-code** — they will be rewritten against
> HeroUI v3 + Netlify during implementation.

- **Type Safety:** Strict TypeScript domain modeling ensures clear interfaces across the system (see `docs/STRUCTURAL-TYPES.md`).
- **Security Posture:** Data separation is enforced via `tenant_id` checks in Netlify Functions + RS256 JWT claims (ADR-0003).
- **Audit Capability:** The tamper-evident SHA-256 chain guarantees that data tampering can be detected immediately (ADR-0005).
- **UI Layout:** The architecture is fully prepped for heavy multi-asset testing thanks to the hardware-accelerated canvas implementation.

```

```
