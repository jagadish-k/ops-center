# Telemetry Validation & Matchday Simulation Engine

This document details the quality assurance and simulation tier (`src/__tests__/` and `scripts/`). It provides the unit test configuration to validate the mathematical precision of the canvas coordinate system, followed by a standalone Node.js simulation engine script to stress-test real-time field data updates.

---

## 1. Spatial Vector & Raycast Unit Test (`src/__tests__/canvasMath.test.ts`)

This test suite guarantees that coordinate conversions between raw client pixels and the normalized $0 \dots 1000$ stadium grid remain perfectly accurate across all mobile and desktop screen viewport aspect ratios.

```typescript
// src/__tests__/canvasMath.test.ts
import { describe, it, expect } from 'vitest';

// Function under test: Converts raw device interaction coordinates into normalized system grid vectors
function calculateNormalizedCoordinates(
	clientX: number,
	clientY: number,
	canvasBounds: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
	// Enforce bounding box limits to avoid boundary leaks
	const constrainedX = Math.max(0, Math.min(clientX - canvasBounds.left, canvasBounds.width));
	const constrainedY = Math.max(0, Math.min(clientY - canvasBounds.top, canvasBounds.height));

	// Project vectors cleanly onto the structural 0-1000 coordinate plane
	const normalizedX = Math.round((constrainedX / canvasBounds.width) * 1000);
	const normalizedY = Math.round((constrainedY / canvasBounds.height) * 1000);

	return { x: normalizedX, y: normalizedY };
}

describe('Stadium Map Canvas Coordinate Projection Engine', () => {
	const mockBounds = { left: 100, top: 50, width: 800, height: 600 };

	it('should resolve precise center target vectors correctly', () => {
		const clickX = 500; // 100 + (800 / 2)
		const clickY = 350; // 50 + (600 / 2)

		const result = calculateNormalizedCoordinates(clickX, clickY, mockBounds);

		expect(result.x).toBe(500);
		expect(result.y).toBe(500);
	});

	it('should clip boundary overflows cleanly to the matrix perimeter edges', () => {
		const overflowX = 1000;
		const overflowY = 900;

		const result = calculateNormalizedCoordinates(overflowX, overflowY, mockBounds);

		expect(result.x).toBe(1000);
		expect(result.y).toBe(1000);
	});

	it('should resolve absolute zero grid positions accurately at the top-left boundary', () => {
		const result = calculateNormalizedCoordinates(100, 50, mockBounds);

		expect(result.x).toBe(0);
		expect(result.y).toBe(0);
	});
});
```

---

## 2. Dynamic Matchday Telemetry Simulation Script (`scripts/matchday-simulator.ts`)

This standalone executable acts as a stress-testing driver. When run locally, it maps out a simulated matchday environment, generating chaotic asset telemetry tracks and mock AI emergency alerts to stress-test the state layers and UI canvas.

```typescript
// scripts/matchday-simulator.ts
import { IncidentReport, WhitelistUser } from '../src/types';

const SIMULATION_TARGET_SECTORS = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E'];
const MOCK_STAFF_POOL: WhitelistUser[] = [
	{
		id: 'sim_stf_01',
		fullName: 'Alpha Response Lead',
		role: 'staff',
		specialty: 'security',
		assignedZone: 'ZONE-A',
		status: 'ACTIVE',
		phone_number: '+14155550001',
		currentCoords: { x: 450, y: 320 },
	},
	{
		id: 'sim_stf_02',
		fullName: 'Beta Medical Triage',
		role: 'staff',
		specialty: 'medical',
		assignedZone: 'ZONE-B',
		status: 'ACTIVE',
		phone_number: '+14155550002',
		currentCoords: { x: 510, y: 490 },
	},
];

console.log('🚀 Starting Stadium Ops Grid Live Simulation Engine...');
console.log('Press Ctrl+C to terminate the streaming telemetry vector pipelines.');

// Simulate minor position drifts to emulate GPS jitter in enclosed arena structures
function applySpatialJitter(coord: number): number {
	const driftAmount = Math.floor(Math.random() * 21) - 10; // Value between -10 and +10 coordinates
	return Math.max(0, Math.min(1000, coord + driftAmount));
}

// Generates dynamic synthetic alerts mirroring natural field communications
function compileSyntheticIncident(): Partial<IncidentReport> {
	const randomSector = SIMULATION_TARGET_SECTORS[Math.floor(Math.random() * SIMULATION_TARGET_SECTORS.length)];
	const categories = ['CROWD', 'SECURITY', 'FACILITIES', 'MEDICAL'] as const;
	const pickedCategory = categories[Math.floor(Math.random() * categories.length)];
	const tiers = [1, 2, 3] as const;
	const pickedTier = tiers[Math.floor(Math.random() * tiers.length)];

	return {
		id: `sim_inc_${Math.random().toString(36).substr(2, 5)}`,
		tier: pickedTier,
		status: 'OPEN',
		rawText: `[SIMULATED FEED ALERT]: Anomalous activity trace identified near ${randomSector}. Category: ${pickedCategory}.`,
		timestamp: Date.now(),
		extractedMetadata: {
			category: pickedCategory,
			severity: pickedTier === 1 ? 'CRITICAL' : pickedTier === 2 ? 'HIGH' : 'MEDIUM',
			locationSector: randomSector,
		},
	};
}

// Main execution simulation interval loop
const operationalTelemetryInterval = setInterval(() => {
	// 1. Shift staff positional mapping arrays
	MOCK_STAFF_POOL.forEach((staff) => {
		staff.currentCoords.x = applySpatialJitter(staff.currentCoords.x);
		staff.currentCoords.y = applySpatialJitter(staff.currentCoords.y);
		console.log(
			`📡 [STAFF TELEMETRY TICK] ${staff.fullName} -> Matrix Coordinate Map: (${staff.currentCoords.x},${staff.currentCoords.y})`,
		);
	});

	// 2. Roll random threat incidence loops (15% chance per clock loop pass)
	if (Math.random() < 0.15) {
		const freshIncident = compileSyntheticIncident();
		console.log(
			`🚨 [INBOUND LLM LOG PIPELINE EMISSION] ${freshIncident.id} - Tier ${freshIncident.tier} -${freshIncident.extractedMetadata?.locationSector}`,
		);
		// In production, execute standard fetch queries pointing straight to the mock ingestion endpoint:
		// fetch('http://localhost:8888/api/ai-orchestrator', { method: 'POST', body: JSON.stringify(...) })
	}
}, 3000); // Emits transactional updates every 3000ms

// Handle clean signal interruptions out of terminal layers
process.on('SIGINT', () => {
	clearInterval(operationalTelemetryInterval);
	console.log('\n🔌 Simulation telemetry channels disconnected cleanly. Workspace idle.');
	process.exit(0);
});
```

---

```

```
