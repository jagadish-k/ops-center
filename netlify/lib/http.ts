/**
 * Shared HTTP helpers for Netlify Functions.
 *
 * Provides CORS-aware JSON responses and a preflight handler so every
 * protected endpoint doesn't repeat the same boilerplate.
 */

/** Returns the allowed origin(s) from env, falling back to localhost for dev. */
function getAllowedOrigin(): string {
	return process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:8888';
}

const JSON_HEADERS: Record<string, string> = {
	'Content-Type': 'application/json',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

/** Builds a JSON Response with CORS headers. */
export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...JSON_HEADERS,
			'Access-Control-Allow-Origin': getAllowedOrigin(),
		},
	});
}

/** Handles CORS preflight (OPTIONS). Returns null for non-OPTIONS requests. */
export function handlePreflight(request: Request): Response | null {
	if (request.method !== 'OPTIONS') return null;
	return new Response('OK', {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': getAllowedOrigin(),
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
		},
	});
}

/** Standard error responses. */
export function unauthorized(message = 'Authentication required.'): Response {
	return jsonResponse({ error: message }, 401);
}

export function badRequest(message: string): Response {
	return jsonResponse({ error: message }, 400);
}

export function serverError(message = 'Internal server error.'): Response {
	return jsonResponse({ error: message }, 500);
}
