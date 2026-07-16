# High-Density Performance Seed & Stress-Test Harness

This document delivers the absolute blueprint for `seed-stadium-load.ts`. It leverages the Node.js Firebase Admin SDK runtime environment to instantly inject 50 active incident alerts and continuously update 150 moving staff members over the `0-1000` virtual coordinate matrix. This script acts as the operational hammer to verify the viewport-culling boundaries and spatial clustering lock at a constant 60 FPS under peak capacity load limits.

---

## 1. High-Density Matchday Simulation Tool (`scripts/seed-stadium-load.ts`)

```typescript
// scripts/seed-stadium-load.ts
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- SERVICE ACCOUNT INFRASTRUCTURE DEPLOYMENT BINDINGS ---
// Expects target service account credentials injected into the shell execution path
const serviceAccountJsonBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!serviceAccountJsonBase64) {
	console.error('FATAL CRASH: Environment variable FIREBASE_SERVICE_ACCOUNT_BASE64 is missing.');
	process.exit(1);
}

const decryptedCredentials = JSON.parse(Buffer.from(serviceAccountJsonBase64, 'base64').toString('utf8'));

if (getApps().length === 0) {
	initializeApp({
		credential: cert(decryptedCredentials),
	});
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// --- CONFIGURATION MATRIX THRESHOLDS ---
const TOTAL_STAFF_NODES = 150;
const TOTAL_INCIDENT_BEACONS = 50;
const VIRTUAL_GRID_LIMIT = 1000; // Hard coordinate boundary envelope limits (0-1000)

const SECTORS = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'];
const CATEGORIES = ['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES'];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SPECIALTIES = ['security', 'medical', 'cleaning', 'supervisor'];

/**
 * Returns a high-precision random float within a specified coordinate window bounding box
 */
const generateRandomVector = (min: number, max: number): number => {
	return Math.random() * (max - min) + min;
};

/**
 * Generates an automated text log matching sample categories to feed processing pipes
 */
const compileMockReportText = (category: string, sector: string): string => {
	switch (category) {
		case 'SECURITY':
			return `Simulated Threat: Aggressive crowd surge identified near turnstile vector gates at ${sector}. Immediate security intercept required.`;
		case 'MEDICAL':
			return `Simulated Distress: Heat exhaustion casualty collapsed inside upper terrace seating cluster at ${sector}. Requesting stretcher dispatch.`;
		case 'CROWD':
			return `Simulated Backlog: Density overflow block at exit lane staircase pathways in ${sector}. High danger of crushing stampede.`;
		case 'FACILITIES':
			return `Simulated Failure: Structural water main rupture flooding the lower structural electrical access tier within ${sector}.`;
		default:
			return `Simulated tactical anomaly report logged inside sector: ${sector}`;
	}
};

/**
 * Stage 1: Wipes out existing diagnostic collections to establish clean baselines
 */
async function purgeOperationalEnvironment() {
	console.log('► INITIALIZING TARGET INFRASTRUCTURE PURGE SYSTEM RITUAL...');

	const collectionsToClear = ['incidents', 'staff_roster', 'dispatches'];

	for (const collectionName of collectionsToClear) {
		const documentsSnapshot = await db.collection(collectionName).limit(500).get();
		const batchTransaction = db.batch();

		documentsSnapshot.docs.forEach((doc) => {
			batchTransaction.delete(doc.ref);
		});

		await batchTransaction.commit();
		console.log(`✔ Successfully purged database workspace matching collection node: [${collectionName}]`);
	}
}

/**
 * Stage 2: Generates 50 tightly packed incident arrays to stress spatial layout algorithms
 */
async function provisionStressIncidents() {
	console.log(`► SEEDING ${TOTAL_INCIDENT_BEACONS} RAW OPERATIONAL INCIDENT BEACONS...`);
	const batchTransaction = db.batch();

	for (let idx = 0; idx < TOTAL_INCIDENT_BEACONS; idx++) {
		const assignedSector = SECTORS[Math.floor(Math.random() * SECTORS.length)];
		const chosenCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
		const chosenSeverity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];
		const tierLevel = chosenSeverity === 'CRITICAL' ? 1 : chosenSeverity === 'HIGH' ? 2 : 3;

		// Simulate localized clusters by occasionally enforcing shared coordinates
		const seedClusterGroup = idx % 5 === 0;
		const coordinateVectorX = seedClusterGroup ? 450.25 : generateRandomVector(50, VIRTUAL_GRID_LIMIT - 50);
		const coordinateVectorY = seedClusterGroup ? 450.25 : generateRandomVector(50, VIRTUAL_GRID_LIMIT - 50);

		const targetDocRef = db.collection('incidents').doc(`stress_inc_${idx}`);

		const incidentPayload = {
			tier: tierLevel,
			status: Math.random() > 0.4 ? 'OPEN' : 'DISPATCHED',
			rawText: compileMockReportText(chosenCategory, assignedSector),
			timestamp: Date.now() - Math.floor(Math.random() * 3600000),
			coordinates: {
				x: parseFloat(coordinateVectorX.toFixed(2)),
				y: parseFloat(coordinateVectorY.toFixed(2)),
			},
			extractedMetadata: {
				category: chosenCategory,
				severity: chosenSeverity,
				locationSector: assignedSector,
				actionRequired: 'Deploy high-density stress response vectors instantly.',
			},
		};

		batchTransaction.set(targetDocRef, incidentPayload);
	}

	await batchTransaction.commit();
	console.log('✔ Stress incidents generated successfully.');
}

/**
 * Stage 3: Provisions 150 staff nodes and launches continuous kinetic vector coordinate ticks
 */
async function launchKineticStaffSimulator() {
	console.log(`► SEEDING ${TOTAL_STAFF_NODES} STADIUM ROSTER PERSONNEL PROFILES...`);

	const staffRegistryCache: Array<{ id: string; x: number; y: number }> = [];

	// Provision base records instantly
	for (let idx = 0; idx < TOTAL_STAFF_NODES; idx++) {
		const targetId = `stress_staff_${idx.toString().padStart(3, '0')}`;
		const initialPositionX = generateRandomVector(100, VIRTUAL_GRID_LIMIT - 100);
		const initialPositionY = generateRandomVector(100, VIRTUAL_GRID_LIMIT - 100);
		const specialtyRole = SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)];
		const assignedSector = SECTORS[Math.floor(Math.random() * SECTORS.length)];

		const staffPayload = {
			fullName: `Stress Test Operative Unit [${idx}]`,
			role: specialtyRole === 'supervisor' ? 'admin' : 'staff',
			specialty: specialtyRole,
			assignedZone: assignedSector,
			status: Math.random() > 0.2 ? 'ACTIVE' : 'DISPATCHED',
			phone_number: `+1999555${idx.toString().padStart(4, '0')}`,
			currentCoords: {
				x: parseFloat(initialPositionX.toFixed(2)),
				y: parseFloat(initialPositionY.toFixed(2)),
			},
		};

		await db.collection('staff_roster').doc(targetId).set(staffPayload);
		staffRegistryCache.push({ id: targetId, x: initialPositionX, y: initialPositionY });
	}

	console.log('✔ Base personnel array provisioned. Starting real-time motion execution loops...');
	console.log('► [PRESS CTRL+C TO TERMINATE THE STICKY MOTION TICK MATRIX]');

	// Infinite positional update tick emulator running every 500ms
	setInterval(async () => {
		const batchTransaction = db.batch();

		// Pick 20 staff members at random per tick frame to bound transmission write constraints
		const subsetToMutate = staffRegistryCache.sort(() => 0.5 - Math.random()).slice(0, 20);

		subsetToMutate.forEach((staffNode) => {
			// Calculate micro-movements along random vectors (-8 to +8 pixel drift values)
			const horizontalDrift = generateRandomVector(-8, 8);
			const verticalDrift = generateRandomVector(-8, 8);

			// Bounce characters away if they clip stadium boundary vectors
			let nextX = staffNode.x + horizontalDrift;
			let nextY = staffNode.y + verticalDrift;

			if (nextX < 10 || nextX > VIRTUAL_GRID_LIMIT - 10) nextX = staffNode.x - horizontalDrift;
			if (nextY < 10 || nextY > VIRTUAL_GRID_LIMIT - 10) nextY = staffNode.y - verticalDrift;

			staffNode.x = nextX;
			staffNode.y = nextY;

			const targetDocRef = db.collection('staff_roster').doc(staffNode.id);
			batchTransaction.update(targetDocRef, {
				'currentCoords.x': parseFloat(nextX.toFixed(2)),
				'currentCoords.y': parseFloat(nextY.toFixed(2)),
			});
		});

		try {
			await batchTransaction.commit();
			process.stdout.write(`❖ Operational Frame Transmitted: Synced positional vectors for 20 field units.\r`);
		} catch (writeErr) {
			console.error('\n[!] Execution pipeline dropped data packet batch update frame:', writeErr);
		}
	}, 500);
}

// --- EXECUTION ORCHESTRATION LAYER TRACKS ---
(async () => {
	try {
		await purgeOperationalEnvironment();
		await provisionStressIncidents();
		await launchKineticStaffSimulator();
	} catch (fatalError) {
		console.error('CRITICAL TEST INITIALIZATION ANOMALY ERUPTED:', fatalError);
		process.exit(1);
	}
})();
```

```

```
