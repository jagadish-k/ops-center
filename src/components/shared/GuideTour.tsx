/**
 * GuideTour — per-tab contextual walkthrough using driver.js.
 *
 * Design principles:
 *   - Each tab has its OWN mini-tour (2-5 steps) targeting elements that
 *     exist in that tab's DOM.
 *   - Tours auto-trigger ONLY on first visit to a tab (localStorage per tab).
 *   - Dismissing a tour marks it as seen — it won't auto-trigger again.
 *   - Clicking "? Help" replays the CURRENT tab's tour.
 *   - Tours never switch tabs or jump the user around.
 *
 * For the Field Client (staff surface), a separate 6-step tour covers
 * dispatches, voice reporting, and GPS tracking.
 */
import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TAB_TOUR_KEY = 'stadiumops_tab_tour';

// ─── localStorage helpers ────────────────────────────────────────────────────

interface TabTourState {
	[key: string]: boolean;
}

function readTabTourState(): TabTourState {
	try {
		return JSON.parse(localStorage.getItem(TAB_TOUR_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function hasTabBeenToured(tabId: string): boolean {
	return readTabTourState()[tabId] === true;
}

function markTabToured(tabId: string): void {
	try {
		const state = readTabTourState();
		state[tabId] = true;
		localStorage.setItem(TAB_TOUR_KEY, JSON.stringify(state));
	} catch {
		// localStorage unavailable — non-fatal.
	}
}

/** Reset ALL tab tour flags so every tab auto-triggers again. */
export function resetAllTours(): void {
	try {
		localStorage.removeItem(TAB_TOUR_KEY);
	} catch {
		// No-op.
	}
}

// ─── Permission profile ──────────────────────────────────────────────────────

export interface TourPermissions {
	isSuperadmin: boolean;
}

// ─── Per-tab step definitions ────────────────────────────────────────────────
// Each tab's steps only target elements inside that tab's rendered DOM.
// If an element doesn't exist (e.g., permission-gated), the step is skipped.

function operationsSteps(): DriveStep[] {
	return [
		{
			element: '[data-tour="map-canvas"]',
			popover: {
				title: 'Live Stadium Map',
				description:
					'The canvas shows the stadium on a 0–1000 grid. ' +
					'<b>Green dots</b> = available staff. <b>Amber</b> = dispatched. ' +
					'<b>Colored markers</b> = active incidents (red = Tier 1). ' +
					'Click any marker to select it. Drag to pan, scroll to zoom.',
				side: 'right',
			},
		},
		{
			element: '[data-tour="incident-queue"]',
			popover: {
				title: 'Incident Queue',
				description:
					'Active incidents listed by priority. Click one to load its details ' +
					'into the inspector below.',
				side: 'left',
			},
		},
		{
			element: '[data-tour="incident-inspector"]',
			popover: {
				title: 'Incident Inspector',
				description:
					'Selected incident details + admin action buttons (Acknowledge / ' +
					'On Scene / Resolve).',
				side: 'left',
			},
		},
	];
}

function teamSteps(): DriveStep[] {
	return [
		{
			popover: {
				title: 'Team Tab',
				description:
					'Manage your staff roster here. Each row is a team member with ' +
					'their roles and status.',
			},
		},
		{
			element: '[data-tour="team-table"]',
			popover: {
				title: 'Staff List',
				description:
					'Click <b>Edit</b> to change name, status, or toggle roles. ' +
					'Click <b>Perms</b> for per-user permission grants.',
				side: 'top',
			},
		},
		{
			element: '[data-tour="team-add"]',
			popover: {
				title: 'Add Staff',
				description:
					'Create a new staff member with phone, name, specialty, zone, and roles.',
				side: 'bottom',
				align: 'end',
			},
		},
	];
}

function rolesSteps(): DriveStep[] {
	return [
		{
			popover: {
				title: 'Roles Tab',
				description:
					'Define what each role can do. System roles (admin, manager, staff) ' +
					'are preseeded. You can create custom roles too.',
			},
		},
		{
			element: '[data-tour="roles-grid"]',
			popover: {
				title: 'Role Cards',
				description:
					'Each card shows a role + its permissions. Click <b>Edit Permissions</b> ' +
					'to toggle the matrix. Changes bump perms_version for affected users.',
				side: 'top',
			},
		},
	];
}

function tenantsSteps(): DriveStep[] {
	return [
		{
			popover: {
				title: 'Tenants Tab',
				description:
					'Each tenant is an isolated stadium context. Use the Tenant Switcher ' +
					'in the header to switch between them.',
			},
		},
	];
}

function policiesSteps(): DriveStep[] {
	return [
		{
			popover: {
				title: 'Policies Tab',
				description:
					'Write and test Rego policies here. The CodeMirror editor has syntax ' +
					'highlighting. Use the test runner to evaluate against sample input.',
			},
		},
	];
}

// ─── Step registry ───────────────────────────────────────────────────────────

const TAB_STEPS: Record<string, () => DriveStep[]> = {
	operations: operationsSteps,
	team: teamSteps,
	roles: rolesSteps,
	tenants: tenantsSteps,
	policies: policiesSteps,
};

// ─── Tour runner ─────────────────────────────────────────────────────────────

function runDriver(steps: DriveStep[], onComplete: () => void): void {
	if (steps.length === 0) {
		onComplete();
		return;
	}

	// Filter out steps whose target element doesn't exist in the DOM.
	const visibleSteps = steps.filter((step) => {
		if (!step.element) return true; // centered popover — always show
		const el = document.querySelector(step.element);
		return !!el;
	});

	if (visibleSteps.length === 0) {
		onComplete();
		return;
	}

	const driverInstance = driver({
		steps: visibleSteps,
		progressText: '{{current}} of {{total}}',
		nextBtnText: 'Next →',
		prevBtnText: '← Back',
		doneBtnText: 'Done',
		allowClose: true,
		onPopoverRender: (popover) => {
			popover.wrapper?.classList.add('!bg-slate-900', '!border-slate-700', '!text-slate-100');
			popover.title?.classList.add('!text-slate-100', '!font-mono', '!text-sm', '!uppercase', '!tracking-widest');
			popover.description?.classList.add('!text-slate-400', '!text-xs');
			popover.footer?.classList.add('!bg-slate-900');
		},
		onDestruction: () => {
			onComplete();
		},
	});

	driverInstance.drive();
}

/** Start the tour for a specific tab (manual trigger via ? Help). */
export function startTabTour(tabId: string): void {
	const builder = TAB_STEPS[tabId];
	if (!builder) return;
	runDriver(builder(), () => {
		markTabToured(tabId);
	});
}

/**
 * Hook: auto-triggers a tab's tour on first visit.
 *
 * Fires ONCE when the user switches to a tab they haven't toured yet.
 * Uses a ref to prevent re-triggering within the same render cycle.
 */
export function useTabTourAutoTrigger(tabId: string): void {
	const triggeredRef = useRef<string | null>(null);

	useEffect(() => {
		// Don't re-trigger if we already handled this tab in this session.
		if (triggeredRef.current === tabId) return;

		// Don't trigger if the tab has been toured before.
		if (hasTabBeenToured(tabId)) {
			triggeredRef.current = tabId;
			return;
		}

		// Delay to let the tab's DOM render.
		const timer = setTimeout(() => {
			const builder = TAB_STEPS[tabId];
			if (!builder) {
				markTabToured(tabId);
				return;
			}
			runDriver(builder(), () => {
				markTabToured(tabId);
			});
		}, 600);

		triggeredRef.current = tabId;
		return () => clearTimeout(timer);
	}, [tabId]);
}

// ─── Field Client tour (staff surface) ───────────────────────────────────────

const FIELD_TOUR_KEY = 'stadiumops_field_tour_v2';

export function hasCompletedFieldTour(): boolean {
	try {
		return localStorage.getItem(FIELD_TOUR_KEY) === 'true';
	} catch {
		return false;
	}
}

function markFieldTourCompleted(): void {
	try {
		localStorage.setItem(FIELD_TOUR_KEY, 'true');
	} catch {
		// No-op.
	}
}

function fieldClientSteps(): DriveStep[] {
	return [
		{
			popover: {
				title: 'Welcome to Field Ops',
				description:
					'This is your mobile command surface. You\'ll receive dispatches, ' +
					'report incidents, and track your status here.',
			},
		},
		{
			popover: {
				title: 'Dispatches',
				description:
					'When a controller dispatches you, a directive appears with: ' +
					'<b>Acknowledge</b> (confirm receipt), <b>On Scene</b> (arrived), ' +
					'<b>Resolve</b> (done — you return to Available).',
			},
		},
		{
			popover: {
				title: 'Voice Report',
				description:
					'Press push-to-talk to report hands-free. Your voice is transcribed ' +
					'by Whisper AI, then Gemini extracts category/severity/tier. An ' +
					'incident is created automatically.',
			},
		},
		{
			popover: {
				title: 'Manual Triage',
				description:
					'If voice isn\'t available, use the 3-tap form: pick category, ' +
					'severity, and sector. The tier is inferred from severity.',
			},
		},
		{
			popover: {
				title: 'GPS + Offline',
				description:
					'Your position auto-updates when you move >3m. If you lose ' +
					'connection, reports queue offline and drain on reconnect.',
			},
		},
	];
}

/** Start the Field Client tour manually. */
export function startFieldClientTour(): void {
	runDriver(fieldClientSteps(), () => {
		markFieldTourCompleted();
	});
}

/** Hook: auto-triggers Field Client tour on first login. */
export function useAutoFieldClientTour(shouldShow: boolean): void {
	const triggeredRef = useRef(false);

	useEffect(() => {
		if (!shouldShow || triggeredRef.current) return;
		if (hasCompletedFieldTour()) {
			triggeredRef.current = true;
			return;
		}

		const timer = setTimeout(() => {
			runDriver(fieldClientSteps(), () => {
				markFieldTourCompleted();
			});
		}, 800);

		triggeredRef.current = true;
		return () => clearTimeout(timer);
	}, [shouldShow]);
}
