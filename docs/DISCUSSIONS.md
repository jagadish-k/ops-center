# Architecture Summary & Decision Ledger

This document serves as a master summary of the entire architectural design session for the **SaaS Multi-Tenant Stadium Operations Core Engine**. It defines the core engineering choices, maps out the subsystem interfaces, and tracks every artifact designed across this lifecycle sprint.

---

## 1. Core Architectural Pillars & Strategy Decisions

During the session, the platform was modeled around four non-negotiable architectural requirements:

### A. Multi-Tenant Data Isolation (Zero-Leakage Guarantee)

Instead of provisioning separate databases per customer, the system implements a **shared-process, partitioned-data SaaS architecture**.

- **Decisions:** Tenant boundaries are governed using a single key (`tenantId`).
- **Enforcement:** Security boundaries are applied at the network edge via custom token claims (JWT), validated inside serverless functions, and rigidly enforced at the storage tier using declarative database rules (`firestore.rules`). Operators can never access or accidentally read telemetry belonging to another stadium.

### B. Serverless Cognitive Telemetry Extraction

Field operations use asynchronous radio voice/text dispatches that lack structured tracking formats.

- **Decisions:** A serverless gateway endpoint utilizes upstream LLM cognitive models (Gemini) to execute real-time, structured JSON payload extractions.
- **Enforcement:** The gateway takes noisy radio inputs and maps them into rigid coordinate coordinates $(x, y)$, emergency classification zones, severity indices, and structured operational action descriptions.

### C. Hardware-Accelerated Dynamic Map Canvas

Rendering dozens of moving security assets and live incoming emergency vectors can degrade web application layout loops.

- **Decisions:** Shift away from heavy DOM node tracking elements or high-overhead map styling layers.
- **Enforcement:** An optimized, double-buffered HTML5 2D canvas context drives the UI layout. Repainting runs via a native `requestAnimationFrame` render loop, utilizing custom math vector boundary intersections to handle smooth asset tooltips and canvas selections.

### D. Write-Once, Read-Many (WORM) Forensic Compliance Ledger

To protect historical records against internal administrative tampering or database intrusions, security event timelines require forensic verify-at-will guarantees.

- **Decisions:** An append-only ledger system applies cryptographic constraints to every single event mutation.
- **Enforcement:** Each log entry captures state differences (`before` and `after` deltas), computes a deterministic SHA-256 hash of the payload, and signs it against the hash of the preceding block log. A separate validation engine can instantly trace the historical chain to identify the exact block entry where data corruption or tampering occurred.

### E. Fully Custom Client Domain Integration & Ingress Redirection

- **Decisions**: Supported dynamic hostname resolution to facilitate white-labeled application deployment. Avoided building costly isolated infrastructure clusters for individual customers by implementing a smart CDN reverse-proxy layer.
- **Enforcement**: Netlify Edge Functions intercept the `Host` request header, query our dynamic map index database in real time, and pass the resolved `tenantId` parameter downstream. Custom brand variables are dynamically hydrated via CSS properties (`var(--brand-*)`), ensuring individual club identities are isolated without introducing styling compile leaks.

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
| `netlify/edge-functions/ai-orchestrator.ts`           | **Serverless AI Gateway**     | Decodes bearer configurations, extracts structured telemetry variables, and locks reports into tenant spaces.        |
| `netlify/edge-functions/telemetry-monitor.ts`         | **System Diagnostics**        | Collects error telemetry, catching environment issues and system delays before they cascade.                         |
| `firestore.rules`                                     | **Storage Sandbox Gates**     | Server-side declarative code restricting database reads, creates, and updates strictly within a user's token claims. |
| `package.json`                                        | **System Manifest**           | Standardizes structural framework versions, tool build targets, and lint dependencies.                               |
| `tailwind.config.js`                                  | **HUD Styling Theme**         | Configures dark slate styles, console grid themes, and tactical color palettes across the UI layout.                 |
| `netlify.toml`                                        | **Edge Ingress Controller**   | Provisions proxy routes, secure CSP headers, and edge execution pathways.                                            |
| `src/utils/runSimulation.ts`                          | **Lifecycle Testing Harness** | A sandbox execution engine that validates token handling, AI extractions, and ledger immutability out-of-the-box.    |

---

## 4. Current Platform State & Readiness Vector

- **Type Safety:** 100% strict TypeScript domain modeling ensures clear interfaces across the system.
- **Security Posture:** Data separation is completely sandboxed at the root database line via declarative matching path queries.
- **Audit Capability:** The cryptographic ledger guarantees that data tampering can be caught immediately on the client dashboard.
- **UI Layout:** The architecture is fully prepped for heavy multi-asset testing thanks to the hardware-accelerated canvas implementation.

```

```
