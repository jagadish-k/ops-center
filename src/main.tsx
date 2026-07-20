/**
 * Client entry point.
 *
 * IMPORTANT: This project uses React Router v8 framework mode (@react-router/dev).
 * In framework mode, the `reactRouter()` Vite plugin generates the router entry
 * and history management from `src/routes.ts` + `src/root.tsx` — it owns the
 * `createRoot`/`hydrateRoot` call and the router setup.
 *
 * Therefore this file MUST NOT:
 *   - call `createRoot` itself,
 *   - render a `<BrowserRouter>` (that conflicts with the framework router),
 *   - import a removed `App` component.
 *
 * The plugin injects its own virtual entry into index.html. This file is kept as
 * a CSS entry shim only; importing the stylesheet here ensures Tailwind v4 +
 * HeroUI styles are picked up by the legacy index.html script tag if the plugin
 * falls back to it. The actual rendering is performed by the framework.
 */
import './index.css';

export {};
