/**
 * Operational time-window enforcement ("the switch").
 *
 * Checks the `config` table to determine whether the current time falls within
 * the active operational window. Used by mutation + triage endpoints to reject
 * writes outside match hours (ARCHITECTURE.md §5, PRD §7.3).
 *
 * Superadmins bypass the check — they can operate at any time.
 */
import { db } from './db.ts';
import { configTable } from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import type { JwtClaims } from '../../src/types';

export type WindowCheckResult =
	| { ok: true }
	| { ok: false; reason: string };

/**
 * Returns ok if the caller may write, or a reason if the window is inactive.
 * Superadmins always pass (ADR-0010).
 */
export async function checkOperationalWindow(claims: JwtClaims): Promise<WindowCheckResult> {
	if (claims.global_role === 'superadmin') {
		return { ok: true };
	}

	const rows = await db
		.select({
			windowStart: configTable.windowStart,
			windowEnd: configTable.windowEnd,
			operational: configTable.operational,
		})
		.from(configTable)
		.where(eq(configTable.id, 'switch'))
		.execute();

	if (rows.length === 0) {
		return { ok: true }; // No switch configured — allow (dev/initial setup).
	}

	const sw = rows[0]!;

	if (sw.operational === false) {
		return { ok: false, reason: 'Operations are currently suspended.' };
	}

	const now = new Date();
	if (sw.windowStart && now < sw.windowStart) {
		return { ok: false, reason: 'Operational window has not opened yet.' };
	}
	if (sw.windowEnd && now > sw.windowEnd) {
		return { ok: false, reason: 'Operational window has closed.' };
	}

	return { ok: true };
}
