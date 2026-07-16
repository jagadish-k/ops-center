# Technical Architecture & System Topography

## 1. System Topology Overview

The system relies on a hybrid architecture combining a high-speed, edge-routed frontend network with an offline-resilient, real-time streaming backend datastore. Netlify coordinates edge computation, validation, and static asset delivery, while Google Firebase manages high-frequency bi-directional state synchronization. To maintain 60 FPS performance during high-congested events, the frontend map interface bypasses standard DOM rendering, offloading all spatial and personnel vector tracking to a hardware-accelerated HTML5 Canvas engine.

```
+-----------------------------------------------------------------------------------------+
|                                     NETLIFY EDGE                                        |
|  +------------------------+  +------------------------+  +---------------------------+  |
|  |   Static App Hosting   |  |  Edge Functions (Auth) |  |   Netlify Postgres DB     |  |
|  | (React / TS / Vite UI) |  | (Google OAuth Proxy)   |  |  (Rosters & Static Maps)  |  |
|  +------------------------+  +------------------------+  +---------------------------+  |
+-------------------------------------------+---------------------------------------------+
                                            |
                         Bi-directional Websocket State Stream
                                            |
+-------------------------------------------v---------------------------------------------+
|                                  GOOGLE CLOUD PLATFORM                                  |
|  +-----------------------------------------------------------------------------------+  |
|  |                          Firebase Realtime Database & Firestore                    |  |
|  |     (Active Incident Queues, Live Field Staff Locations, Operational Master Switch) |  |
|  +-----------------------------------------------------------------------------------+  |
|  +------------------------+  +------------------------+  +---------------------------+  |
|  |   Google Cloud Pub/Sub |  |  Gemini 1.5 Flash API  |  |     Whisper API Core      |  |
|  | (Social Ingestion Buffer) |  | (Cluster & Triage Engine)| |  (Crowd Audio Processor)  |  |
|  +------------------------+  +------------------------+  +---------------------------+  |
+-----------------------------------------------------------------------------------------+
```

## 2. Component Stack Breakdown

- **Frontend Core:** React.js (v19), TypeScript, Vite (build optimization engine).
- **Render Pipeline:** HTML5 Canvas (2D Context) API backed by `requestAnimationFrame` for high-density spatial rendering.
- **Style Engine:** Tailwind CSS providing utility compilation. Supports device preference dark-mode targeting via the native `dark:` layout selector flags.
- **UX Component Framework:** `shadcn/ui` built over Radix UI primitives. Ensures strict compliance with accessibility frameworks while decoupling components from large module node dependencies.
- **Edge Compute:** Netlify Edge Functions running over the Deno runtime environment.
- **Relational Storage:** Netlify Postgres managed database cluster. Houses the master staff whitelist rosters, spatial stadium maps, coordinate data, and post-event analytical log archives.
- **Real-time Synchronization Engine:** Firebase Firestore paired with the Firebase Realtime Database Client SDK. Provides real-time synchronization via WebSockets with local SQLite caching for offline-first resilience.
- **Identity Layer:** Firebase Authentication using Custom Claims.
- **External Integration Layer:** Twilio API for WhatsApp Business and SMS transport pipelines.
- **Generative AI Pipeline Suite:** Google Gemini 1.5 Flash (context mapping, classification, social clustering) and OpenAI Whisper API (low-latency acoustic transcription).

## 3. Core Data Processing Pipelines

### Pipeline A: Ground-to-Control Room Incident Ingestion

1.  **Capture:** Field worker activates the recording node on the Mobile Client. Audio payload is written directly to memory as a compressed WebM stream.
2.  **Transport:** Client dispatches the payload to a Netlify API route, proxying to the Whisper API.
3.  **Transcription:** Whisper translates the raw acoustic payload into a normalized UTF-8 string, filtering out heavy stadium acoustics.
4.  **Enrichment:** The text string is handed directly to the Gemini 1.5 Flash engine. The prompt demands a structured JSON response extracting: `IncidentType`, `Severity`, `ExtractedZone`, and `StructuralKeywords`.
5.  **Sync & Render:** The resulting JSON structure is written to the Firebase Firestore `incidents` collection. It instantly populates the Event Admin's desktop interface queue via an active WebSocket listener, where it is picked up by the map's Canvas loop and plotted as a high-visibility pulsing geometric beacon.

### Pipeline B: Crowdsourced Social Media Listening

1.  **Ingestion:** External social listening worker processes continuous streaming payloads via public filters and pushes items directly to Google Cloud Pub/Sub queues.
2.  **Buffering:** Pub/Sub batches inputs in 15-second intervals to minimize invocation overhead and prevent execution locks.
3.  **Analysis:** Gemini 1.5 Flash scans the text array. It ignores personal banter, evaluates threat metrics, extracts semantic matching data, and evaluates if multiple unique handles are pointing to the same localized stadium issue.
4.  **Clustering:** If the engine uncovers thematic density exceeding 5 distinct alerts within a specific sub-quadrant, it writes a new item to the `social_candidates` collection inside Firestore for Operator review.

### Pipeline C: Two-Way Dispatch Loop

1.  **Trigger:** An Event Admin selects an active incident over the Canvas coordinate map interface and clicks "Dispatch Personnel".
2.  **Allocation:** The system queries active field workers in the target zone whose current Firebase status is `AVAILABLE`.
3.  **State Write:** A document is created in the `/dispatches` sub-collection detailing the instructions, transforming the assigned Field Staff's state to `DISPATCHED`.
4.  **UI Takeover:** The Field Staff's Mobile Client intercepts this real-time update. The UI instantly shifts to a full-screen modal blocking standard inputs, revealing high-contrast navigation maps and instructions.
5.  **Resolution Lock:** The Field Staff must tap an interactive "Acknowledge" element, transmitting a timestamped receipt back to the Control Room, followed by an "On-Scene" and "Resolved" flag sequence to clear the interface block.

## 4. Authentication, Provisioning, & RBAC Specification

Security and identity are verified via cryptographic tokens embedding role claims.

```
[ User Logs In via Provider ]
             │
             ▼
[ Netlify Edge Token Analyzer ]
             │
             ├──► Email matches FIRST_SUPERADMIN_EMAIL? ──► Set Claim: { superadmin: true }
             │
             ├──► Email matches Event Admins Table?    ──► Set Claim: { admin: true }
             │
             └──► Phone matches Whitelist Table?        ──► Set Claim: { staff: true }
```

### Access Control Rules Matrix:

- `superadmin`: Granted read/write permissions to all schemas across all active tournaments. Has exclusive permissions to alter configuration variables, add/remove Event Admins, and initialize new stadium spaces.
- `admin`: Restricted to their explicitly assigned stadium venue instance. Can read/write the local `whitelisted_staff` database collection via CSV import, issue dispatches, clear incidents, and access the Social Listening interface.
- `staff`: Locked down to the Mobile Client canvas. Can only read incidents or dispatches explicitly assigned to their specific UID, and can only write to the `incidents` creation collection and their own location paths.

## 5. Resiliency & High-Availability Configurations

### Offline-First Synchronization Architecture

To survive severe localized cell tower load spikes, the Mobile Client configures offline persistence flags within the Firebase initialization scripts:

```typescript
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const db = initializeFirestore(app, {
	localCache: persistentLocalCache({
		tabManager: persistentMultipleTabManager(),
	}),
});
```

When connectivity degrades, incident reports and dispatch state mutations are logged to internal indexedDB storage. The client local view updates seamlessly, and mutations are automatically queued and synchronized back to the primary database the moment connectivity is restored.

### Temporal Operational Enforcement (The Switch)

To ensure system isolation outside active match blocks, a global timestamp configuration document is verified by granular server-side validation rules inside the Firebase Security Rules configuration schema:

```javascript
service cloud.firestore {
  match /databases/{database}/documents {
    match /incidents/{incidentId} {
      allow write: if request.auth != null
                    && request.auth.token.staff == true
                    && request.time >= get(/databases/$(database)/documents/config/switch).data.windowStart
                    && request.time <= get(/databases/$(database)/documents/config/switch).data.windowEnd;
    }
  }
}
```

## More References

1. **Code guidelines** `CODE-DESIGN.md`
2. **System Topology & Foundations** (`ARCHITECTURE.md`)
3. **GenAI Serverless Proxies & Adapters** (`netlify/functions/ai-orchestrator.ts`, `whisper.ts`, `gemini.ts`)
4. **Programmatic Security Perimeter** (`firestore.rules`, `auth-bootstrap.ts`)
5. **GPU-Accelerated Map Loop & Dynamic Clustering** (`StadiumMapCanvas.tsx`)
6. **Ergonomic Field Input Components** (`VoiceIngest.tsx`, `ManualTriageDrawer.tsx`)
7. **Reactive Global Synchronization Layer & Surface Routing** (`AuthContext.tsx`, `ActiveMatchContext.tsx`, `App.tsx`)
