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
cp .env.example .env          # fill in DATABASE_URL + JWT keys
npm run db:migrate            # create schema + seed data
netlify dev                   # → http://localhost:8888
```

**Full setup guide:** [`DEVELOPMENT.md`](DEVELOPMENT.md) (includes SMS
emulation, seeded test users, API reference, troubleshooting).

---

## Documentation

| Document | Purpose |
|---|---|
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | **How to run locally** — setup, DB, SMS emulation, testing |
| [`PRD.md`](PRD.md) | Product requirements, feature scope, build milestones |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary — canonical vocabulary |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records (ADR-0001 through ADR-0008) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System topology, component stack, data pipelines |
| [`docs/CODE-DESIGN.md`](docs/CODE-DESIGN.md) | Frontend guidelines, directory blueprint, type contracts |
| [`docs/STRUCTURAL-TYPES.md`](docs/STRUCTURAL-TYPES.md) | Canonical TypeScript type definitions |
| [`docs/DEPLOYMENT-RUNBOOK.md`](docs/DEPLOYMENT-RUNBOOK.md) | Production deployment & env var reference |

---

## Architecture (Summary)

```
Client (React 19 / HeroUI v3) ──HTTPS──► Netlify Functions (Deno/Node)
                                              ├── Postgres (tenants, incidents, staff)
                                              ├── Blobs (audit chain — SHA-256 WORM)
                                              ├── Twilio (OTP SMS)
                                              ├── Whisper API (audio transcription)
                                              └── Gemini 1.5 Flash (structured extraction)
```

Real-time via **diff-based polling** (~2s). Auth via **RS256 JWT** minted at the
edge. See [ADR-0001](docs/adr/0001-frontend-stack-hybriderui-react-router-tailwind.md)
through [ADR-0008](docs/adr/0008-defer-social-listening.md).

---

## Build Progress

| Milestone | Status | Description |
|---|---|---|
| M0 — Foundation | ✅ Done | Types, Postgres schema, migration runner, test infra |
| M1 — Auth | ✅ Done | Edge JWT, Twilio OTP, AuthContext, OtpGateway |
| M2 — Live Map | Next | Diff polling endpoint, canvas engine |
| M3 — Control Room | — | Dashboard, incident CRUD, tenant switching |
| M4 — Voice AI | — | Whisper + Gemini triage pipeline |
| M5 — Dispatch | — | Two-way dispatch loop, mobile takeover |
| M6 — Audit Ledger | — | Server-side SHA-256 chain, forensic timeline |
| M7 — Offline + PWA | — | IndexedDB queue, offline reconciliation |
| M8 — Hardening | — | Integration tests, stress simulation, production deploy |

---

## Scripts

```bash
npm run dev          # Vite dev server (frontend only, no functions)
npm run build        # TypeScript check + Vite production build
npm test             # Run vitest suite (37 tests)
npm run test:watch   # Watch mode
npm run db:migrate   # Apply Postgres schema migrations
npm run lint         # ESLint
```

---

## License

Private. See project configuration for details.
