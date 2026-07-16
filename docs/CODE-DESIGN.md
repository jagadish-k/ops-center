# Frontend Development & Code Design Guidelines

> **Stack note:** The platform uses **HeroUI v3** (not shadcn/ui), **Tailwind CSS
> v4** (not v3), and **React Router v8** framework mode. See
> [ADR-0001](adr/0001-frontend-stack-hybriderui-react-router-tailwind.md). The
> code examples below are reference implementations — translate shadcn/Radix
> patterns to HeroUI v3 components during implementation.

## 1. Directory Blueprint

The codebase enforces a decoupled folder structure ensuring that logic, components, types, and services are fully modular.

```text
/
├── .env.example
├── netlify/
│   ├── edge-functions/
│   │   └── auth-bootstrap.ts       # RS256 JWT mint + OTP verify (ADR-0003)
│   └── functions/
│       ├── state-poll.ts           # Diff-based polling endpoint (ADR-0004)
│       ├── ai-triage.ts            # Whisper + Gemini pipeline (ADR-0006)
│       ├── mutations.ts            # Incident/dispatch CRUD + audit hook
│       └── verify-ledger.ts        # Chain integrity scan (ADR-0005)
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── ui/                     # HeroUI v3 wrappers (NOT shadcn/ui)
│   │   ├── mobile/                 # Mobile Field interface components
│   │   ├── control-room/           # Desktop dashboard widgets
│   │   └── shared/                 # Cross-surface utilities
│   │       └── OptimizedStadiumMapCanvas.tsx  # Offscreen-buffered Canvas
│   ├── context/
│   │   ├── AuthContext.tsx         # JWT verify, claims, tenant scope
│   │   └── ActiveOpsContext.tsx    # Polling hook, diff-merge into refs
│   ├── hooks/
│   │   ├── usePollingState.ts      # 2s diff-poll engine
│   │   ├── useVoiceRecorder.ts     # MediaRecorder → webm
│   │   ├── useTenantMutations.ts   # Write + audit-log intercept
│   │   └── useOfflineQueue.ts      # IndexedDB queue + drain
│   ├── services/
│   │   ├── api.ts                  # Fetch wrapper, JWT injection
│   │   └── crypto.ts               # Client-side SHA-256 (audit verify)
│   ├── types/
│   │   └── index.ts
│   ├── pages/                      # RR8 routes: auth, control, field
│   ├── routes.ts                   # RR8 route config
│   ├── root.tsx                    # RR8 root layout
│   └── main.tsx
├── vite.config.ts                  # Tailwind v4 via @tailwindcss/vite
└── docs/adr/                       # Architecture Decision Records
```

## 2. Strong Type Architecture (TypeScript Contract)

All domain data models must be backed by explicit, strictly declared types. No runtime implicit types (`any`) are permitted. The **authoritative** type definitions live in `src/types/index.ts` (see also `docs/STRUCTURAL-TYPES.md`).

```typescript
// src/types/index.ts — UNIFIED (resolves all prior doc contradictions)

export type OperationalRole = 'superadmin' | 'admin' | 'staff';
export type StaffSpecialty = 'security' | 'medical' | 'cleaning' | 'supervisor';
export type IncidentCategory = 'SECURITY' | 'MEDICAL' | 'CROWD' | 'FACILITIES' | 'ADVISORY';
export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';
export type DispatchStatus = 'SENT' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';
export type StaffStatus = 'AVAILABLE' | 'DISPATCHED' | 'OFF_DUTY';
export type InfoTier = 1 | 2 | 3 | 4 | 5;          // 5-tier system (ADR-0007)

export interface MapCoordinates {
	x: number; // Normalized coordinate (0 to 1000) for stadium grid scaling
	y: number; // Normalized coordinate (0 to 1000) for stadium grid scaling
}

export interface TenantConfig {
	tenantId: string;
	orgName: string;
	createdAt: number;
	status: 'ACTIVE' | 'SUSPENDED';
}

export interface WhitelistUser {
	id: string;                    // E.164 phone number used as identifier
	tenantId: string;              // SaaS isolation boundary
	fullName: string;
	role: OperationalRole;
	specialty: StaffSpecialty;
	assignedZone: string;
	status: StaffStatus;
	phoneNumber: string;
	currentCoords?: MapCoordinates;
	createdAt: number;
}

export interface IncidentReport {
	id: string;
	tenantId: string;
	source: 'field_staff' | 'social_media';
	tier: InfoTier;
	status: IncidentStatus;
	rawText: string;
	timestamp: number;
	coordinates: MapCoordinates;
	extractedMetadata: {
		category: IncidentCategory;
		severity: IncidentSeverity;
		locationSector: string;
		actionRequired?: string;
	};
}

export interface DispatchDirective {
	id: string;
	tenantId: string;
	incidentId: string;
	targetStaffPhone: string;
	directiveText: string;
	status: DispatchStatus;
	sentTimestamp: number;
	ackTimestamp?: number;
	resolvedTimestamp?: number;
}

export interface AuditLogEntry {
	eventId: string;
	tenantId: string;
	timestamp: number;
	actor: {
		uid: string;
		role: OperationalRole;
		phoneOrEmail: string;
		deviceFingerprint: string;
		ipAddress: string;
	};
	action: string;
	targetResourceId: string;
	stateDelta: { before: Record<string, unknown> | null; after: Record<string, unknown> | null };
	cryptographicHash: string; // SHA-256 chain link
}
```

## 3. High-Performance HTML5 Canvas Mapping Engine

To handle hundreds of vector stadium sectors, heatmaps, live personnel coordinates, and flashing incident indicators without UI redraw lag, the app uses an HTML5 Canvas interface driven by a hardware-accelerated drawing loop.

```tsx
// src/components/shared/StadiumMapCanvas.tsx
import React, { useRef, useEffect } from 'react';
import { IncidentReport, WhitelistUser } from '../../types';

interface StadiumMapProps {
	incidents: IncidentReport[];
	staffMembers: WhitelistUser[];
	onIncidentSelect?: (incident: IncidentReport) => void;
}

export const StadiumMapCanvas: React.FC<StadiumMapProps> = ({ incidents, staffMembers, onIncidentSelect }) => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let animationFrameId: number;

		const renderLoop = () => {
			// Clear canvas with high-contrast theme optimization
			const isDarkMode = document.documentElement.classList.contains('dark');
			ctx.fillStyle = isDarkMode ? '#0f172a' : '#f8fafc';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			// 1. Draw Background Stadium Vector Ring Structural Lines
			ctx.strokeStyle = isDarkMode ? '#334155' : '#cbd5e1';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.4, 0, 2 * Math.PI);
			ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.25, 0, 2 * Math.PI);
			ctx.stroke();

			// 2. Plot Active Incident Targets (Flashing Warning Radii)
			incidents.forEach((incident) => {
				const scaleX = (incident.coordinates.x / 1000) * canvas.width;
				const scaleY = (incident.coordinates.y / 1000) * canvas.height;

				// Pulse calculation via system timestamp epoch
				const pulseFactor = (Math.sin(Date.now() / 150) + 1) / 2;

				ctx.beginPath();
				if (incident.tier === 1 || incident.tier === 2) {
					ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + pulseFactor * 0.25})`; // Critical Red Pulse
					ctx.arc(scaleX, scaleY, 18 + pulseFactor * 8, 0, 2 * Math.PI);
				} else {
					ctx.fillStyle = 'rgba(245, 158, 11, 0.2)'; // Warning Amber
					ctx.arc(scaleX, scaleY, 12, 0, 2 * Math.PI);
				}
				ctx.fill();

				// Solid inner incident indicator pin
				ctx.beginPath();
				ctx.fillStyle = incident.tier <= 2 ? '#ef4444' : '#f59e0b';
				ctx.arc(scaleX, scaleY, 5, 0, 2 * Math.PI);
				ctx.fill();
			});

			// 3. Render Field Staff Vectors (Color-coded nodes by division specialty)
			staffMembers.forEach((staff) => {
				if (!staff.currentCoords) return;
				const posX = (staff.currentCoords.x / 1000) * canvas.width;
				const posY = (staff.currentCoords.y / 1000) * canvas.height;

				ctx.beginPath();
				switch (staff.specialty) {
					case 'security':
						ctx.fillStyle = '#3b82f6';
						break; // Blue
					case 'medical':
						ctx.fillStyle = '#22c55e';
						break; // Green
					case 'cleaning':
						ctx.fillStyle = '#eab308';
						break; // Yellow
					case 'supervisor':
						ctx.fillStyle = '#a855f7';
						break; // Purple
				}
				ctx.arc(posX, posY, 4, 0, 2 * Math.PI);
				ctx.fill();

				// Highlight ring if currently dispatched
				if (staff.status === 'DISPATCHED') {
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.arc(posX, posY, 6, 0, 2 * Math.PI);
					ctx.stroke();
				}
			});

			animationFrameId = requestAnimationFrame(renderLoop);
		};

		renderLoop();

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [incidents, staffMembers]);

	// Click handler to resolve geometric interaction over canvas coords
	const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const clickX = ((event.clientX - rect.left) / canvas.clientWidth) * 1000;
		const clickY = ((event.clientY - rect.top) / canvas.clientHeight) * 1000;

		// Check hit boxes within a 20px spatial tolerance ring
		const hit = incidents.find((inc) => {
			const distance = Math.sqrt(Math.pow(inc.coordinates.x - clickX, 2) + Math.pow(inc.coordinates.y - clickY, 2));
			return distance < 25;
		});

		if (hit && onIncidentSelect) {
			onIncidentSelect(hit);
		}
	};

	return (
		<canvas
			ref={canvasRef}
			width={800}
			height={800}
			onClick={handleCanvasClick}
			className="w-full h-auto aspect-square rounded-xl shadow-inner border border-slate-200 dark:border-slate-800 touch-none bg-slate-50 dark:bg-slate-950"
		/>
	);
};
```

## 4. UI Layout & Usability Constraints for Extremes

### High-Contrast Device Dark Mode Integration

Tailwind layouts must honor both high-reflectivity background states for midday outdoor concourse solar exposure and clean charcoal values for night operations.

```tsx
// Example of a high-contrast component for Mobile Field Input
import React from 'react';

export const StatusCard: React.FC<{ title: string; body: string; urgent: boolean }> = ({ title, body, urgent }) => {
	return (
		<div
			className={`p-4 rounded-xl border transition-colors duration-200 
      ${
				urgent
					? 'bg-red-50 border-red-500 dark:bg-red-950/40 dark:border-red-600'
					: 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800'
			}`}>
			<h3 className="text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">{title}</h3>
			<p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{body}</p>
		</div>
	);
};
```

### Mobile Interaction Limits

- **The Thumb Target Boundary:** All primary action triggers (Voice recording node, dispatch confirmation elements) must remain placed strictly inside the lower 40% screen viewport real estate.
- **Network Call Throttling:** UI elements triggering data modification mutations must immediately set their attributes to `disabled` and render an absolute local spinner context to suppress duplicating packet traffic over degraded pipelines.

## 5. GenAI Engine Integration Prompts & JSON Schema Contracts

### Prompt Contract 1: Whisper Audio Ingestion Extraction (Gemini 1.5 Flash)

When passing text inputs from transcription services, the context orchestrator must enforce a structural schema output.

```text
SYSTEM PROMPT SPECIFICATION:
You are the primary classification engine for the FIFA World Cup 2026 Stadium Operations Platform. Your task is to analyze raw transcribed audio text reports from stadium field staff and extract structured, actionable metadata.

You must respond exclusively with a valid JSON object matching the requested schema. Do not include markdown formatting, backticks, or trailing text.

Evaluate the message across the 5 Operational Info Tiers framework:
- Tier 1: Life Safety / Riot / Structural Collapse / Severe Emergency
- Tier 2: Medical / Localized Assault / Asset Failure needing immediate response
- Tier 3: Crowd Overflows / Line Stalls / Transit bottlenecks
- Tier 4: Facility Damage / Custodial / Low priority maintenance
- Tier 5: Routine Admin Updates / Handovers

Target JSON Schema Format:
{
  "tier": 1 | 2 | 3 | 4 | 5,
  "category": "SECURITY" | "MEDICAL" | "CROWD" | "FACILITIES" | "ADVISORY",
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "locationSector": "String containing extracted zone or sector name, or UNKNOWN",
  "actionRequired": "A concise 5-word directive summarizing what ground crew must do"
}
```

### Prompt Contract 2: Social Media Clustering Logic (Gemini 1.5 Flash)

```text
SYSTEM PROMPT SPECIFICATION:
You are an advanced social listening and early warning vector engine assigned to stadium operations. You are analyzing an aggregated array of public micro-posts captured from localized geographic zones.

Analyze the posts to separate general fan expression from actual facility, security, or logistical failures. Group multiple distinct accounts complaining about the exact same physical issue in the exact same location into a candidate event.

Respond exclusively with a structured JSON array of candidate incidents:
{
  "candidates": [
    {
      "thematicSignal": "Short identifying name of issue",
      "confidenceScore": 0.00 to 1.00,
      "estimatedTier": 1 | 2 | 3 | 4,
      "targetLocation": "Extracted stadium sector, gate, or concourse landmark",
      "supportingPostCount": number,
      "aggregatedSummary": "A direct summary detailing what fans are experiencing on the ground"
    }
  ]
}
If no operational anomalies are identified, return an object containing an empty candidates array.
```

## 6. State Management & Real-time Synchronization Strategy

> **⚠️ Superseded by ADR-0004.** The example below uses Firestore `onSnapshot`
> WebSocket listeners, which are no longer the architecture. The platform now
> uses **diff-based polling** (`POST /api/state-poll`, ~2s interval). The
> example is retained as reference for the context pattern only — the data
> source must be a polling hook, not Firestore listeners.

To manage operational changes without causing global rendering layout lag, the client maintains decoupled custom contexts with localized query listeners.

```typescript
// src/context/ActiveMatchContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { IncidentReport } from '../types';

interface MatchContextType {
  incidents: IncidentReport[];
  loading: boolean;
}

const ActiveMatchContext = createContext<MatchContextType | undefined>(undefined);

export const ActiveMatchProvider: React.FC<{ children: React.ReactNode; currentZone?: string }> = ({ children, currentZone }) => {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Limit field views to relevant zone constraints to maximize UI speed
    const baseQuery = collection(db, 'incidents');
    const q = currentZone
      ? query(baseQuery, where('extractedMetadata.locationSector', '==', currentZone))
      : query(baseQuery, where('status', '!=', 'CLOSED'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedIncidents: IncidentReport[] = [];
      snapshot.forEach((doc) => {
        updatedIncidents.push({ id: doc.id, ...doc.data() } as IncidentReport);
      });
      setIncidents(updatedIncidents);
      setLoading(false);
    }, (error) => {
      console.error("Firestore sync failure over operational network:", error);
    });

    return () => unsubscribe();
  }, [currentZone]);

  return (
    <ActiveMatchContext.Provider value={{ incidents, loading }}>
      {children}
    </ActiveMatchContext.Provider>
  );
};

export const useActiveMatch = () => {
  const context = useContext(ActiveMatchContext);
  if (!context) throw new Error('useActiveMatch must be wrapped within an ActiveMatchProvider container');
  return context;
};
```
