# Root Mounting, Authentication Entry & Surface Switching

This document details the root mounting system orchestration (`src/App.tsx`). It wraps the execution trees inside the unified Auth and Active Match streaming contexts and evaluates cryptographic user claims at runtime to conditionally render either the Desktop Command Room view or the Mobile Field Interface surface.

---

## 1. Root Application Core Orchestrator (`src/App.tsx`)

```tsx
// src/App.tsx
import React, { useState } from 'react';
import { AuthProvider, useStadiumAuth } from './context/AuthContext';
import { ActiveMatchProvider, useActiveOperationalState } from './context/ActiveMatchContext';
import { StadiumMapCanvas } from './components/shared/StadiumMapCanvas';
import { VoiceIngest } from './components/mobile/VoiceIngest';
import { ManualTriageDrawer } from './components/mobile/ManualTriageDrawer';
import { IncidentReport, WhitelistUser } from './types';

// --- SURFACE 1: PASSWORDLESS OTP SECURE GATEWAY ---
const AuthenticationGateway: React.FC = () => {
	const { executePhoneBootstrapping, loading } = useStadiumAuth();
	const [phone, setPhone] = useState('');
	const [otp, setOtp] = useState('');
	const [step, setStep] = useState<1 | 2>(1);
	const [errorText, setErrorText] = useState('');

	const handleAuthSubmission = async (e: React.FormEvent) => {
		e.preventDefault();
		setErrorText('');
		try {
			if (step === 1) {
				// Simulates triggering the upstream Twilio network verification handshake
				if (!phone.startsWith('+')) {
					throw new Error('Phone string must be formatted in exact E.164 notation (e.g., +14155552671).');
				}
				setStep(2);
			} else {
				await executePhoneBootstrapping(phone, otp);
			}
		} catch (err: any) {
			setErrorText(err.message || 'Identity validation rejected.');
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 font-sans selection:bg-blue-500">
			<div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
				<div className="text-center mb-6">
					<h1 className="text-xl font-black tracking-wider text-slate-100 uppercase">WM2026 OPS PROTOCOL</h1>
					<p className="text-xs font-mono text-slate-400 mt-1">IDENTITY GATING VECTOR ENTRY</p>
				</div>

				<form
					onSubmit={handleAuthSubmission}
					className="space-y-4">
					{step === 1 ? (
						<div>
							<label className="block text-xs font-mono font-bold tracking-widest text-slate-400 uppercase mb-2">
								E.164 PHONE NUMBER
							</label>
							<input
								type="tel"
								placeholder="+14155552671"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								disabled={loading}
								className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
							/>
						</div>
					) : (
						<div>
							<label className="block text-xs font-mono font-bold tracking-widest text-slate-400 uppercase mb-2">
								ENTER SECURE 6-DIGIT OTP
							</label>
							<input
								type="text"
								maxLength={6}
								placeholder="000000"
								value={otp}
								onChange={(e) => setOtp(e.target.value)}
								disabled={loading}
								className="w-full text-center rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-lg tracking-widest text-slate-100 placeholder-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
							/>
						</div>
					)}

					{errorText && (
						<p className="text-xs font-mono font-bold text-red-500 uppercase bg-red-950/30 border border-red-900/50 p-2.5 rounded-lg text-center">
							{errorText}
						</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full py-3 bg-blue-600 rounded-xl font-bold tracking-widest text-sm text-white uppercase active:scale-95 transition-all disabled:bg-slate-800 disabled:text-slate-500 shadow-md shadow-blue-950/40 flex items-center justify-center">
						{loading ? (
							<div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
						) : step === 1 ? (
							'PROCEED TO OTP'
						) : (
							'VERIFY & ACCESS'
						)}
					</button>
				</form>
			</div>
		</div>
	);
};

// --- SURFACE 2: DESKTOP COMMAND ROOM SURFACE ---
const ControlRoomDashboard: React.FC = () => {
	const { incidents, staff } = useActiveOperationalState();
	const { executeSessionTermination } = useStadiumAuth();
	const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
			{/* Universal Command Header bar */}
			<header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex justify-between items-center z-10">
				<div>
					<h1 className="text-lg font-black tracking-wider uppercase">COMMAND ROOM CONSOLE</h1>
					<p className="text-xs font-mono text-slate-400">STADIUM CENTRAL OPERATIONS HUB</p>
				</div>
				<button
					onClick={executeSessionTermination}
					className="px-4 py-2 border border-slate-800 hover:border-red-900 rounded-xl text-xs font-mono font-bold text-slate-400 hover:text-red-400 transition-colors uppercase">
					SIGNOUT CONSOLE
				</button>
			</header>

			{/* Grid Allocation Split view */}
			<div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
				{/* Hardware Accelerated Canvas Left Segment */}
				<div className="lg:col-span-2 flex items-center justify-center bg-slate-900/20 rounded-xl border border-slate-900 p-4">
					<StadiumMapCanvas
						incidents={incidents}
						staffMembers={staff}
						onIncidentSelect={(inc) => setSelectedIncident(inc)}
					/>
				</div>

				{/* Realtime Analytical Queue Right Segment */}
				<div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col h-full overflow-hidden">
					<h2 className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase mb-3">
						TACTICAL OPERATIONS QUEUE
					</h2>
					<div className="flex-1 overflow-y-auto space-y-3 pr-1">
						{incidents
							.filter((i) => i.status !== 'CLOSED')
							.map((inc) => (
								<div
									key={inc.id}
									onClick={() => setSelectedIncident(inc)}
									className={`p-4 rounded-xl border transition-colors cursor-pointer 
                  ${
										selectedIncident?.id === inc.id
											? 'bg-blue-950/40 border-blue-600'
											: 'bg-slate-950 border-slate-900 hover:border-slate-800'
									}`}>
									<div className="flex justify-between items-start">
										<span
											className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase
                    ${inc.tier <= 2 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
											TIER {inc.tier} • {inc.extractedMetadata.category}
										</span>
										<span className="text-[10px] font-mono text-slate-500">
											{new Date(inc.timestamp).toLocaleTimeString()}
										</span>
									</div>
									<p className="text-sm font-semibold text-slate-200 mt-2 line-clamp-2">{inc.rawText}</p>
									<div className="mt-3 text-xs font-mono text-slate-400 flex justify-between">
										<span>Sector: {inc.extractedMetadata.locationSector}</span>
										<span className="font-bold text-blue-400">{inc.status}</span>
									</div>
								</div>
							))}
					</div>
				</div>
			</div>
		</div>
	);
};

// --- SURFACE 3: ERGONOMIC FIELD PERSONNEL SURFACE ---
const MobileFieldInterface: React.FC = () => {
	const { incidents, activeDispatches } = useActiveOperationalState();
	const { claims, executeSessionTermination } = useStadiumAuth();
	const [drawerOpen, setDrawerOpen] = useState(false);

	// Isolate current active directives matching logged staff identity paths
	const activeStaffDirective = activeDispatches.find(
		(d) => d.targetStaffPhone === claims?.phoneNumber && d.status !== 'RESOLVED',
	);

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden relative">
			{/* High-Contrast Mobile Surface Header Track */}
			<header className="p-4 bg-slate-900/80 border-b border-slate-800 flex justify-between items-center backdrop-blur-md">
				<div>
					<span className="text-[10px] font-mono font-bold tracking-widest text-blue-400 uppercase">
						FIELD ACTIVE LINK
					</span>
					<h1 className="text-sm font-black tracking-wider text-slate-200 uppercase">{claims?.phoneNumber}</h1>
				</div>
				<button
					onClick={executeSessionTermination}
					className="px-3 py-1.5 border border-slate-800 active:border-red-900 rounded-lg text-[11px] font-mono font-bold text-slate-400 active:text-red-400 transition-colors">
					DISCONNECT
				</button>
			</header>

			{/* Primary Context Real Estate Display Area */}
			<main className="flex-1 p-4 overflow-y-auto space-y-4">
				{activeStaffDirective ? (
					/* High Priority Intervention Full View Modal Blocking Mode overlay fallback */
					<div className="p-5 rounded-2xl border-2 border-red-500 bg-red-950/20 text-slate-100 animate-pulse shadow-xl shadow-red-950/50">
						<h2 className="text-xs font-mono font-bold tracking-widest text-red-400 uppercase">
							CRITICAL COMMAND DIRECTIVE ALERT
						</h2>
						<p className="mt-3 text-lg font-bold tracking-wide">{activeStaffDirective.directiveText}</p>
						<div className="mt-5 grid grid-cols-2 gap-3">
							<button className="py-3 bg-red-600 active:bg-red-700 rounded-xl font-bold text-xs tracking-wider uppercase text-white shadow-lg shadow-red-950/60">
								ACKNOWLEDGE
							</button>
							<button className="py-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-xs tracking-wider uppercase text-slate-300">
								MARK RESOLVED
							</button>
						</div>
					</div>
				) : (
					<div className="p-6 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10 flex flex-col items-center justify-center min-h-[180px]">
						<div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping mb-3" />
						<p className="text-sm font-bold tracking-wide text-slate-300">AWAITING TACTICAL DISPATCH ORDERS</p>
						<p className="text-xs font-mono text-slate-500 mt-1 max-w-[200px]">
							YOUR LIVE LOCATION VECTORS ARE SYNCING TO CENTRAL CONTROL
						</p>
					</div>
				)}

				{/* Dynamic Fallback Switch trigger placed in safe field interaction zones */}
				{!activeStaffDirective && (
					<button
						onClick={() => setDrawerOpen(true)}
						className="w-full py-4 border-2 border-slate-800 bg-slate-900/30 hover:bg-slate-900 rounded-xl font-mono text-xs font-bold tracking-widest text-slate-400 uppercase transition-all flex items-center justify-center space-x-2">
						<span>⌨ ENTRY EXTREME ACOUSTIC MANUAL INTAKE</span>
					</button>
				)}
			</main>

			{/* Thumb Zone Ergonomic Controller Mount */}
			<div className="z-20">
				<VoiceIngest
					onTriageComplete={(p) => console.log('Acoustic triage successfully synchronized:', p)}
					onExtractionFailure={(e) => console.error('Audio processing bypass invoked:', e)}
				/>
			</div>

			{/* Manual Backup Modal sheet integration mapping */}
			{drawerOpen && (
				<ManualTriageDrawer
					onFormSubmit={async (data) => {
						console.log('Failsafe matrix direct write processing:', data);
						// Connect to local custom service execution triggers inside actual files
					}}
					onClose={() => setDrawerOpen(false)}
				/>
			)}
		</div>
	);
};

// --- CORE LAYOUT ROUTER NODE WRAPPER ---
const LayoutRouterNode: React.FC = () => {
	const { user, claims, loading } = useStadiumAuth();

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-950">
				<div className="w-8 h-8 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
			</div>
		);
	}

	if (!user || !claims) {
		return <AuthenticationGateway />;
	}

	if (claims.admin || claims.superadmin) {
		return (
			<ActiveMatchProvider>
				<ControlRoomDashboard />
			</ActiveMatchProvider>
		);
	}

	return (
		<ActiveMatchProvider enforcedZoneFilter="ZONE-A">
			<MobileFieldInterface />
		</ActiveMatchProvider>
	);
};

export default function App() {
	return (
		<AuthProvider>
			<LayoutRouterNode />
		</AuthProvider>
	);
}
```

---

## 2. Bootstrapping Compilation Main Mount Point (`src/main.tsx`)

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Global Tailwind utility injections mapped via configurations

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
```

```

```
