# Real-Time Synchronization & Global State Contract

This document provides the implementation for the core reactive tracking layer (`src/context/` and `src/hooks/`). This layer links real-time collection streams from Firebase Firestore directly into our high-performance canvas loop and mobile field components, using optimized listeners to prevent layout re-render drops over saturated stadium cell connections.

---

## 1. Cryptographic Authentication & Claims Context (`AuthContext.tsx`)

This component coordinates client session states. It sends phone numbers down to the Netlify Edge bootstrap proxy, captures the resulting Custom JWT Token, and maps roles across the client layout trees.

```tsx
// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut, User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';

interface AuthContextContract {
	user: FirebaseUser | null;
	claims: {
		superadmin: boolean;
		admin: boolean;
		staff: boolean;
		phoneNumber?: string;
	} | null;
	loading: boolean;
	executePhoneBootstrapping: (phoneNumber: string, token: string) => Promise<void>;
	executeSessionTermination: () => Promise<void>;
}

const AuthContext = createContext<AuthContextContract | undefined>(undefined);

// Firebase Web SDK Client Initialization
const firebaseConfig = {
	apiKey: 'AIzaSyFakeKeyForLayoutContractsOnly',
	authDomain: 'stadium-ops-2026.firebaseapp.com',
	projectId: 'stadium-ops-2026',
	storageBucket: 'stadium-ops-2026.appspot.com',
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const coreAuth = getAuth(firebaseApp);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [user, setUser] = useState<FirebaseUser | null>(null);
	const [claims, setClaims] = useState<AuthContextContract['claims']>(null);
	const [loading, setLoading] = useState<boolean>(true);

	useEffect(() => {
		// Establish a persistent network listener to process auth state switches
		const unsubscribe = onAuthStateChanged(coreAuth, async (activeUser) => {
			if (activeUser) {
				setUser(activeUser);
				// Extract and parse crypographic claims tokens manually out of ID payloads
				const tokenResult = await activeUser.getIdTokenResult(true);
				setClaims({
					superadmin: !!tokenResult.claims.superadmin,
					admin: !!tokenResult.claims.admin,
					staff: !!tokenResult.claims.staff,
					phoneNumber: tokenResult.claims.phone_number as string,
				});
			} else {
				setUser(null);
				setClaims(null);
			}
			setLoading(false);
		});

		return () => unsubscribe();
	}, []);

	const executePhoneBootstrapping = async (phoneNumber: string, validationOtp: string) => {
		setLoading(true);
		try {
			// Dispatches verification attributes straight through our Edge Gating proxy layer
			const networkResponse = await fetch('/api/auth/bootstrap', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phoneNumber, verificationToken: validationOtp }),
			});

			if (!networkResponse.ok) {
				throw new Error('Identity authorization rejected at edge gateway.');
			}

			const { firebaseToken } = await networkResponse.json();

			// Complete client validation handshake with the Firebase Custom Claims core
			await signInWithCustomToken(coreAuth, firebaseToken);
		} catch (err) {
			console.error('Handshake verification failed inside auth pipeline context:', err);
			setLoading(false);
			throw err;
		}
	};

	const executeSessionTermination = async () => {
		setLoading(true);
		await signOut(coreAuth);
	};

	return (
		<AuthContext.Provider value={{ user, claims, loading, executePhoneBootstrapping, executeSessionTermination }}>
			{!loading && children}
		</AuthContext.Provider>
	);
};

export const useStadiumAuth = () => {
	const context = useContext(AuthContext);
	if (!context) throw new Error('useStadiumAuth must be executed within an AuthProvider node wrapper.');
	return context;
};
```

---

## 2. Decoupled Tactical Operations Engine (`ActiveMatchContext.tsx`)

This optimization context abstracts incoming Firestore message streams. It structures tactical logs into localized memory refs, exposing raw arrays that can be consumed by the high-velocity Canvas map component without triggering full app UI layout drops.

```tsx
// src/context/ActiveMatchContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { IncidentReport, WhitelistUser, DispatchDirective } from '../types';

interface OperationalStateContract {
	incidents: IncidentReport[];
	staff: WhitelistUser[];
	activeDispatches: DispatchDirective[];
	loading: boolean;
	stadiumConfig: { venueName: string; boundsActive: boolean } | null;
}

const ActiveMatchContext = createContext<OperationalStateContract | undefined>(undefined);
const db = getFirestore();

export const ActiveMatchProvider: React.FC<{ children: React.ReactNode; enforcedZoneFilter?: string }> = ({
	children,
	enforcedZoneFilter,
}) => {
	const [incidents, setIncidents] = useState<IncidentReport[]>([]);
	const [staff, setStaff] = useState<WhitelistUser[]>([]);
	const [activeDispatches, setActiveDispatches] = useState<DispatchDirective[]>([]);
	const [stadiumConfig, setStadiumConfig] = useState<OperationalStateContract['stadiumConfig']>(null);
	const [loading, setLoading] = useState<boolean>(true);

	// References help prevent hook evaluation cascades across WebSocket pipelines
	const initialSyncCount = useRef({ incidents: false, staff: false, dispatches: false });

	useEffect(() => {
		const evaluateGlobalLoadingState = () => {
			if (initialSyncCount.current.incidents && initialSyncCount.current.staff && initialSyncCount.current.dispatches) {
				setLoading(false);
			}
		};

		// 1. Pipeline Stream Integration: Active Tactical Incidents Queue
		const incidentsQuery = enforcedZoneFilter
			? query(
					collection(db, 'incidents'),
					where('extractedMetadata.locationSector', '==', enforcedZoneFilter),
					where('status', '!=', 'CLOSED'),
				)
			: query(collection(db, 'incidents'), where('status', '!=', 'CLOSED'));

		const unsubscribeIncidents = onSnapshot(
			incidentsQuery,
			(snapshot) => {
				const activeBuffer: IncidentReport[] = [];
				snapshot.forEach((docNode) => {
					activeBuffer.push({ id: docNode.id, ...docNode.data() } as IncidentReport);
				});
				setIncidents(activeBuffer);
				initialSyncCount.current.incidents = true;
				evaluateGlobalLoadingState();
			},
			(error) => console.error('Incidents tracking sync break:', error),
		);

		// 2. Pipeline Stream Integration: Ground Personnel Positional Vectors
		const staffQuery = enforcedZoneFilter
			? query(
					collection(db, 'staff_roster'),
					where('assignedZone', '==', enforcedZoneFilter),
					where('status', '!=', 'OFF_DUTY'),
				)
			: query(collection(db, 'staff_roster'), where('status', '!=', 'OFF_DUTY'));

		const unsubscribeStaff = onSnapshot(
			staffQuery,
			(snapshot) => {
				const staffBuffer: WhitelistUser[] = [];
				snapshot.forEach((docNode) => {
					staffBuffer.push({ id: docNode.id, ...docNode.data() } as WhitelistUser);
				});
				setStaff(staffBuffer);
				initialSyncCount.current.staff = true;
				evaluateGlobalLoadingState();
			},
			(error) => console.error('Staff tracking vector synchronization break:', error),
		);

		// 3. Pipeline Stream Integration: Command Directives Log Channels
		const dispatchesQuery = query(collection(db, 'dispatches'), where('status', '!=', 'RESOLVED'));

		const unsubscribeDispatches = onSnapshot(
			dispatchesQuery,
			(snapshot) => {
				const dispatchBuffer: DispatchDirective[] = [];
				snapshot.forEach((docNode) => {
					dispatchBuffer.push({ id: docNode.id, ...docNode.data() } as DispatchDirective);
				});
				setActiveDispatches(dispatchBuffer);
				initialSyncCount.current.dispatches = true;
				evaluateGlobalLoadingState();
			},
			(error) => console.error('Directives dispatch sync link broken:', error),
		);

		// Pull configurations once via absolute server hook
		getDoc(doc(db, 'config', 'stadium_envelope')).then((res) => {
			if (res.exists()) {
				const payload = res.data();
				setStadiumConfig({ venueName: payload.name, boundsActive: payload.operational });
			}
		});

		return () => {
			unsubscribeIncidents();
			unsubscribeStaff();
			unsubscribeDispatches();
		};
	}, [enforcedZoneFilter]);

	return (
		<ActiveMatchContext.Provider value={{ incidents, staff, activeDispatches, stadiumConfig, loading }}>
			{children}
		</ActiveMatchContext.Provider>
	);
};

export const useActiveOperationalState = () => {
	const context = useContext(ActiveMatchContext);
	if (!context) throw new Error('useActiveOperationalState must be resolved inside an ActiveMatchProvider container.');
	return context;
};
```

```

```
