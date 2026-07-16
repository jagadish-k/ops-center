# Global Platform Configuration & Provisioning

This document delivers the absolute deployment configuration matrix (`netlify.toml`) required at the root of the project workspace. It bridges the edge routing layers, configures explicit runtime environments for the AI triage engines, maps internal proxy paths to bypass cross-origin restrictions, and establishes single-page application router fallbacks.

---

## 1. Unified Operational Manifest (`netlify.toml`)

```toml
# netlify.toml - Global Platform Orchestration Manifest

[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

# --- EDGE INFRASTRUCTURE ROUTING CONFIGURATION ---

[[edge_functions]]
  path = "/api/auth/bootstrap"
  function = "auth-bootstrap"

# --- STANDARD API PROXY REDIRECT RULES ---

[[redirects]]
  from = "/api/ai-orchestrator"
  to = "/.netlify/functions/ai-orchestrator"
  status = 200

[[redirects]]
  from = "/api/social-listener"
  to = "/.netlify/functions/social-listener"
  status = 200

# Failsafe SPA Route Catcher: Deep-linked client paths drop into the index matrix natively
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# --- COMPILER & RUNTIME ENVIRONMENT INITIALIZATION ---

[functions]
  node_version = "20"

[functions.ai-orchestrator]
  external_node_modules = ["@google/generative-ai"]
  timeout = 25

[functions.social-listener]
  timeout = 15
```

---

## 2. Runtime Workspace Initialization Blueprint

To spin up the complete end-to-end telemetry system locally, execute the following script blocks sequentially within your root terminal environment:

### Step 1: Initialize System Dependencies

Install the required React 18+ engine blocks, structural styling utilities, and cryptographic edge tools:

```bash
npm install react react-dom tailwindcss postcss autoprefixer
```

### Step 2: Launch the Local Edge Emulator Matrix

Boot the local development framework via the Netlify CLI layer. This mirrors your production environment locally by hot-reloading the SPA frontend canvas, processing serverless AI orchestrations, and mounting the edge authentication gates simultaneously:

```bash
netlify dev
```

```

```
