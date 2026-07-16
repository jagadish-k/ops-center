# SETUP-GUIDE: GenAI Operational Provisioning & Prerequisites

Before writing a single line of client code, the infrastructure dependencies, API developer access, and security vectors must be fully provisioned. This document establishes the exact blueprint for orchestrating your keys, configuring environments, and preparing Netlify for secure proxy-layer processing.

---

## 1. Third-Party Service Provisioning Checklist

### A. Google AI Studio (Gemini 1.5 Flash Engine)

1. Navigate to the [Google AI Studio Developer Console](https://aistudio.google.com/).
2. Create or link an active Google Cloud Platform (GCP) project.
3. Click **Get API Key** and provision a new key dedicated specifically to this stadium instance.
4. Take note of the key identifier string (`AIzaSy...`).
5. **Rate Limit Verification:** Ensure your tier supports a minimum of 15 RPM (Requests Per Minute) for development, with a target production quota adjustments scaling up to 1000 RPM to survive active stadium matchday peaks.

### B. OpenAI Platform (Whisper API Audio Transcription Engine)

1. Navigate to the [OpenAI Developer Dashboard](https://platform.openai.com/).
2. Initialize an organization account and establish a billing profile (Pre-funded usage tier recommended to prevent token exhaustion during test routines).
3. Access **API Keys** and click **Create new secret key**. Name it `STADIUM_FIELD_WHISPER_PROD`.
4. Copy the key output string immediately (`sk-proj-...`). _Note: OpenAI restricts visibility after initial generation._

### C. Netlify Production Platform (Hosting & Serverless Architecture)

1. Log into your Netlify dashboard and click **Add New Site** -> Link your Version Control repository (GitHub/GitLab).
2. Navigate to **Site Configuration** -> **Environment Variables**.
3. Inject the secret keys using the exact naming contract defined below. **Never click "Change variable value visibility" to public; keep values encrypted at rest and locked strictly to runtime injection.**

```text
NETLIFY ENVIRONMENT INJECTION REGISTRY:
├── GEMINI_API_KEY=AIzaSyYourSecretKeyHere
└── OPENAI_API_KEY=sk-proj-YourSecretOpenAIKeyHere
```

---

# SERVER-SIDE ADAPTER: `netlify/functions/ai-orchestrator.ts`

To guarantee compliance with our absolute security architecture, no API keys are exposed to client devices or network sniffers inside the stadium. This serverless edge runtime intercepts compressed multi-part binary audio streams from the field, executes the execution chain against external models, and returns pre-processed, clean JSON metrics to the ground team.

```typescript
// netlify/functions/ai-orchestrator.ts
import { Config, Context } from '@netlify/functions';

interface GeminiResponse {
	candidates: Array<{
		content: {
			parts: Array<{
				text: string;
			}>;
		};
	}>;
}

export default async (req: Request, context: Context) => {
	// 1. Strict CORs & Preflight Filtering
	if (req.method === 'OPTIONS') {
		return new Response('OK', {
			status: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
			},
		});
	}

	if (req.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		// 2. Extract Multi-part Data Payload from Congested Network Stream
		const formData = await req.formData();
		const audioFile = formData.get('audio') as File;

		if (!audioFile) {
			return new Response(JSON.stringify({ error: 'Missing required audio payload node' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Access injected Netlify environment variables securely on the server context
		const openAIKey = process.env.OPENAI_API_KEY;
		const geminiKey = process.env.GEMINI_API_KEY;

		if (!openAIKey || !geminiKey) {
			throw new Error('Target upstream cloud platform runtime missing operational API keys.');
		}

		// 3. Stage 1: Pipeline Pipeline to OpenAI Whisper API
		const whisperFormData = new FormData();
		whisperFormData.append('file', audioFile, 'report.webm');
		whisperFormData.append('model', 'whisper-1');
		whisperFormData.append('language', 'en'); // Enforce cross-translation evaluation defaults

		const whisperResponse = await fetch(
			'[https://api.openai.com/v1/audio/transcriptions](https://api.openai.com/v1/audio/transcriptions)',
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${openAIKey}`,
				},
				body: whisperFormData,
			},
		);

		if (!whisperResponse.ok) {
			const errorLog = await whisperResponse.text();
			console.error('Whisper Transit Failure:', errorLog);
			throw new Error('Upstream audio transcription engine failed to process the binary asset.');
		}

		const whisperData = (await whisperResponse.json()) as { text: string };
		const transcribedText = whisperData.text;

		// 4. Stage 2: Orchestration Pipeline to Gemini 1.5 Flash via Strict JSON Contract Schema
		const geminiPayload = {
			contents: [
				{
					parts: [
						{
							text: transcribedText,
						},
					],
				},
			],
			generationConfig: {
				responseMimeType: 'application/json',
				responseSchema: {
					type: 'OBJECT',
					properties: {
						tier: { type: 'INTEGER', enum: [1, 2, 3, 4, 5] },
						category: { type: 'STRING', enum: ['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY'] },
						severity: { type: 'STRING', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
						locationSector: { type: 'STRING' },
						actionRequired: { type: 'STRING' },
					},
					required: ['tier', 'category', 'severity', 'locationSector', 'actionRequired'],
				},
			},
			systemInstruction: {
				parts: [
					{
						text: 'You are the operational intelligence engine for the World Cup 2026. Extract structural triage parameters. Do not include markdown code fence formatting blocks.',
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
			const errorLog = await geminiResponse.text();
			console.error('Gemini Frame Analysis Failure:', errorLog);
			throw new Error('Upstream classification engine failed to structuralize metadata records.');
		}

		const geminiData = (await geminiResponse.json()) as GeminiResponse;
		const rawResultJsonString = geminiData.candidates[0].content.parts[0].text;

		// 5. Build Unified Payload Response Packet
		const integratedPayload = {
			rawTranscription: transcribedText,
			structuredAnalysis: JSON.parse(rawResultJsonString),
			processedTimestamp: Date.now(),
		};

		return new Response(JSON.stringify(integratedPayload), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
			},
		});
	} catch (err: any) {
		return new Response(
			JSON.stringify({
				error: 'Internal Processing Triage Failure',
				details: err.message || err,
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}
};

export const config: Config = {
	path: '/api/ai-triage',
};
```

---

# CLIENT-SIDE LAYER: GenAI Cloud Integration Adapters

Engineers implementing components on user devices consumption interface lines must use these decoupled interaction abstractions. All calls route locally to our internal serverless proxy endpoints.

## 1. Audio Recording Ingestion Client Component Adapter

```typescript
// src/services/whisper.ts

export interface ProcessedTriageResponse {
	rawTranscription: string;
	structuredAnalysis: {
		tier: number;
		category: 'SECURITY' | 'MEDICAL' | 'CROWD' | 'FACILITIES' | 'ADVISORY';
		severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
		locationSector: string;
		actionRequired: string;
	};
	processedTimestamp: number;
}

/**
 * Dispatches raw binary audio buffers captured from the device hardware microphone
 * straight into the secure localized backend proxy processing engine.
 * * @param audioBlob WebM or Ogg formatted audio snippet extracted from local media recorder streams
 */
export async function sendAudioToTriageEngine(audioBlob: Blob): Promise<ProcessedTriageResponse> {
	const payloadEnvelope = new FormData();
	// Wrap the payload with a normalized filename descriptor to preserve stream context
	payloadEnvelope.append('audio', audioBlob, 'field_staff_voice_capture.webm');

	const endpointUrl = '/api/ai-triage';

	try {
		const interactionResponse = await fetch(endpointUrl, {
			method: 'POST',
			body: payloadEnvelope,
			// Do not append manual content type headers; browser constructs multi-part boundaries automatically
		});

		if (!interactionResponse.ok) {
			const errorPayload = await interactionResponse.json();
			throw new Error(errorPayload.details || 'Upstream server experienced processing anomalies.');
		}

		const resolvedPayload = (await interactionResponse.json()) as ProcessedTriageResponse;
		return resolvedPayload;
	} catch (networkError: any) {
		console.error('Fatal network transit block inside high-density cell matrix:', networkError);
		throw networkError;
	}
}
```

## 2. Text-Based Manual Fallback Parsing Engine

If high environmental background audio pollution levels block acoustic clarity, the platform bypasses text transcription processing pipelines and channels raw interface parameters directly down the classification pipeline engine.

```typescript
// src/services/gemini.ts

import { ProcessedTriageResponse } from './whisper';

/**
 * Direct entry classification adapter proxy for 3-tap manual forms data configurations
 * or incoming public text-based social data array listening grids.
 * * @param rawManualTextInput Overriding localized text entry records written by ground handlers
 */
export async function sendTextDirectToTriageEngine(
	rawManualTextInput: string,
): Promise<Omit<ProcessedTriageResponse, 'rawTranscription'>> {
	// Re-uses the internal endpoint schema by mapping strings to simulated text payloads if required,
	// or targets structural server routing alternatives.
	const endpointUrl = '/api/ai-triage-text-direct'; // Extended secure route target parameter

	const verificationPayload = {
		textPayload: rawManualTextInput,
		clientSubmissionTimestamp: Date.now(),
	};

	try {
		const interactionResponse = await fetch(endpointUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(verificationPayload),
		});

		if (!interactionResponse.ok) {
			throw new Error('Fallback classification engine rejected parameter configurations.');
		}

		const dataContract = await interactionResponse.json();
		return dataContract;
	} catch (error) {
		console.error('Triage manual data handling runtime break:', error);
		throw error;
	}
}
```

```

```
