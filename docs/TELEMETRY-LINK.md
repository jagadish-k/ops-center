# End-to-End Real-Time Ingestion Bridge

This document establishes the telemetry linkage layout (`src/components/dashboard/`). It provides the unified Operational Dashboard wrapper component that hooks the Voice Audio Ingestion controller straight into the serverless AI Orchestrator function, passes the resolved coordinate payload data into the active state context, and instantly forces a hardware-accelerated repaint on the double-buffered stadium map workspace canvas.

---

## 1. Unified Operational Command Center Layout (`OperationalDashboard.tsx`)

This component coordinates the entire ingestion architecture. When a field operative broadcasts a voice dispatch, it forces loading skeletons over the map, transmits data to the upstream serverless proxy, and injects the resulting spatial data vector straight into the global monitoring stream.

```tsx
// src/components/dashboard/OperationalDashboard.tsx
import React, { useState } from 'react';
import { useActiveOperationalState } from '../../context/ActiveMatchContext';
import { useStadiumAuth } from '../../context/AuthContext';
import { OptimizedStadiumMapCanvas } from '../shared/OptimizedStadiumMapCanvas';
import { VoiceIngest } from '../mobile/VoiceIngest';
import { ManualTriageDrawer } from '../mobile/ManualTriageDrawer';
import { IncidentReport } from '../../types';

export const OperationalDashboard: React.FC = () => {
	const { user, claims, executeSessionTermination } = useStadiumAuth();
	const { incidents, staff, loading } = useActiveOperationalState();

	// Local telemetry state management overrides for instant UI updates
	const [localIncidents, setLocalIncidents] = useState<IncidentReport[]>([]);
	const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);
	const [isManualDrawerOpen, setIsManualDrawerOpen] = useState(false);
	const [pipelineTransmissionActive, setPipelineTransmissionActive] = useState(false);

	// Combine hot database context arrays with newly ingested local AI vectors
	const unifiedIncidentStream = [...incidents, ...localIncidents];

	// --- STAGE 1: TELEMETRY INGESTION LINK ---
	// Catches structural JSON metrics from the serverless edge AI Orchestrator pipeline
	const handleAIExtractionArrival = (extractedIncident: IncidentReport) => {
		setPipelineTransmissionActive(false);
		console.log('⚡ Telemetry Sync Link Established. Injecting vector mapping:', extractedIncident.id);

		// Inject instantly into the local stream vector array to force immediate canvas blit updates
		setLocalIncidents((prev) => [extractedIncident, ...prev]);
		setSelectedIncident(extractedIncident);
	};

	const handleAIExtractionFailure = (errorMessage: string) => {
		setPipelineTransmissionActive(false);
		console.error('🛑 Telemetry Sync Link Interrupted:', errorMessage);
		alert(`Operational network link break: ${errorMessage}`);
	};

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-mono select-none">
			{/* Dynamic Tactical Header Overlay */}
			<header className="h-14 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md px-6 flex items-center justify-between z-20 shadow-lg">
				<div className="flex items-center space-x-4">
					<div className="relative flex h-3 w-3">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
						<span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
					</div>
					<div>
						<h1 className="text-xs font-black tracking-widest uppercase">STADIUM OPERATIONS COMMAND CENTER</h1>
						<p className="text-[9px] text-slate-500">
							ACTIVE SHIFT USER: {claims?.phoneNumber || 'ANONYMOUS OPERATIVE'}
						</p>
					</div>
				</div>

				<div className="flex items-center space-x-3">
					{pipelineTransmissionActive && (
						<span className="text-[10px] text-amber-400 animate-pulse border border-amber-500/30 bg-amber-950/20 px-2.5 py-1 rounded-lg">
							📡 PROCESSING TRANSCRIPTION VECTOR...
						</span>
					)}
					<button
						onClick={() => setIsManualDrawerOpen(true)}
						className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-700 transition-all uppercase tracking-wider">
						⌨️ MANUAL LOG BYPASS
					</button>
					<button
						onClick={executeSessionTermination}
						className="bg-red-950/40 hover:bg-red-900/60 text-red-400 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-red-900/40 transition-all uppercase tracking-wider">
						DISCONNECT ✕
					</button>
				</div>
			</header>

			{/* Main Grid Matrix Workspace Grid splits */}
			<div className="flex-1 flex overflow-hidden relative">
				{/* Workspace Display Grid Surface (Left Main Panel) */}
				<main className="flex-1 relative bg-slate-950 flex items-center justify-center p-4">
					{loading ? (
						<div className="text-center space-y-2">
							<div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
							<p className="text-[10px] text-slate-500 uppercase tracking-widest">
								Hydrating Active Grid Mapping Array...
							</p>
						</div>
					) : (
						<OptimizedStadiumMapCanvas
							incidents={unifiedIncidentStream}
							staffMembers={staff}
							onIncidentSelect={(incident) => setSelectedIncident(incident)}
						/>
					)}
				</main>

				{/* Telemetry Inspector Details Panel Component (Right Side Panel) */}
				<aside className="w-80 bg-slate-900/30 border-l border-slate-900 backdrop-blur-md p-4 flex flex-col overflow-y-auto custom-scrollbar space-y-4">
					<div className="border-b border-slate-800 pb-2">
						<h3 className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
							LIVE DATA METRIC PIPELINES
						</h3>
					</div>

					{selectedIncident ? (
						<div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4 shadow-xl animate-fade-in animate-gpu">
							<div className="flex justify-between items-start">
								<span
									className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
										selectedIncident.tier === 1
											? 'bg-red-950/60 text-red-400 border-red-800'
											: 'bg-amber-950/60 text-amber-400 border-amber-800'
									}`}>
									TIER {selectedIncident.tier} • {selectedIncident.extractedMetadata?.severity || 'HIGH'}
								</span>
								<button
									onClick={() => setSelectedIncident(null)}
									className="text-slate-500 hover:text-slate-300 transition-all">
									✕
								</button>
							</div>

							<div>
								<label className="text-[9px] text-slate-500 block font-bold mb-1 uppercase">
									EXTRACTED TRANSMISSION CONTEXT
								</label>
								<p className="text-slate-200 font-sans text-xs leading-relaxed font-normal bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
									{selectedIncident.rawText}
								</p>
							</div>

							<div className="grid grid-cols-2 gap-2 text-[10px] border-t border-slate-800 pt-3">
								<div>
									<span className="text-slate-500 block uppercase font-bold">GRID TARGET</span>
									<span className="text-slate-300 font-bold font-mono">
										{selectedIncident.extractedMetadata?.locationSector || 'UNKNOWN'}
									</span>
								</div>
								<div>
									<span className="text-slate-500 block uppercase font-bold">CATEGORY MATRIX</span>
									<span className="text-slate-300 font-bold font-mono">
										{selectedIncident.extractedMetadata?.category || 'SECURITY'}
									</span>
								</div>
							</div>

							{selectedIncident.extractedMetadata?.actionRequired && (
								<div className="border-t border-slate-850 pt-2 text-[10px]">
									<span className="text-blue-400 block uppercase font-bold mb-0.5">➔ PROPOSED DIRECTIVE MUTATION</span>
									<p className="text-slate-400 font-sans font-normal leading-normal">
										{selectedIncident.extractedMetadata.actionRequired}
									</p>
								</div>
							)}
						</div>
					) : (
						<div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-850 rounded-xl bg-slate-900/10">
							<svg
								className="w-8 h-8 text-slate-700 mb-2"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="1.5"
									d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
								/>
							</svg>
							<p className="text-[10px] text-slate-600 uppercase tracking-wider leading-normal">
								Awaiting telemetry payload interception. Select coordinate markers on the canvas map to execute inspect
								queries.
							</p>
						</div>
					)}
				</aside>
			</div>

			{/* Ergonomic Base Voice Logging Action Surface Panel */}
			<div
				className="w-full"
				onMouseDown={() => setPipelineTransmissionActive(true)}>
				<VoiceIngest
					onTriageComplete={handleAIExtractionArrival}
					onExtractionFailure={handleAIExtractionFailure}
				/>
			</div>

			{/* Manual Ingestion Layout Sheet Bypass Overlay */}
			{isManualDrawerOpen && (
				<ManualTriageDrawer
					onFormSubmit={async (payload) => {
						const simulatedIncidentObject: IncidentReport = {
							id: `inc_manual_${Date.now().toString().slice(-4)}`,
							tier: payload.tier || 3,
							status: payload.status || 'OPEN',
							rawText: payload.rawText || '',
							timestamp: payload.timestamp || Date.now(),
							coordinates:
								payload.extractedMetadata?.locationSector === 'ZONE-A' ? { x: 450, y: 320 } : { x: 500, y: 500 },
							extractedMetadata: payload.extractedMetadata as any,
						};
						handleAIExtractionArrival(simulatedIncidentObject);
					}}
					onClose={() => setIsManualDrawerOpen(false)}
				/>
			)}
		</div>
	);
};
```

---

## 2. Ingestion Telemetry Data Lifecycle Pipeline Matrix

The table below outlines the end-to-end trace mapping from physical field audio utterance down to graphic representation on the command matrix canvas viewport:

| Processing Phase          | System Component                | Data Transformation Format                                                                                           | System Overhead / Latency Profile                                            |
| :------------------------ | :------------------------------ | :------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **1. Audio Capture**      | `VoiceIngest.tsx`               | Native acoustic microphone hardware data chunks slice gathered into compressed `audio/webm` media containers.        | Minimal CPU overhead; local memory buffer streaming storage.                 |
| **2. Proxy Dispatch**     | `fetch('/api/ai-orchestrator')` | Un-encoded base64 raw textual string vectors pushed within secure REST JSON payloads.                                | Network dependent; payload sizes typically scale under $< 150\text{ KB}$.    |
| **3. LLM AI Extraction**  | `ai-orchestrator.ts`            | Contextual token ingestion processed via Gemini structured JSON schema mapping returns coordinate keys.              | Upstream model inference blocks average $\approx 1.2 - 2.0\text{s}$ windows. |
| **4. Map Interpolation**  | `OperationalDashboard.tsx`      | Extracted values drop inside array scopes matching the core `IncidentReport` TypeScript spec properties.             | Microsecond instant mutation update loop.                                    |
| **5. Double-Buffer Blit** | `OptimizedStadiumMapCanvas.tsx` | Bit-block image data cache execution rendering vectors directly to target screen pixels via `requestAnimationFrame`. | GPU-bound layer acceleration passing frames instantly at $< 1\text{ms}$.     |

```

```
