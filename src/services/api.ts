/**
 * Client-side API service — fetch wrapper with JWT injection (ADR-0003).
 *
 * The token is stored in localStorage and attached to every request as a
 * Bearer header. The SERVER re-verifies the JWT signature on every call —
 * client-decoded claims are for UI rendering only, never for authorization.
 */
import type { JwtClaims } from '../types';

const TOKEN_KEY = 'stadiumops_jwt';

// ─── Token management ──────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

export function setAuthToken(token: string): void {
	try {
		localStorage.setItem(TOKEN_KEY, token);
	} catch {
		// localStorage may be unavailable in restricted contexts — fail silently.
	}
}

export function clearAuthToken(): void {
	try {
		localStorage.removeItem(TOKEN_KEY);
	} catch {
		// No-op.
	}
}

/**
 * Decodes the JWT payload (middle segment) WITHOUT verifying the signature.
 * This is for UI rendering only — the server verifies on every API call.
 * Returns null if the token is malformed.
 */
export function decodeClaims(token: string): JwtClaims | null {
	try {
		const [, payloadB64] = token.split('.');
		if (!payloadB64) return null;
		const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
		return JSON.parse(json) as JwtClaims;
	} catch {
		return null;
	}
}

// ─── Fetch wrapper ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
	readonly status: number;
	constructor(
		message: string,
		status: number,
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

/**
 * Authenticated fetch wrapper. Injects the Bearer token and Content-Type.
 * Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const token = getAuthToken();
	const headers = new Headers(options.headers);

	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	// Only set Content-Type for requests with a body (GET/HEAD don't need it).
	if (options.body && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const response = await fetch(path, { ...options, headers });

	if (!response.ok) {
		let message = `Request failed (${response.status})`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body?.error) message = body.error;
		} catch {
			// Response body wasn't JSON — use the status message.
		}
		throw new ApiError(message, response.status);
	}

	// Handle 204 No Content.
	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

// ─── Auth API methods ──────────────────────────────────────────────────────────

export interface RequestOtpResponse {
	status: string;
	devCode?: string; // Present only in dev mode (no Twilio creds)
}

export interface VerifyOtpResponse {
	token: string;
	claims: JwtClaims;
}

/** Requests an OTP code to be sent to the phone number. */
export async function requestOtp(phoneNumber: string): Promise<RequestOtpResponse> {
	return apiFetch<RequestOtpResponse>('/api/auth/request-otp', {
		method: 'POST',
		body: JSON.stringify({ phoneNumber }),
	});
}

/** Verifies the OTP code and returns a signed JWT + claims. */
export async function verifyOtp(phoneNumber: string, code: string): Promise<VerifyOtpResponse> {
	return apiFetch<VerifyOtpResponse>('/api/auth/verify-otp', {
		method: 'POST',
		body: JSON.stringify({ phoneNumber, code }),
	});
}

// ─── Mutation API methods (M3) ────────────────────────────────────────────────

import type { IncidentReport, IncidentStatus, DispatchDirective, DispatchStatus } from '../types';

interface MutationResponse {
	incident?: IncidentReport;
	dispatch?: DispatchDirective;
}

/** Transitions an incident to the next status (admin/superadmin only). */
export async function transitionIncident(
	incidentId: string,
	nextStatus: IncidentStatus,
): Promise<IncidentReport> {
	const result = await apiFetch<MutationResponse>('/api/mutations', {
		method: 'POST',
		body: JSON.stringify({ action: 'transition_incident', incidentId, nextStatus }),
	});
	if (!result.incident) throw new ApiError('Server did not return the updated incident.', 500);
	return result.incident;
}

/** Creates a dispatch directive targeting a specific staff member (admin/superadmin only). */
export async function createDispatch(
	incidentId: string,
	targetStaffPhone: string,
	directiveText: string,
): Promise<DispatchDirective> {
	const result = await apiFetch<MutationResponse>('/api/mutations', {
		method: 'POST',
		body: JSON.stringify({ action: 'create_dispatch', incidentId, targetStaffPhone, directiveText }),
	});
	if (!result.dispatch) throw new ApiError('Server did not return the created dispatch.', 500);
	return result.dispatch;
}

/** Updates a dispatch status (admin/superadmin, or the target staff member). */
export async function updateDispatchStatus(
	dispatchId: string,
	nextStatus: DispatchStatus,
): Promise<DispatchDirective> {
	const result = await apiFetch<MutationResponse>('/api/mutations', {
		method: 'POST',
		body: JSON.stringify({ action: 'update_dispatch', dispatchId, nextStatus }),
	});
	if (!result.dispatch) throw new ApiError('Server did not return the updated dispatch.', 500);
	return result.dispatch;
}
