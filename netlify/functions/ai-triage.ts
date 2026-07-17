/**
 * POST /api/ai-triage
 *
 * Voice triage pipeline (ADR-0006):
 *   1. Receive multipart audio (webm/opus) from the field client.
 *   2. Stage 1: OpenAI Whisper API → transcribed text.
 *   3. Stage 2: Gemini 1.5 Flash → structured 5-tier extraction.
 *   4. Stage 3: Resolve sector coordinates + create incident in Postgres.
 *   5. Return the created IncidentReport.
 *
 * Dev mode (no OPENAI_API_KEY / GEMINI_API_KEY): uses a mock transcription +
 * mock extraction so local development works without real API keys.
 *
 * Security: JWT-verified. tenantId resolved from claims (not form data).
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http.ts';
import { createIncident } from '../lib/incidents.ts';
import { checkOperationalWindow } from '../lib/operational-window.ts';
import type { TriageResult, IncidentCategory, IncidentSeverity, InfoTier } from '../../src/types';

// ─── AI helpers ───────────────────────────────────────────────────────────────

interface WhisperResponse {
	text: string;
}

interface GeminiResponse {
	candidates: Array<{
		content: { parts: Array<{ text: string }> };
	}>;
}

/** Calls OpenAI Whisper API to transcribe an audio blob. */
async function transcribeAudio(audioBlob: Blob): Promise<string> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		// Dev mode — return a mock transcription.
		return 'Code red emergency at Turnstile Sector Alpha, crowd crushing risk forming. Multiple gates jammed, requesting immediate medical and security backup.';
	}

	const formData = new FormData();
	formData.append('file', audioBlob, 'report.webm');
	formData.append('model', 'whisper-1');
	formData.append('language', 'en');

	const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}` },
		body: formData,
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Whisper API error:', response.status, errorText);
		throw new Error('Audio transcription failed.');
	}

	const data = (await response.json()) as WhisperResponse;
	return data.text;
}

/** Calls Gemini 1.5 Flash to extract structured triage data from text. */
async function extractTriage(transcribedText: string): Promise<{
	tier: InfoTier;
	category: IncidentCategory;
	severity: IncidentSeverity;
	locationSector: string;
	actionRequired: string;
}> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		// Dev mode — return a mock extraction.
		return {
			tier: 1,
			category: 'CROWD',
			severity: 'CRITICAL',
			locationSector: 'ZONE-A',
			actionRequired: 'Deploy relief cordons to Sector Alpha immediately.',
		};
	}

	const payload = {
		contents: [{ parts: [{ text: transcribedText }] }],
		generationConfig: {
			responseMimeType: 'application/json',
			responseSchema: {
				type: 'OBJECT',
				properties: {
					tier: { type: 'INTEGER', enum: [1, 2, 3, 4, 5] },
					category: {
						type: 'STRING',
						enum: ['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY'],
					},
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
					text: 'You are the operational intelligence engine for a stadium operations platform. Analyze transcribed field reports and extract structured triage parameters. Classify into the 5-tier system (1=life safety, 5=advisory). Normalize zone names to ZONE-A through ZONE-F format. Respond only with the JSON object.',
				},
			],
		},
	};

	const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Gemini API error:', response.status, errorText);
		throw new Error('Structured extraction failed.');
	}

	const data = (await response.json()) as GeminiResponse;
	const rawJson = data.candidates[0].content.parts[0].text;
	return JSON.parse(rawJson);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	// Anyone with incident:create can file (staff + admin + superadmin per ADR-0011).
	const auth = await authorizeRequest(request, 'incident:create');
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

	// Enforce the operational time window.
	const windowCheck = await checkOperationalWindow(claims);
	if (!windowCheck.ok) {
		return jsonResponse({ error: windowCheck.reason }, 403);
	}

	try {
		// Extract the audio blob from multipart form data.
		const formData = await request.formData();
		const audioFile = formData.get('audio');

		if (!audioFile || !(audioFile instanceof Blob)) {
			return badRequest('Missing audio payload.');
		}

		// Stage 1: Transcribe.
		const transcribedText = await transcribeAudio(audioFile);

		// Stage 2: Extract structured triage data.
		let triage: {
			tier: InfoTier;
			category: IncidentCategory;
			severity: IncidentSeverity;
			locationSector: string;
			actionRequired: string;
		};
		let extractionFailed = false;

		try {
			triage = await extractTriage(transcribedText);
		} catch (extractErr) {
			console.error('Gemini extraction failed, creating incident with defaults:', extractErr);
			extractionFailed = true;
			triage = {
				tier: 3,
				category: 'ADVISORY',
				severity: 'MEDIUM',
				locationSector: 'UNKNOWN',
				actionRequired: 'AI extraction failed — manual classification required.',
			};
		}

		// Stage 3: Create the incident in Postgres.
		const incident = await createIncident({
			tenantId: claims.tenant_id,
			source: 'field_staff',
			tier: triage.tier,
			rawText: extractionFailed
				? `[REVIEW NEEDED] ${transcribedText}`
				: transcribedText,
			category: triage.category,
			severity: triage.severity,
			locationSector: triage.locationSector,
			actionRequired: triage.actionRequired,
		});

		const result: TriageResult & { incident: typeof incident } = {
			rawTranscription: transcribedText,
			structuredAnalysis: triage,
			processedTimestamp: Date.now(),
			incident,
		};

		return jsonResponse(result);
	} catch (err) {
		console.error('ai-triage error:', err);
		const message = err instanceof Error ? err.message : 'Voice triage pipeline failed.';
		return serverError(message);
	}
};

export const config: Config = {
	path: '/api/ai-triage',
};
