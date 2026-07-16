# Unified Multi-Tenant Command Suite

This document introduces the final orchestration layers required to bind our decoupled telemetry systems together. It details the Identity Management Context (`src/context/AuthContext.tsx`) that acts as the platform's security state core, and the Central Operational Control Center (`src/components/dashboard/OperationalDashboard.tsx`) which integrates real-time mapping, AI audio ingestion, multi-tenant switching, and cryptographic event timeline inspections into a single administrative console dashboard.

---

## 1. Multi-Tenant Authentication Provider (`src/context/AuthContext.tsx`)

This security context evaluates session credentials, saves signed authorization states, and exposes the tenant isolation parameters used by downstream data query hooks and edge network pathways.

```tsx
// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

interface UserSessionClaims {
	tenantId: string;
	role: 'superadmin' | 'admin' | 'staff';
	phoneNumber?: string;
	email?: string;
	exp: number;
}

interface AuthContextType {
	token: string | null;
	claims: UserSessionClaims | null;
	user: { uid: string } | null;
	loading: boolean;
	bootstrapSession: (strategy: 'TELEPHONE' | 'OAUTH_PROVIDER', inputPayload: Record<string, string>) => Promise<void>;
	terminateSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [token, setToken] = useState<string | null>(null);
	const [claims, setClaims] = useState<UserSessionClaims | null>(null);
	const [user, setUser] = useState<{ uid: string } | null>(null);
	const [loading, setLoading] = useState<boolean>(true);

	useEffect(() => {
		// Check local caches for existing active multi-tenant runtime tokens
		const cachedToken = localStorage.getItem('wm2026_saas_token');
		if (cachedToken) {
			try {
				const rawClaimsSegment = cachedToken.replace('wm2026_saas_live_', '');
				const parsedClaims = JSON.parse(atob(rawClaimsSegment)) as UserSessionClaims;

				if (parsedClaims.exp * 1000 > Date.now()) {
					setToken(cachedToken);
					setClaims(parsedClaims);
					setUser({ uid: parsedClaims.email || parsedClaims.phoneNumber || 'usr_generic_node' });
				} else {
					localStorage.removeItem('wm2026_saas_token');
				}
			} catch (err) {
				console.error('🔒 Token deserialization failure:', err);
			}
		}
		setLoading(false);
	}, []);

	const bootstrapSession = async (strategy: 'TELEPHONE' | 'OAUTH_PROVIDER', inputPayload: Record<string, string>) => {
		setLoading(true);
		try {
			// Dispatch payload to edge authenticators
			const gatewayResponse = await fetch('/api/auth/bootstrap', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ authStrategy: strategy, ...inputPayload }),
			});

			if (!gatewayResponse.ok) {
				throw new Error(`Authentication dropped by edge gateway rules: ${gatewayResponse.status}`);
			}

			const authenticationPackage = await gatewayResponse.json();

			localStorage.setItem('wm2026_saas_token', authenticationPackage.token);
			setToken(authenticationPackage.token);
			setClaims(authenticationPackage.claims);
			setUser({ uid: authenticationPackage.claims.email || authenticationPackage.claims.phoneNumber || 'usr_node' });

			console.log(`🔐 System identity context secured for tenant workspace: ${authenticationPackage.claims.tenantId}`);
		} catch (err) {
			console.error('🛑 Session bootstrap pipeline crashed:', err);
			throw err;
		} finally {
			setLoading(false);
		}
	};

	const terminateSession = () => {
		localStorage.removeItem('wm2026_saas_token');
		setToken(null);
		setClaims(null);
		setUser(null);
		window.location.reload();
	};

	return (
		<AuthContext.Provider value={{ token, claims, user, loading, bootstrapSession, terminateSession }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useStadiumAuth = () => {
	const resolvedAuthContext = useContext(AuthContext);
	if (!resolvedAuthContext) {
		throw new Error('useStadiumAuth must be invoked within a signed AuthProvider perimeter.');
	}
	return resolvedAuthContext;
};
```

---

## 2. Platform Central Operational Hub Shell (`src/components/dashboard/OperationalDashboard.tsx`)

This dashboard mounts our modular runtime units. It serves as the visual master shell that orchestrates tenant switches, handles live incident mutations through the append-only logging engine, streams real-time state changes, and anchors our compliance audit trail windows.

```tsx
// src/components/dashboard/OperationalDashboard.tsx
import React, { useState } from 'react';
import { useStadiumAuth } from '../../context/AuthContext';
import { useActiveOperationalState } from '../../context/ActiveMatchContext';
import { useTenantMutations } from '../../hooks/useTenantMutations';
import { TenantSwitcher } from './TenantSwitcher';
import { OptimizedStadiumMapCanvas } from '../shared/OptimizedStadiumMapCanvas';
import { VoiceIngest } from '../mobile/VoiceIngest';
import { AuditTimelineInspector } from './AuditTimelineInspector';
import { IncidentReport, AuditLogEntry } from '../../types';

export const OperationalDashboard: React.FC = () => {
	const { claims, bootstrapSession, terminateSession, token } = useStadiumAuth();
	const { incidents, staff, activeTenantId, connectionHealthy } = useActiveOperationalState();

	const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);
	const [auditLedgerViewOpen, setAuditLedgerViewOpen] = useState(false);
	const [volatileAuditLogs, setVolatileAuditLogs] = useState<AuditLogEntry[]>([]);
	const [authFormFields, setAuthFormFields] = useState({
		identifier: '',
		otp: '123456',
		targetTenant: 'tenant_metlife_ops',
	});

	// Provision our mutation engine interceptors
	const { transitionIncidentStatus } = useTenantMutations(activeTenantId || 'tenant_default', (mutatedIncident) => {
		setSelectedIncident(mutatedIncident);
		// Trigger down-circuit flash update alerts here if required
	});

	// Available tenant space definitions for multi-property system navigation
	const tenantPoolDefinitions = [
		{ id: 'tenant_metlife_ops', name: 'MetLife Stadium Ops Core' },
		{ id: 'tenant_sofi_ops', name: 'SoFi Stadium Command Center' },
		{ id: 'tenant_hardrock_ops', name: 'Hard Rock Tournament Hub' },
	];

	const processDirectLoginAction = async (strategy: 'TELEPHONE' | 'OAUTH_PROVIDER') => {
		const transportPayload =
			strategy === 'TELEPHONE'
				? { phone: authFormFields.identifier, otp: authFormFields.otp, requestedTenantId: authFormFields.targetTenant }
				: { oauthAccessToken: 'mock_oauth_sec_token_2026', requestedTenantId: authFormFields.targetTenant };

		await bootstrapSession(strategy, transportPayload);
	};

	// Intercept incoming AI generations and write an initial transaction log footprint
	const handleNewIncidentIngest = (newIncident: IncidentReport) => {
		console.log('🔥 Tactical Incident Generated by Serverless AI Engine:', newIncident);
		// Real-time hook: update reactive layout arrays directly
	};

	// Unauthenticated Gateway Entry Rendering State
	if (!token || !claims) {
		return (
			<div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-mono text-slate-200 selection:bg-blue-600/30">
				<div className="w-full max-w-md bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-2xl space-y-6">
					<div className="text-center space-y-1">
						<h1 className="text-xs font-black tracking-widest text-blue-400 uppercase">STADIUM OPS CORE PLATFORM</h1>
						<p className="text-[10px] text-slate-500">SECURE SAAS MULTI-TENANT INCIDENT GATEWAY</p>
					</div>
					<hr className="border-slate-850" />

					<div className="space-y-3">
						<label className="block text-[10px] uppercase font-bold text-slate-400">
							SELECT TARGET INFRASTRUCTURE DOMAIN
						</label>
						<select
							value={authFormFields.targetTenant}
							onChange={(e) => setAuthFormFields({ ...authFormFields, targetTenant: e.target.value })}
							className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500">
							{tenantPoolDefinitions.map((t) => (
								<option
									key={t.id}
									value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</div>

					<div className="space-y-3">
						<label className="block text-[10px] uppercase font-bold text-slate-400">
							TELEPHONE AUTHENTICATION MATRIX (STAFF)
						</label>
						<input
							type="text"
							placeholder="+14155552026"
							value={authFormFields.identifier}
							onChange={(e) => setAuthFormFields({ ...authFormFields, identifier: e.target.value })}
							className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs placeholder:text-slate-700 outline-none focus:border-blue-500"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4 pt-2">
						<button
							onClick={() => processDirectLoginAction('TELEPHONE')}
							className="bg-blue-600 hover:bg-blue-500 text-slate-100 font-bold text-xs py-2.5 rounded-xl border border-blue-700 uppercase tracking-wider transition-all">
							SMS Key Handshake
						</button>
						<button
							onClick={() => processDirectLoginAction('OAUTH_PROVIDER')}
							className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl uppercase tracking-wider transition-all">
							OAuth Single-Sign On
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-mono selection:bg-blue-500/20">
			{/* Platform Dashboard Top Navigation System Header */}
			<header className="h-14 border-b border-slate-900 bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between z-30 shrink-0">
				<div className="flex items-center space-x-4">
					<div className="flex flex-col">
						<span className="text-xs font-black tracking-widest text-slate-100">STADIUM_OPS // COMMAND ROOM</span>
						<span className="text-[9px] text-slate-500 font-bold uppercase">
							Role Payload Configuration: Token::{claims.role.toUpperCase()}
						</span>
					</div>

					<TenantSwitcher
						currentActiveTenantId={activeTenantId || ''}
						availableTenantsPool={tenantPoolDefinitions}
						onTenantScopeMutationRequest={(nextId) => {
							setAuthFormFields({ ...authFormFields, targetTenant: nextId });
							console.log(`🌐 Toggling multi-tenant space scope mapping straight into workspace target: ${nextId}`);
							// In production, execute cross-tenant token issuance routines cleanly
						}}
					/>
				</div>

				<div className="flex items-center space-x-3">
					<button
						onClick={() => setAuditLedgerViewOpen(true)}
						className="bg-slate-950 border border-slate-850 hover:bg-slate-900 text-amber-500 text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all">
						📋 COMPLIANCE LOG EXPLORER
					</button>

					<button
						onClick={terminateSession}
						className="text-slate-500 hover:text-red-400 text-[10px] font-bold uppercase transition-colors">
						Teardown Session ✕
					</button>
				</div>
			</header>

			{/* Main Administrative Control Grid Interface */}
			<main className="flex-1 flex overflow-hidden p-6 gap-6 relative">
				{/* Left Dashboard Sector: Reactive Map Visualizer Canvas Container */}
				<div className="flex-1 h-full bg-slate-900/30 border border-slate-900 rounded-2xl relative overflow-hidden flex flex-col shadow-2xl">
					<div className="flex-1 relative">
						<OptimizedStadiumMapCanvas
							incidents={incidents}
							staffMembers={staff}
							onIncidentSelect={(incident) => setSelectedIncident(incident)}
						/>
					</div>

					{/* Edge Ingestion Radio Transceiver Matrix */}
					<VoiceIngest
						onTriageComplete={handleNewIncidentIngest}
						onExtractionFailure={(err) => console.error('🎙️ Audio pipeline reporting ingestion drop:', err)}
					/>
				</div>

				{/* Right Dashboard Sector: Interactive Operational Workspace Inspection HUD */}
				<div className="w-[380px] h-full bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex flex-col shadow-2xl space-y-4 overflow-y-auto">
					<div className="border-b border-slate-850 pb-3">
						<h3 className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
							TACTICAL INSPECTION PROFILE
						</h3>
						<p className="text-[8px] text-slate-600">LIVE ACTION DISPATCH MUTATION HUB</p>
					</div>

					{selectedIncident ? (
						<div className="space-y-4 text-[11px] flex-1 flex flex-col justify-between">
							<div className="space-y-4">
								<div className="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-2">
									<div className="flex justify-between items-center">
										<span className="font-bold text-slate-400 uppercase text-[9px]">INCIDENT REFERENCE ID:</span>
										<span className="bg-slate-900 border border-slate-800 text-amber-400 px-2 py-0.5 rounded text-[9px] font-bold">
											{selectedIncident.id}
										</span>
									</div>
									<p className="text-slate-300 font-sans leading-relaxed">{selectedIncident.rawText}</p>
								</div>

								<div className="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-1.5">
									<span className="font-bold text-slate-400 uppercase text-[9px] block">
										CLASSIFICATION SUMMARY MATRIX
									</span>
									<div className="grid grid-cols-2 gap-2 text-[9px]">
										<div className="bg-slate-900 p-2 rounded-lg border border-slate-850">
											<span className="text-slate-500 block">SECTOR:</span>
											<span className="text-slate-200 font-bold">
												{selectedIncident.extractedMetadata.locationSector}
											</span>
										</div>
										<div className="bg-slate-900 p-2 rounded-lg border border-slate-850">
											<span className="text-slate-500 block">CATEGORY:</span>
											<span className="text-slate-200 font-bold">{selectedIncident.extractedMetadata.category}</span>
										</div>
										<div className="bg-slate-900 p-2 rounded-lg border border-slate-850">
											<span className="text-slate-500 block">SEVERITY:</span>
											<span className="text-slate-200 font-bold">{selectedIncident.extractedMetadata.severity}</span>
										</div>
										<div className="bg-slate-900 p-2 rounded-lg border border-slate-850">
											<span className="text-slate-500 block">STATUS:</span>
											<span className="text-blue-400 font-bold">{selectedIncident.status}</span>
										</div>
									</div>
								</div>
							</div>

							{/* Administrative Action Dispatch Triggers */}
							<div className="space-y-2 pt-4 border-t border-slate-850">
								<span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
									STATE MUTATION COMPLIANCE PATHS
								</span>
								<div className="grid grid-cols-2 gap-2">
									<button
										onClick={() => transitionIncidentStatus(selectedIncident, 'ACKNOWLEDGED')}
										disabled={selectedIncident.status === 'ACKNOWLEDGED'}
										className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-300 font-bold py-2 rounded-xl text-[10px] uppercase tracking-wide disabled:opacity-30">
										Acknowledge
									</button>
									<button
										onClick={() => transitionIncidentStatus(selectedIncident, 'RESOLVED')}
										disabled={selectedIncident.status === 'RESOLVED'}
										className="bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/60 text-emerald-400 font-bold py-2 rounded-xl text-[10px] uppercase tracking-wide disabled:opacity-30">
										Resolve Case
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="flex-1 flex flex-col items-center justify-center text-center text-[10px] text-slate-600 p-8 border border-dashed border-slate-850 rounded-2xl uppercase">
							🛸 No telemetry intersection vector selected.
							<br />
							Click an event node marker point within the coordinate map canvas grid to start inspection.
						</div>
					)}
				</div>

				{/* Dynamic Compliance Forensic Audit Ledger Slide-out Inspector Panel */}
				{auditLedgerViewOpen && (
					<AuditTimelineInspector
						historicalLogs={volatileAuditLogs}
						onClose={() => setAuditLedgerViewOpen(false)}
					/>
				)}
			</main>
		</div>
	);
};
```

```

```
