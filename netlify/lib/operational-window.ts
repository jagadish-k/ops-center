/**
 * Operational time-window enforcement ("the switch").
 *
 * Checks the `config` table to determine whether the current time falls within
 * the active operational window. Used by mutation + triage endpoints to reject
 * writes outside match hours (ARCHITECTURE.md §5, PRD §7.3).
 *
 * Superadmins bypass the check — they can operate at any time.
 */
import { query } from './db';
import type { JwtClaims } from '../../src/types';

interface SwitchRow {
	window_start: Date | null;
	window_end: Date | null;
	operational: boolean;
}

export type WindowCheckResult =
	| { ok: true }
	| { ok: false; reason: string };

/**
 * Returns ok if the caller may write, or a reason if the window is inactive.
 * Superadmins always pass.
 */
export async function checkOperationalWindow(claims: JwtClaims): Promise<WindowCheckResult> {
	// Superadmins bypass the operational window.
	if (claims.role === 'superadmin') {
		return { ok: true };
	}

	const rows = await query<SwitchRow>(
		`SELECT window_start, window_end, operational FROM config WHERE id = 'switch'`,
	);

	if (rows.length === 0) {
		// No switch configured — allow writes (dev/initial setup).
		return { ok: true };
	}

	const sw = rows[0];

	// Explicit kill switch.
	if (sw.operational === false) {
		return { ok: false, reason: 'Operations are currently suspended.' };
	}

	// Time-window check.
	const now = new Date();
	if (sw.window_start && now < sw.window_start) {
		return { ok: false, reason: 'Operational window has not opened yet.' };
	}
	if (sw.window_end && now > sw.window_end) {
		return { ok: false, reason: 'Operational window has closed.' };
	}

	return { ok: true };
}
