# Crowdsourced Social Media Listening Engine

This document contains the production implementation of Pipeline B. It features a high-velocity, serverless background worker running as a Netlify Function that acts as an ingestion buffer. It processes batched public social streaming payloads, evaluates them for thematic threat density using Gemini 1.5 Flash, and conditionally escalates clusters to the Command Room workspace.

---

## 1. Automated Social Aggregator & Cluster Evaluator (`netlify/functions/social-listener.ts`)

To prevent invocation locks and API token starvation during event peaks, this serverless engine expects 15-second batched windows of localized stadium social metrics. It leverages Google Gemini's structured response matrix to automatically filter personal banter and isolate high-density structural complaints.

```typescript
// netlify/functions/social-listener.ts
import { Config, Context } from '@netlify/functions';

interface SocialPost {
	handle: string; // The originating user account identifier (e.g., "@fan_99")
	text: string; // Raw social text scraping output
	timestamp: number; // Epoch timestamp of the public transmission
}

interface ExtractedCluster {
	locationSector: string;
	thematicIssue: string;
	associatedHandles: string[];
	severityEstimation: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface GeminiClusterResponse {
	candidates: Array<{
		content: {
			parts: Array<{
				text: string;
			}>;
		};
	}>;
}

/**
 * Generates an administrative Google OAuth2 access token using the provisioned
 * Service Account private keys to communicate with Firestore REST endpoints natively.
 */
async function getFirestoreAccessToken(serviceAccountEmail: string, privateKeyPem: string): Promise<string> {
	const pemHeader = '-----BEGIN PRIVATE KEY-----';
	const pemFooter = '-----END PRIVATE KEY-----';
	const rawKeyData = privateKeyPem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');

	const binaryKeyBuffer = Uint8Array.from(atob(rawKeyData), (c) => c.charCodeAt(0));
	const cryptoKey = await crypto.subtle.importKey(
		'pkcs8',
		binaryKeyBuffer,
		{ name: 'RSASHA264', hash: 'SHA-256' },
		false,
		['sign'],
	);

	const header = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
	const issueTime = Math.floor(Date.now() / 1000);
	const payload = JSON.stringify({
		iss: serviceAccountEmail,
		scope: '[https://www.googleapis.com/auth/datastore](https://www.googleapis.com/auth/datastore)',
		aud: '[https://oauth2.googleapis.com/token](https://oauth2.googleapis.com/token)',
		iat: issueTime,
		exp: issueTime + 3600,
	});

	const base64UrlEncode = (str: string) =>
		btoa(unescape(encodeURIComponent(str)))
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_');
	const tokenSegments = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;

	const textEncoder = new TextEncoder();
	const signatureBuffer = await crypto.subtle.sign('RSASHA264', cryptoKey, textEncoder.encode(tokenSegments));

	const finalSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	const jwt = `${tokenSegments}.${finalSignature}`;

	const response = await fetch('[https://oauth2.googleapis.com/token](https://oauth2.googleapis.com/token)', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
	});

	const data = (await response.json()) as { access_token: string };
	return data.access_token;
}

export default async (req: Request, context: Context) => {
	// 1. Inbound Method Enforcement
	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
	}

	try {
		const rawBody = await req.json();
		const inboundPosts = rawBody.posts as SocialPost[];

		if (!inboundPosts || inboundPosts.length === 0) {
			return new Response(JSON.stringify({ message: 'Empty social ingestion frame buffer. No processing required.' }), {
				status: 200,
			});
		}

		const geminiKey = process.env.GEMINI_API_KEY;
		const serviceAccountEmail = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
		const privateKeyPem = process.env.FIREBASE_PRIVATE_KEY;
		const firebaseProjectId = 'stadium-ops-2026'; // Targets global instance registry ID

		if (!geminiKey || !serviceAccountEmail || !privateKeyPem) {
			throw new Error('Missing structural server configurations or security credentials.');
		}

		// 2. Format the streaming window context array into a clean sub-string block for the AI model
		const aggregatedSocialStreamText = inboundPosts
			.map((p) => `[${p.handle} at ${p.timestamp}]: "${p.text}"`)
			.join('\n');

		// 3. Formulate the Strict Multi-Cluster Tracking JSON Prompt Schema
		const geminiPayload = {
			contents: [
				{
					parts: [
						{
							text: `Analyze this chunk of streaming crowd text data for active stadium operational issues:\n${aggregatedSocialStreamText}`,
						},
					],
				},
			],
			generationConfig: {
				responseMimeType: 'application/json',
				responseSchema: {
					type: 'OBJECT',
					properties: {
						clusters: {
							type: 'ARRAY',
							items: {
								type: 'OBJECT',
								properties: {
									locationSector: { type: 'STRING' },
									thematicIssue: { type: 'STRING' },
									associatedHandles: { type: 'ARRAY', items: { type: 'STRING' } },
									severityEstimation: { type: 'STRING', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
								},
								required: ['locationSector', 'thematicIssue', 'associatedHandles', 'severityEstimation'],
							},
						},
					},
					required: ['clusters'],
				},
			},
			systemInstruction: {
				parts: [
					{
						text: 'You are the automated social monitoring instance for World Cup 2026. Ignore conversational noise, personal excitement, or normal fan cheer. Group overlapping posts highlighting identical structural threats, safety bottlenecks, line stalls, or medical distress into spatial clusters. Normalize location zones to formats like ZONE-A, ZONE-B.',
					},
				],
			},
		};

		const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
		const geminiResponse = await fetch(geminiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(geminiPayload),
		});

		if (!geminiResponse.ok) {
			throw new Error('Upstream model engine failed to evaluate the social buffer matrix.');
		}

		const geminiData = (await geminiResponse.json()) as GeminiClusterResponse;
		const parsedModelOutput = JSON.parse(geminiData.candidates[0].content.parts[0].text) as {
			clusters: ExtractedCluster[];
		};

		let committedCandidatesCount = 0;

		// 4. Evaluate Threshold Densities Natively (Enforce Rule: Requires >= 5 Independent Handles)
		const criticalClusters = parsedModelOutput.clusters.filter((cluster) => cluster.associatedHandles.length >= 5);

		if (criticalClusters.length > 0) {
			// Initialize internal administrative Google Auth handshake
			const accessToken = await getFirestoreAccessToken(serviceAccountEmail, privateKeyPem);

			for (const cluster of criticalClusters) {
				const firestoreEndpoint = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/social_candidates`;

				// Structure the Firestore document mapping to native REST JSON payload specification keys
				const firestorePayload = {
					fields: {
						locationSector: { stringValue: cluster.locationSector },
						thematicIssue: { stringValue: cluster.thematicIssue },
						densityCount: { integerValue: cluster.associatedHandles.length.toString() },
						severity: { stringValue: cluster.severityEstimation },
						sourceHandles: {
							arrayValue: {
								values: cluster.associatedHandles.map((h) => ({ stringValue: h })),
							},
						},
						ingestedTimestamp: { integerValue: Date.now().toString() },
						status: { stringValue: 'PENDING_REVIEW' },
					},
				};

				const writeResponse = await fetch(firestoreEndpoint, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(firestorePayload),
				});

				if (writeResponse.ok) {
					committedCandidatesCount++;
				} else {
					console.error(
						'Failed to commit social candidate entry into Firestore infrastructure:',
						await writeResponse.text(),
					);
				}
			}
		}

		return new Response(
			JSON.stringify({
				status: 'SUCCESS',
				processedSourceCount: inboundPosts.length,
				evaluatedClustersCount: parsedModelOutput.clusters.length,
				escalatedToCommandRoom: committedCandidatesCount,
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	} catch (err: any) {
		console.error('Social pipeline execution exception:', err);
		return new Response(JSON.stringify({ error: 'Pipeline Ingestion Crash Exception', details: err.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};

export const config: Config = {
	path: '/api/ingest/social-stream',
};
```

```

```
