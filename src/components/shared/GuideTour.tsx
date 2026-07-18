/**
 * GuideTour — per-tab contextual walkthrough using driver.js.
 *
 * Design:
 *   - NO auto-trigger. Instead, a dismissible "Take a quick tour?" banner
 *     appears at the top of each tab on first visit.
 *   - User clicks "Start Tour" → tour begins for the current tab.
 *   - User clicks "Dismiss" → tab marked as seen, banner never shows again.
 *   - Clicking "? Help" in the header replays the current tab's tour.
 *   - Tours never switch tabs — each targets only elements in its own DOM.
 */
import { useEffect, useState, useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TAB_TOUR_KEY = 'stadiumops_tab_tour_v3';

// ─── localStorage helpers ────────────────────────────────────────────────────

function readTabTourState(): Record<string, boolean> {
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
		// No-op.
	}
}

export function resetAllTours(): void {
	try {
		localStorage.removeItem(TAB_TOUR_KEY);
	} catch {
		// No-op.
	}
}

// ─── Per-tab step definitions ────────────────────────────────────────────────

const TAB_STEPS: Record<string, () => DriveStep[]> = {
	operations: () => [
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
	],
	team: () => [
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
	],
	roles: () => [
		{
			element: '[data-tour="roles-grid"]',
			popover: {
				title: 'Role Cards',
				description:
					'Each card shows a role + its permissions. Click <b>Edit Permissions</b> ' +
					'to toggle the matrix.',
				side: 'top',
			},
		},
	],
	tenants: () => [
		{
			popover: {
				title: 'Tenants',
				description:
					'Each tenant is an isolated stadium context. Use the Tenant Switcher ' +
					'in the header to switch between them.',
			},
		},
	],
	policies: () => [
		{
			popover: {
				title: 'Policies',
				description:
					'Write and test Rego policies here. The CodeMirror editor has syntax ' +
					'highlighting. Use the test runner to evaluate against sample input.',
			},
		},
	],
};

// ─── Tour runner ─────────────────────────────────────────────────────────────

function runDriver(steps: DriveStep[], tabId: string): void {
	// Filter steps whose target element doesn't exist in the DOM.
	const visibleSteps = steps.filter((step) => {
		if (typeof step.element === 'string') {
			return !!document.querySelector(step.element);
		}
		return true;
	});

	if (visibleSteps.length === 0) {
		markTabToured(tabId);
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
			popover.wrapper?.classList.add('bg-slate-100! dark:bg-slate-900', 'border-slate-300! dark:border-slate-700', 'text-slate-800! dark:text-slate-100');
			popover.title?.classList.add('text-slate-800! dark:text-slate-100', 'font-mono!', 'text-sm!', 'uppercase!', 'tracking-widest!');
			popover.description?.classList.add('text-slate-500! dark:text-slate-400', 'text-xs!');
			popover.footer?.classList.add('bg-slate-100! dark:bg-slate-900');
		},
	});

	// Mark toured immediately on start — prevents re-trigger even if the
	// user dismisses instantly. The tour has already been "seen".
	markTabToured(tabId);

	driverInstance.drive();
}

/** Start the tour for a specific tab (manual trigger via ? Help). */
export function startTabTour(tabId: string): void {
	const builder = TAB_STEPS[tabId];
	if (!builder) return;
	runDriver(builder(), tabId);
}

/**
 * Hook: manages the "Take a quick tour?" banner state for a tab.
 *
 * Returns:
 *   - showBanner: whether to show the prompt banner
 *   - startTour: callback to start the tour + dismiss banner
 *   - dismissBanner: callback to dismiss without touring
 */
export function useTabTourBanner(tabId: string): {
	showBanner: boolean;
	startTour: () => void;
	dismissBanner: () => void;
} {
	// Derive banner visibility from tabId — avoids setState-in-effect.
	const showBanner = !hasTabBeenToured(tabId);

	const startTour = useCallback(() => {
		startTabTour(tabId);
	}, [tabId]);

	const dismissBanner = useCallback(() => {

		markTabToured(tabId);
	}, [tabId]);

	return { showBanner, startTour, dismissBanner };
}

// ─── Field Client tour ───────────────────────────────────────────────────────

const FIELD_TOUR_KEY = 'stadiumops_field_tour_v3';

export function useAutoFieldClientTour(shouldShow: boolean): void {
	// Lazy initial state reads localStorage once on mount — no effect needed.
	const [started, setStarted] = useState(() => {
		try {
			return localStorage.getItem(FIELD_TOUR_KEY) === 'true';
		} catch {
			return false;
		}
	});

	useEffect(() => {
		if (!shouldShow || started) return;

		const timer = setTimeout(() => {
			const steps: DriveStep[] = [
				{
					popover: {
						title: 'Welcome to Field Ops',
						description:
							'Receive dispatches, report incidents via voice, and track ' +
							'your GPS position. Quick 4-step tour.',
					},
				},
				{
					popover: {
						title: 'Dispatches',
						description:
							'<b>Acknowledge</b> → confirm receipt. <b>On Scene</b> → arrived. ' +
							'<b>Resolve</b> → done.',
					},
				},
				{
					popover: {
						title: 'Voice Report',
						description:
							'Push-to-talk → Whisper transcribes → Gemini extracts metadata ' +
							'→ incident created automatically.',
					},
				},
				{
					popover: {
						title: 'GPS + Offline',
						description:
							'Position auto-updates >3m. Offline reports queue in IndexedDB.',
					},
				},
			];

			const driverInstance = driver({
				steps,
				progressText: '{{current}} of {{total}}',
				nextBtnText: 'Next →',
				prevBtnText: '← Back',
				doneBtnText: 'Done',
				allowClose: true,
				onPopoverRender: (popover) => {
					popover.wrapper?.classList.add('bg-slate-100! dark:bg-slate-900', 'border-slate-300! dark:border-slate-700', 'text-slate-800! dark:text-slate-100');
					popover.title?.classList.add('text-slate-800! dark:text-slate-100', 'font-mono!', 'text-sm!', 'uppercase!', 'tracking-widest!');
					popover.description?.classList.add('text-slate-500! dark:text-slate-400', 'text-xs!');
				},
			});

			try {
				localStorage.setItem(FIELD_TOUR_KEY, 'true');
			} catch {
				// No-op.
			}

			driverInstance.drive();
			setStarted(true);
		}, 800);

		return () => clearTimeout(timer);
	}, [shouldShow, started]);
}
