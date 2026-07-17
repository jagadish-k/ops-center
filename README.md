# Stadium Ops Grid Matrix

Mission-critical, low-latency SaaS incident management and tactical
coordination platform for large-scale sports tournaments and multi-tenant
arena networks.

Built with **React 19 + HeroUI v3 + React Router v8 + Tailwind v4**, deployed
on **Netlify** (Postgres + Blobs + Functions).

---

## Quick Start

```bash
npm install
npm run dev                   # → UI http://localhost:5173, API http://localhost:8888
```

That's it. `npm run dev` orchestrates everything: `.env` setup, Docker
Postgres, Drizzle migrations + seed, then starts **vite** (UI on 5173) and
**netlify dev** (API on 8888) in parallel — vite proxies `/api/*` to
netlify dev automatically.

**Full setup guide:** [`DEVELOPMENT.md`](DEVELOPMENT.md) (includes SMS
emulation, seeded test users, full API reference, troubleshooting).

---

## Documentation

| Document | Purpose |
|---|---|
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | **How to run locally** — setup, DB, SMS emulation, testing, full API reference |
| [`PRD.md`](PRD.md) | Product requirements, feature scope, build milestones |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary — canonical vocabulary |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records (ADR-0001 through ADR-0014) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System topology, component stack, data pipelines |
| [`docs/CODE-DESIGN.md`](docs/CODE-DESIGN.md) | Frontend guidelines, directory blueprint, type contracts |
| [`docs/STRUCTURAL-TYPES.md`](docs/STRUCTURAL-TYPES.md) | Canonical TypeScript type definitions |
| [`docs/DEPLOYMENT-RUNBOOK.md`](docs/DEPLOYMENT-RUNBOOK.md) | Production deployment & env var reference |

---

## Architecture (Summary)

```
Client (React 19 / HeroUI v3) ──HTTPS──► Netlify Functions (Deno/Node)
                                              ├── Postgres (tenants, incidents, staff,
                                              │              audit ledger — SHA-256 WORM)
                                              ├── Twilio (OTP SMS)
                                              ├── Whisper API (audio transcription)
                                              └── Gemini 1.5 Flash (structured extraction)
```

Real-time via **diff-based polling** (~2s). Auth via **RS256 JWT** minted at the
edge. Permission model: **DB-driven RBAC + per-user grants + JWT staleness
via `perms_version`** (ADR-0010 through ADR-0014). See all ADRs in
[`docs/adr/`](docs/adr/).

---

## Build Progress

| Milestone | Status | Description |
|---|---|---|
| M0 — Foundation | ✅ Done | Types, Postgres schema, migration runner, test infra |
| M1 — Auth | ✅ Done | Edge JWT, Twilio OTP, AuthContext, OtpGateway |
| M2 — Live Map | ✅ Done | Diff polling endpoint, canvas engine, real data |
| M3 — Control Room | ✅ Done | Dashboard, incident CRUD, dispatch creation |
| M4 — Voice AI | ✅ Done | Whisper + Gemini triage pipeline |
| M5 — Dispatch | ✅ Done | Two-way dispatch loop, mobile takeover |
| M6 — Audit Ledger | ✅ Done | SHA-256 chain, WORM triggers, forensic timeline |
| M7 — Offline + PWA | ✅ Done | IndexedDB queue, auto-drain, pending indicator |
| M8 — Hardening | ✅ Done | Stress simulator, integration tests, FPS audit, deploy check |
| M9.1 — Drizzle | ✅ Done | Full Drizzle ORM adoption (replaces raw `pg`) |
| M9.2 — Identity Split | ✅ Done | `users` + `tenant_memberships` + JWT-3 (`permissions[]` + `pv`) |
| M9.3 — RBAC Admin API | ✅ Done | Users CRUD, role management, cascade-revoke, per-user grants |
| M9.4 — ABAC v1 | ✅ Done | OPA/WASM policy engine + 5 attribute-aware policies |
| M9.5 — Admin UI | ✅ Done | Team, Roles, Tenants tabs + per-user grants (react-hook-form + zod) |
| M9.6 — Hardening | ✅ Done | Error boundaries, optimistic updates, skeleton loaders |
| M10 — Policy UI v1 | ✅ Done | CodeMirror Rego editor + OPA test runner + DB-stored policies |
| M10+ — Hardening | ✅ Done | Guide tour, role-aware onboarding, seed expansion, multi-floor map layout |
| M10 — Policy UI v2 | ⏳ Planned | Per-tenant overrides, rebuild-and-deploy, audit integration |

---

## Scripts

```bash
npm run dev                 # Full stack: Docker + vite (5173) + netlify dev (8888)
npm run build               # TypeScript check + Vite production build
npm run simulate            # Stress test (250 staff, 50 incidents)
npm run verify:deploy       # Pre-flight deploy check
npm test                    # Run vitest suite (82 tests across 10 files)
npm run test:watch          # Watch mode
npm run test:policy         # OPA Rego policy unit tests (19 tests)
npm run build:policies      # Compile Rego → WASM bundle
npm run db:migrate          # Apply Drizzle migrations
npm run db:seed             # Idempotent seed (tenants, users, roles, perms, incidents, map layout)
npm run db:seed-superadmin  # Upsert SUPERADMIN_PHONE user as superadmin
npm run db:generate         # Generate migration from schema.ts changes
npm run db:studio           # Drizzle Studio (DB browser)
npm run dev:db              # Start Postgres Docker container
npm run dev:db:stop         # Stop Postgres container
npm run dev:db:reset        # Wipe and recreate Postgres container
npm run lint                # ESLint
```

---

## License

Private. See project configuration for details.
