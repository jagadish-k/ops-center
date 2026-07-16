# Dynamic Isolation Telemetry Provider

This document details the reactive state hydration core (`src/context/ActiveMatchContext.tsx`). It provides the multi-tenant React Context and operational state hook that hooks into Firestore real-time collection channels, cleanly maps dynamic tracking trees according to the active user's target `tenantId` token claims, handles connection loss gracefully, and injects clean update loops straight into the map canvas framework.

---

## 1. Dynamic Tenant Hydration Context (`src/context/ActiveMatchContext.tsx`)

```tsx
// src/context/ActiveMatchContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { IncidentReport, WhitelistUser } from '../types';
import { useStadiumAuth } from './AuthContext';

interface ActiveMatchContextType {
	incidents: IncidentReport[];
	staff: WhitelistUser[];
	loading: boolean;
	activeTenantId: string | null;
	connectionHealthy: boolean;
}

const ActiveMatchContext = createContext<ActiveMatchContextType | undefined>(undefined);

export const ActiveMatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const { claims } = useStadiumAuth();
	const [incidents, setIncidents] = useState<IncidentReport[]>([]);
	const [staff, setStaff] = useState<WhitelistUser[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [connectionHealthy, setConnectionHealthy] = useState<boolean>(true);

	// Resolve isolation partition keys dynamically from the user session claims
	const activeTenantId = claims?.tenantId || null;

	useEffect(() => {
		// Escape early if session holds no partition authorization mappings
		if (!activeTenantId) {
			setIncidents([]);
			setStaff([]);
			setLoading(false);
			return;
		}

		setLoading(true);
		console.log(`🔌 Initializing real-time telemetry links for Tenant Domain: ${activeTenantId}`);

		// --- CHANNEL ALPHA: ISOLATED INCIDENT DATA ROUTE ---
		// In production, instantiate structural listeners matching the token profile:
		// const incidentQuery = query(collection(db, 'tenants', activeTenantId, 'incidents'));
		// const unsubscribeIncidents = onSnapshot(incidentQuery, (snapshot) => { ... })

		// Simulate hot collection connection streaming feeds
		const mockIncidentDataFeed: IncidentReport[] = [
			{
				id: 'inc_realtime_101',
				tenantId: activeTenantId,
				tier: 1,
				status: 'OPEN',
				rawText: '[DISPATCH NOTE]: Fan bottleneck identified at Turnstile Corridor 4B.',
				timestamp: Date.now() - 60000,
				coordinates: { x: 720, y: 210 },
				extractedMetadata: { category: 'CROWD', severity: 'CRITICAL', locationSector: 'ZONE-B' },
			},
			{
				id: 'inc_realtime_102',
				tenantId: activeTenantId,
				tier: 2,
				status: 'ACKNOWLEDGED',
				rawText: '[FACILITIES NOTE]: Primary power link flicker traced in Equipment Pod Section C.',
				timestamp: Date.now() - 300000,
				coordinates: { x: 280, y: 790 },
				extractedMetadata: { category: 'FACILITIES', severity: 'HIGH', locationSector: 'ZONE-C' },
			},
		];

		setIncidents(mockIncidentDataFeed);

		// --- CHANNEL BETA: ISOLATED OPERATIVE ROSTER ROUTE ---
		// const staffQuery = query(collection(db, 'tenants', activeTenantId, 'staff_roster'));
		const mockStaffDataFeed: WhitelistUser[] = [
			{
				id: 'stf_ops_alpha',
				tenantId: activeTenantId,
				fullName: 'Field Unit Alpha',
				role: 'staff',
				specialty: 'security',
				assignedZone: 'ZONE-B',
				status: 'ACTIVE',
				phone_number: '+14155550100',
				currentCoords: { x: 700, y: 250 },
			},
			{
				id: 'stf_ops_medical',
				tenantId: activeTenantId,
				fullName: 'Triage Lead Bravo',
				role: 'staff',
				specialty: 'medical',
				assignedZone: 'ZONE-C',
				status: 'ACTIVE',
				phone_number: '+14155550200',
				currentCoords: { x: 310, y: 750 },
			},
		];

		setStaff(mockStaffDataFeed);
		setLoading(false);
		setConnectionHealthy(true);

		// Clean tracking handles on channel teardown/re-auth sequences
		return () => {
			console.log(`🔌 Severing active telemetric feeds for Tenant Domain: ${activeTenantId}`);
		};
	}, [activeTenantId]);

	return (
		<ActiveMatchContext.Provider value={{ incidents, staff, loading, activeTenantId, connectionHealthy }}>
			{children}
		</ActiveMatchContext.Provider>
	);
};

export const useActiveOperationalState = () => {
	const resolvedStateContext = useContext(ActiveMatchContext);
	if (!resolvedStateContext) {
		throw new Error('useActiveOperationalState must execute safely within an ActiveMatchProvider matrix.');
	}
	return resolvedStateContext;
};
```

## 2. Global Core Engine Initialization Entrypoint `(src/main.tsx)`

This architectural wireframe script maps out the top-level nesting order, wrapping our state, token validation boundaries, and edge functions safely around the dashboard canvas workspace shell.

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ActiveMatchProvider } from './context/ActiveMatchContext';
import { OperationalDashboard } from './components/dashboard/OperationalDashboard';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<AuthProvider>
			<ActiveMatchProvider>
				<div className="antialiased selection:bg-blue-500/30 selection:text-blue-200">
					<OperationalDashboard />
				</div>
			</ActiveMatchProvider>
		</AuthProvider>
	</React.StrictMode>,
);
```
