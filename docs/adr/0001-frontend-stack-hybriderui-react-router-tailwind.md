# ADR-0001: HeroUI v3 + React Router v8 + Tailwind v4 Frontend Stack

## Status

Accepted — supersedes the component-stack assumptions in `docs/ARCHITECTURE.md`
§2 and `docs/CODE-DESIGN.md` §1 (which reference shadcn/ui + Tailwind v3 + plain
Vite SPA).

## Context

The original documentation (`docs/ARCHITECTURE.md`, `docs/CODE-DESIGN.md`)
specifies a frontend stack of **shadcn/ui over Radix UI**, **Tailwind CSS v3**
(with `tailwind.config.js`), and a **plain Vite single-page application** using
`BrowserRouter`.

However, the project was scaffolded with a different, newer stack already
installed and configured:

| Concern | Docs assume | Scaffold has |
| --- | --- | --- |
| Component library | shadcn/ui (Radix) | **HeroUI v3** (`@heroui/react` ^3.2.2) |
| Styling | Tailwind v3 + `tailwind.config.js` | **Tailwind v4** (`@tailwindcss/vite` ^4.3.2) |
| Routing | Plain SPA, `BrowserRouter` | **React Router v8 framework mode** (`@react-router/dev` ^8.2.0) |
| i18n | Not mentioned | `i18next` + `react-i18next` installed |
| PWA | Not mentioned | `vite-plugin-pwa` installed |

Ripping out the scaffolded stack to match the docs would discard working
configuration and downgrade to older major versions. The scaffolded stack is
newer, already wired into `vite.config.ts` and `src/root.tsx`, and HeroUI v3
provides comparable accessibility primitives to Radix.

The reference code in `docs/*.md` (canvas components, contexts, mobile
interfaces) is written against shadcn/ui class names and Tailwind v3
conventions. It must be treated as **reference pseudo-code**, not copy-pasted.

## Decision

Adopt the **scaffolded stack** as the source of truth:

1. **HeroUI v3** (`@heroui/react` + `@heroui/styles`) for all UI components.
2. **React Router v8** in framework mode (`@react-router/dev`) for routing,
   layout, and data loading. Routes live in `src/routes.ts`.
3. **Tailwind CSS v4** via the Vite plugin — no `tailwind.config.js`; theme
   customisation is done in CSS using Tailwind v4's `@theme` directive.
4. **Vite 8** as the build tool.
5. `i18next` and `vite-plugin-pwa` remain available; wire them when the UI
   stabilises (see build plan Milestone 7).

All reference code in `docs/*.md` that uses shadcn/ui imports or Tailwind v3
patterns is **reference only** and must be rewritten to use HeroUI v3
components and Tailwind v4 conventions during implementation.

## Consequences

**Positive:**

- No rework of the working scaffold; newer, maintained dependencies.
- HeroUI v3 is built on React Aria Components — strong accessibility, matching
  the original shadcn/Radix intent.
- React Router v8 framework mode gives file-based routing, loaders, and SSR
  capability if needed later.

**Negative:**

- Every component example in the docs needs manual translation to HeroUI v3.
  The docs cannot be copy-pasted.
- HeroUI v3 is in beta — expect occasional breaking changes before stable.
- Tailwind v4's CSS-first config is less documented than v3; team must learn
  the `@theme` approach.

**Action required:** Treat `docs/CODE-DESIGN.md`, `docs/APPLICATION-ORCHESTRATION.md`,
`docs/MOBILE-INTERFACE.md`, `docs/MASTER-SHELL.md`, and `docs/FORENSIC-INSPECTOR.md`
as reference implementations only. The authoritative project structure is the
one in `docs/CODE-DESIGN.md` §1 (updated) and the build plan.
