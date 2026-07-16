# Product Requirement Document (PRD): Stadium Ops Grid Matrix

## 1. Executive Summary & Market Context

The **Stadium Ops Grid Matrix** is a mission-critical, low-latency SaaS incident management and tactical coordination platform designed for the high-intensity environments of large-scale sports tournaments and modern multi-tenant arena networks.

Traditional Computer-Aided Dispatch (CAD) and venue management systems are bottlenecked by legacy architectures, heavy map rendering stacks (causing browser lag), complex manual entry workflows, and mutable databases susceptible to post-incident tampering.

This platform addresses these vulnerabilities by delivering:

1. **Hardware-Accelerated Fluid Mapping Canvas**: Real-time rendering of thousands of moving telemetry markers without frame-rate dropping.
2. **Ambient Voice-to-Telemetry AI Pipelines**: Hands-free field operative reporting that bypasses manual terminal input using serverless structured extraction models.
3. **Cryptographically Chained Forensic Audit Logs**: Immutable transaction audit trails establishing a mathematical chain of custody for all matchday events.
4. **Edge-Driven Multi-Tenant Isolation**: Rigorous, zero-leak data boundaries separating distinct stadium entities at the network edge.

---

## 2. Platform Feature Specification & Scope

### 2.1 Multi-Tenant Identity Verification & Workspace Routing

- **SMS One-Time-Password (OTP) Ingress**: Direct, quick-access portal for field crews to register and drop straight into their localized shift tracking layer via mobile number confirmation.
- **OAuth 2.0 / SSO Ingress**: Federated access for corporate supervisors, tournament coordinators, and third-party emergency responders.
- **Dynamic Tenant Swapping**: Multi-property dashboard mapping allowing regional supervisors with broad claims to switch context partitions (`tenantId`) on the fly, immediately re-binding and isolating all downstream real-time collections.

### 2.2 Serverless AI Voice Extraction Pipeline

- **Radio Interface Keying**: Ergonomic mobile-first push-to-talk interface that captures audio segments directly into lightweight encoded binaries.
- **Structured Information Extraction**: A serverless cognitive gateway that feeds transcription segments to the AI inference infrastructure. The pipeline returns a strict JSON object mapping back to the platform schema:

$$\text{Payload} \rightarrow \{ \text{coordinates}, \text{category}, \text{severity}, \text{locationSector}, \text{actionRequired} \}$$

- **Mathematical Coordinates Translation**: Transforms descriptive tactical location names (e.g., "Gate B Bottleneck") into precise spatial grid markers on a standardized **1000 × 1000** spatial projection grid.

### 2.3 Double-Buffered HTML5 Canvas Workspace

- **Rendering Partitioning**: Splitting map geometry into cold background layers (grids, structural blueprints) pre-rendered once in offscreen system memory, and volatile layers (dynamic staff coordinates, incident indicators) evaluated in the main execution thread.
- **Smooth Animation Loops**: Forcing frame repaints via a native `requestAnimationFrame` loop to hit a constant **≥ 60 FPS** even during dense matchday incidents.
- **Radial Interception Raycasting**: A mathematical distance verification algorithm validating cursor and touch event coordinates relative to dynamic nodes:

$$\text{Distance} = \sqrt{(x_{\text{input}} - x_{\text{node}})^2 + (y_{\text{input}} - y_{\text{node}})^2} \le \text{Threshold}$$

### 2.4 Cryptographic Write-Once-Read-Many (WORM) Forensic Ledger

- **Chained Transaction Integrity**: Every incident creation or status mutation generates an immutable, chained audit log entry.
- **Dynamic Chain Link Computation**: The signature block of the current entry is computed using a SHA-256 digest of its unique ID, timestamp, actor metadata, state delta changes (`before` / `after` diffs), and the signature of the previous record:

$$\text{Hash}_n = \text{SHA-256}(\text{Data}_n \parallel \text{Hash}_{n-1})$$

- **Visual Integrity Inspector Timeline**: A real-time timeline component that re-calculates chronological chain signatures on the fly. If any historic log data gets altered or bypassed, the UI flashes a cryptographic breach warning immediately.

---

## 3. Comparative Analysis: Legacy vs. Stadium Ops Matrix

| Metric / Feature       | Legacy CAD & GIS Overlays                                                             | Stadium Ops Grid Matrix (SaaS)                                                      |
| :--------------------- | :------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------- |
| **Map Performance**    | High CPU overhead rendering heavy geographic geo-JSON trees directly to DOM elements. | GPU-accelerated $O(1)$ offscreen blitting with decoupled background layer caching.  |
| **Data Capture**       | Manual dispatcher entries, causing data bottlenecks during heavy crowd movements.     | Ambient voice-to-telemetry extraction via serverless LLM pipelines.                 |
| **Audit Trails**       | Mutable databases where logs can be modified or deleted by database administrators.   | Immutable WORM ledger with cryptographic SHA-256 block-chaining.                    |
| **SaaS Multi-Tenancy** | Siloed regional virtual machine (VM) clusters with high maintenance overheads.        | Logical edge partitioning backed by rigorous claims-based security isolation rules. |

---

## 4. Development & Build Phases

> **Architectural context:** The build follows a **solo-developer, real-production**
> trajectory on **Netlify-only infrastructure** (no Firebase). Key decisions are
> recorded in [`docs/adr/`](docs/adr/) (ADR-0001 through ADR-0008). The social
> listening pipeline is **deferred** (ADR-0008). See [`CONTEXT.md`](CONTEXT.md)
> for the domain glossary.

The construction lifecycle is organized as **8 milestone-driven vertical
slices**, each producing a demonstrable end-to-end capability. Estimated total:
~8 weeks for a solo build.

```
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 0: Foundation & Unification (~3 days)                        │
│  - Unified types, Postgres schema, .env.example, vitest config          │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 1: Auth Vertical Slice (~5 days)                             │
│  - Edge JWT + Twilio OTP, AuthContext, protected endpoints              │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 2: Live Map + Diff Polling (~6 days)                         │
│  - state-poll endpoint, polling hook, OptimizedStadiumMapCanvas         │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 3: Control Room Surface (~5 days)                            │
│  - Dashboard, incident CRUD, tenant switching, mutation audit hook      │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 4: Voice AI Pipeline (~5 days)                               │
│  - Whisper + Gemini two-call triage, VoiceIngest, manual fallback       │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 5: Dispatch Loop (~4 days)                                   │
│  - Two-way dispatch, mobile full-screen takeover, ack/resolve flow      │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 6: WORM Audit Ledger (~4 days)                               │
│  - Server-side SHA-256 chain in Netlify Blobs, real verifier, timeline  │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 7: Offline + PWA (~4 days)                                   │
│  - IndexedDB queue, offline reconciliation, PWA manifest (staff client) │
└───────────────────────────────────────────┬────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  MILESTONE 8: Hardening, Testing & Deploy (~4 days)                     │
│  - Unit + integration tests, stress simulation, Netlify production dep  │
└────────────────────────────────────────────────────────────────────────┘
```

### Milestone Details

- **M0 — Foundation:** Unified `src/types/index.ts`, Postgres schema migration, `.env.example`, vitest config, PWA manifest icons.
- **M1 — Auth:** `auth-bootstrap.ts` edge function (RS256 JWT via Web Crypto, OTP via Twilio), `OtpGateway.tsx`, `AuthContext.tsx`, seed tenants/staff.
- **M2 — Live Map:** `state-poll.ts` diff endpoint, `usePollingState.ts` hook (2s interval, backoff), `ActiveOpsContext.tsx` (refs not state), `OptimizedStadiumMapCanvas.tsx` (offscreen buffer + DPR + viewport pan/zoom).
- **M3 — Control Room:** `OperationalDashboard.tsx`, `mutations.ts` (tenant-guarded CRUD), `useTenantMutations.ts` (audit intercept), `TenantSwitcher.tsx`.
- **M4 — Voice AI:** `useVoiceRecorder.ts`, `ai-triage.ts` (Whisper → Gemini, 5-tier schema), `VoiceIngest.tsx`, `ManualTriageDrawer.tsx` (3-tap fallback).
- **M5 — Dispatch:** Dispatches CRUD, `DispatchModal.tsx` (mobile full-screen takeover), two-way status sync.
- **M6 — Audit Ledger:** Server-side `auditLogger.ts` (Netlify Blobs, SHA-256 chain), real `verify-ledger.ts`, `AuditTimelineInspector.tsx`. _Tamper-evident, not tamper-proof_ (ADR-0005).
- **M7 — Offline + PWA:** `useOfflineQueue.ts` (IndexedDB), online/offline drain with original timestamps, `vite-plugin-pwa` (staff client).
- **M8 — Hardening:** Crypto/coordinate/JWT unit tests, full-flow integration tests, `runSimulation.ts` stress test, Netlify production deploy.

---

## 5. Team Skills & Engineering Resource Requirements

This is a **solo-developer, real-production build** (assisted by AI tooling).
The original PRD assumed a 5-engineer team; the milestone plan above (§4) is
scoped for one developer. The specialized skill areas below are still relevant —
a solo developer must cover all of them, delegating depth to reference docs and
automated tooling where possible.

### 5.1 Engineering Skill Areas

1. **Frontend / Canvas Specialist**: Expert in HTML5 2D contexts, mathematical vector projections, and browser layout profiling.
2. **Cloud & Edge Security Architect**: Deep knowledge of edge workers (Deno runtimes), JWT structures, and imperative authorization logic.
3. **AI / Cognitive Ingest Engineer**: Experience designing serverless prompts and structuring extraction pipelines.
4. **Security & Compliance Engineer**: Background in asymmetric cryptography, hash chaining, and tamper-evident audit systems.
5. **QA & Site Reliability Engineer (SRE)**: Focused on designing load simulators, monitoring polling pipelines, and scaling Postgres.

### 5.2 Key Development Paradigms

- **Trunk-Based Development**: Short-lived feature branches merged daily into the core production tree to avoid integration bottlenecks.
- **Test-Driven Spatial Math**: Rigorous unit test coverage for canvas coordinate mappings, ensuring pixel translations remain correct across various mobile screen aspect ratios.
- **Immutable State Updates**: Ensuring state modifications are handled via immutable update patterns to maintain distinct before/after snapshots for the audit trail.
- **Continuous Visual Profiling**: Running automated frame rate audits on every codebase change, ensuring the map canvas consistently maintains performance targets.

---

## 6. Financial Analysis, Pricing Models & Infrastructure Costs

### 6.1 SaaS Platform Pricing Models (B2B SaaS)

The platform targets large stadium authorities, global sports federations, and large-scale event vendors.

```
       🏆 TOURNAMENT SCALE           🏟️ ENTERPRISE ARENA             🎫 SINGLE MATCHDAY
      $12,500 / Month / Stadium     $4,500 / Month / Stadium        $1,200 / Matchday Event
      ─────────────────────────     ────────────────────────     ────────────────────────
      • Multi-stadium views         • 1 Tenant instance          • 1 Active event window
      • 2-year retention WORM       • 1-year retention WORM      • 30-day retention log
      • Dedicated edge routes       • Shared edge routes         • Manual export audit
      • Unlimited staff nodes       • Up to 250 staff nodes      • Up to 50 staff nodes
```

1. **Single Matchday Pass ($1,200 / event)**: Designed for independent stadium organizers hosting one-off regional events. Supports a single active event window, up to **50** staff nodes, and 30-day basic log exports.
2. **Enterprise Arena Tier ($4,500 / month / stadium)**: For professional stadiums hosting continuous leagues. Includes a permanent isolated tenant instance, support for up to **250** active staff tracking nodes, and a 1-year compliance WORM history.
3. **Tournament Scale Tier ($12,500 / month / stadium)**: Designed for global events. Includes multi-stadium coordination dashboards, dedicated edge routes, unlimited staff nodes, and 2-year cryptographic ledger guarantees.

### 6.2 Projected Monthly Operational Costs (Based on 10 Active Medium-Scale Stadiums)

Operational calculations assume an average of **250** active tracking nodes per stadium transmitting updates continuously over typical matchday shift windows.

```
                  MONTHLY COST DISTRIBUTION (TOTAL: $3,610)

  🤖 AI Models (Ingestion Pipeline)          ████████████████████████████ $2,250 (62%)
  💾 Real-time Database Operations           ██████████ $810 (22%)
  🌐 Edge Compute (Worker Nodes)              ████ $300 (8%)
  📊 Logging & Observability                  ███ $250 (7%)
```

#### Detailed Infrastructure Cost Breakdown:

1. **AI Cognitive Modeling (Ingestion Pipeline)**
   - _Usage Assumptions_: **30,000** verbal dispatches parsed per matchday across all active venues.
   - _Token Volumetrics_: Average **500** input tokens + **250** output tokens per transaction.
   - _Price Modeling_:
     - Input tokens: **$0.075 per million**
     - Output tokens: **$0.30 per million**
   - _Estimated Monthly Cost_: $\approx \$2,250$ (representing the largest operational cost block).

2. **Real-Time Data Layer & State Storage**
   - _Usage Assumptions_: Continuous coordinate updates. Staff position ping intervals are debounced to transmit only when the operative moves **> 3 meters**.
   - _Transaction Volumetrics_: **45 million** reads/writes per month.
   - _Price Modeling_: Average **$0.18 per million** write operations, **$0.06 per million** read operations.
   - _Estimated Monthly Cost_: $\approx \$810$

3. **Edge Processing Functions**
   - _Usage Assumptions_: Routing authentication OTP handshakes and running AI API middleware checks.
   - _Execution Volumetrics_: **15 million** requests per month.
   - _Price Modeling_: **$2.00 per million** executions beyond the free usage tier.
   - _Estimated Monthly Cost_: $\approx \$300$

4. **Monitoring & Observability**
   - _Usage Assumptions_: Continuous ingestion of audit log payloads and system performance latency measurements.
   - _Estimated Monthly Cost_: $\approx \$250$

**Total Projected Infrastructure Overhead**: $\approx \$3,610 / \text{Month}$

_At our baseline Enterprise Tier pricing, hosting 10 stadiums generates $\approx \$45,000$ in monthly recurring revenue (MRR). This results in an **operating margin of over 91%**, leaving ample room to fund continuous product development, platform scaling, and physical on-site rehearsal support._

---

## 7. Scale & Performance Engineering Requirements

Handling high-concurrency matchday operational loads without platform degradation requires the following architectural safeguards:

```
  GPS Position Shift (Operative Moves)
                  │
                  ▼
       [ Change Threshold Check ] ──(Diff < 3 meters)──► [ Skip Update Loop ]
                  │
            (Diff >= 3 meters)
                  ▼
         [ Debounce Buffer ] ───(Interval < 500ms)─────► [ Drop Jitter Pulse ]
                  │
             (Passed Guard)
                  ▼
     [ Batch Update to DB Stream ]
```

### 7.1 Debouncing Telemetry Jitter

During dense stadium events, hundreds of mobile devices streaming continuous coordinate updates can overwhelm real-time database connections.

- **On-Client Threshold Checks**: Devices run local comparisons before transmitting data. If an operative's position shifts by less than **3 meters** since the last update, the network write is skipped.
- **Debounce Buffering**: Positional updates are buffered and debounced to fire at most once every **500ms** per device. This filters out natural GPS drift and jitter inside concrete stadium structures without sacrificing real-time tracking accuracy.

### 7.2 Offscreen Canvas Geometry Caching

Redrawing the entire stadium layout, seating zones, and coordinate grids on every single rendering pass creates severe performance bottlenecks.

- **Decoupled Render Buffering**: The platform implements an offscreen double-buffering engine. Cold static layers (stadium structures, backgrounds, sector rings) are drawn once to an in-memory background canvas.
- **GPU Blit Acceleration**: On active updates, the main canvas performs an optimized bit-block transfer (blit) to instantly draw the pre-rendered background in a single operation:

$$\text{Render Time} = O(1) \text{ Background Paint} + O(N) \text{ Active Vectors}$$

This optimization keeps execution loops well within the **16.6ms** window required to maintain a fluid 60 FPS display.

### 7.3 State Reconstruction & Graceful Disconnect Recovery

Mobile connectivity is highly volatile in crowded, high-attenuation stadium environments.

- **Local State Reconstruction**: If an operative temporarily loses network connection, the local device app stores subsequent status reports inside a secure offline queue.
- **Linear Reconciliation**: Once connection is restored, the queue is drained in order. The server-side transaction engine reconstructs the chronological timeline, resolving coordinates and updating the ledger with the original, client-side timestamped markers.

---

## 8. Compliance, Forensic Integrity & WORM Audit Criteria

To ensure our audit log data holds up during legal reviews, public inquiries, or insurance audits, the system must meet strict compliance benchmarks:

### 8.1 Cryptographic Chain of Custody Validation

The validation scanner must be able to mathematically prove that historical logs have not been altered or bypassed.

- **Deterministic Inputs**: The input payload to the SHA-256 hash algorithm is defined by a strict, non-negotiable sequence:

$$\text{Input Payload}_n = \text{eventId} \parallel \text{tenantId} \parallel \text{timestamp} \parallel \text{actorId} \parallel \text{action} \parallel \text{targetResourceId} \parallel \text{deltaSHA} \parallel \text{chainedPriorHash}$$

- **Delta Verification**: The `deltaSHA` value is computed by hashing the exact JSON representation of the data state change:

$$\text{deltaSHA} = \text{SHA-256}(\text{JSON.stringify}(\{\text{before}, \text{after}\}))$$

Any manual, out-of-band updates to historical storage documents will break the hash verification chain immediately, alerting compliance monitors to the exact entry index that was modified.

### 8.2 Write-Once-Read-Many (WORM) Storage Strategy

- **Zero Update Permission**: Security policies completely block all `update` and `delete` operations on the `audit_ledger` collection, allowing only `create` requests.
- **Automated Cloud Backup Mirroring**: A serverless function runs in the background to automatically mirror newly written audit documents directly to cloud-level WORM storage (such as object storage with a locked retention window) in real time. This ensures that even in the case of a complete database compromise, the historical operational timeline remains securely intact.

### 8.3 Custom Domain Cross-Origin Resource Sharing (CORS) Security

- **Strict Host Sanitization**: The Edge gateway blocks cross-site communication vulnerabilities by dynamically computing CORS origin rules. Only requests arriving from the explicitly validated custom domain mapped in the core client profile are permitted payload ingest writes.
