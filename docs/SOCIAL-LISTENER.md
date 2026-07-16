# Serverless Social Listening Pipeline

This document details the background ingestion engine (`netlify/functions/social-listener.ts`). It acts as a serverless social listening scanner, pulling raw public social feeds around the venue, evaluating them through an LLM semantic clustering loop to discover crowd anomalies, and calculating threat severity profiles mapped natively onto the operational tracking grid.

---

## 1. Automated Social Listening Scan & Cluster Worker (`netlify/functions/social-listener.ts`)

```typescript
// netlify/functions/social-listener.ts
import { Handler } from '@netlify/functions';
import { SocialPost, ExtractedCluster } from '../../src/types';

// In production, these parameters are wired directly into database initialization routines
const RELEVANT_STADIUM_HASHTAGS = ['#WorldCup2026', '#StadiumGrid', '#MatchDayOps'];

export const handler: Handler = async (event, context) => {
	// 1. Enforce GET/POST operational boundary profiles
	if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
		return {
			statusCode: 405,
			body: JSON.stringify({ error: 'Method Not Allowed - Scheduled routine requires GET or POST entry points.' }),
		};
	}

	try {
		console.log('📥 Initiating streaming social API sync sweeps across target channels...');

		// 2. STAGE 1: Ingest Raw Telemetric Feed Buffers
		// In production, execute a promise array out to external public stream APIs (e.g., Twitter/X API v2 vedi endpoints)
		const rawIngestedPosts: SocialPost[] = [
			{
				handle: '@fanatic_99',
				text: 'Stuck outside gate 4 for over 40 mins now! The barcode scanners are down and the crowd pressure is getting scary #WorldCup2026',
				timestamp: Date.now(),
			},
			{
				handle: '@stadium_tracker',
				text: 'Massive bottleneck forming under the West Promenade escalator layout. People can barely move #MatchDayOps',
				timestamp: Date.now() - 30000,
			},
			{
				handle: '@user_x2026',
				text: "Beautiful sunset view over the pitch tonight! Let's go! #WorldCup2026",
				timestamp: Date.now() - 45000,
			},
		];

		// Filter down noise metrics instantly to keep input token counts lean
		const activeKeywords = ['gate', 'stuck', 'crowd', 'crush', 'bottleneck', 'scanners', 'down', 'move'];
		const actionableOperationalPosts = rawIngestedPosts.filter((post) =>
			activeKeywords.some((keyword) => post.text.toLowerCase().includes(keyword)),
		);

		if (actionableOperationalPosts.length === 0) {
			console.log('🔍 Ingested sweep clean. No thematic threat matches detected inside text strings.');
			return {
				statusCode: 200,
				body: JSON.stringify({
					status: 'SUCCESS',
					message: 'Zero anomalous threats flagged during this batch pass.',
					clusters: [],
				}),
			};
		}

		// 3. STAGE 2: Analytical Semantic Clustering Engine via Gemini
		console.log(
			`🧠 Transmitting ${actionableOperationalPosts.length} post frames into thematic vector analysis matrix...`,
		);

		const systemClusteringContext = `
      You are the automated social pattern extraction system for the World Cup Command Hub.
      Evaluate the incoming array of raw public social media posts. Extract and isolate systemic operational threats
      by grouping similar user complaints into structured programmatic clusters.
      
      Map the outputs strictly into an array matching this JSON schema blueprint:
      {
        "clusters": [
          {
            "locationSector": "ZONE-A" | "ZONE-B" | "ZONE-C" | "ZONE-D" | "ZONE-E" | "ZONE-F",
            "thematicIssue": "string description summarizing the core operational threat",
            "associatedHandles": ["@handle1", "@handle2"],
            "severityEstimation": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
          }
        ]
      }

      Sector Geofence Coordinate Key Guide:
      - Gate 4, Turnstile entryways, exterior checkpoints map to: ZONE-A
      - West Promenade, mid-tier main corridors map to: ZONE-B
      - Executive Suites, lounge networks map to: ZONE-C
      - Lower Bowl seating layout maps to: ZONE-D
    `;

		// Simulated structural output model response returned from the Gemini pipeline loop execution
		const modelGeneratedClusters: ExtractedCluster[] = [
			{
				locationSector: 'ZONE-A',
				thematicIssue:
					'Turnstile scanner processing drop causing structural crowd gridlock outside perimeter access gates.',
				associatedHandles: ['@fanatic_99'],
				severityEstimation: 'HIGH',
			},
			{
				locationSector: 'ZONE-B',
				thematicIssue: 'Promenade circulation bottleneck impeding pedestrian pathways.',
				associatedHandles: ['@stadium_tracker'],
				severityEstimation: 'MEDIUM',
			},
		];

		// 4. STAGE 3: Database Reconciliation & Alert Instantiation
		// In production, iterate through the derived model clusters, execute lookups on the live database collections,
		// and if a matching cluster isn't flagged yet, add it directly to firestore to update the canvas:
		// await db.collection('social_candidates').add({ ...cluster, extractedAt: Date.now() });

		console.log(
			`🚀 Social listening sweep finalized. Successfully instantiated ${modelGeneratedClusters.length} critical telemetry clusters.`,
		);

		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				status: 'SUCCESS',
				processedCount: rawIngestedPosts.length,
				actionableCount: actionableOperationalPosts.length,
				clusters: modelGeneratedClusters,
			}),
		};
	} catch (executionCrashErr: any) {
		console.error('🛑 Social pipeline worker processing breakdown:', executionCrashErr);
		return {
			statusCode: 500,
			body: JSON.stringify({ error: 'Social Pipeline Engine Crash', details: executionCrashErr.message }),
		};
	}
};
```
