/**
 * GuideTour — interactive walkthrough using driver.js.
 *
 * Triggers:
 *   - Automatically on first login (localStorage flag)
 *   - Manually via the Help button in the header
 *
 * Steps walk the user through the Control Room layout: map, incidents,
 * dispatches, tabs, and key actions.
 */
import { useEffect, useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'stadiumops_tour_completed';

/** Returns true if the user has completed the tour before. */
export function hasCompletedTour(): boolean {
	try {
		return localStorage.getItem(TOUR_KEY) === 'true';
	} catch {
		return false;
	}
}

/** Marks the tour as completed so it doesn't auto-trigger again. */
function markTourCompleted(): void {
	try {
		localStorage.setItem(TOUR_KEY, 'true');
	} catch {
		// localStorage unavailable — non-fatal.
	}
}

/** Reset the tour flag so it auto-triggers on next mount. */
export function resetTour(): void {
	try {
		localStorage.removeItem(TOUR_KEY);
	} catch {
		// No-op.
	}
}

const TOUR_STEPS: DriveStep[] = [
	{
		popover: {
			title: 'Welcome to Stadium Ops',
			description:
				'This is the Control Room — your command surface for real-time stadium incident management. ' +
				'Let\'s take a 60-second tour of the key areas.',
		},
	},
	{
		element: '[data-tour="tab-nav"]',
		popover: {
			title: 'Navigation Tabs',
			description:
				'Switch between <b>Operations</b> (live map + incidents), <b>Team</b> (staff management), ' +
				'<b>Roles</b> (permission definitions), <b>Tenants</b> (stadium contexts), and ' +
				'<b>Policies</b> (Rego rules). Tabs you can\'t see are gated by your permissions.',
			side: 'bottom',
			align: 'start',
		},
	},
	{
		element: '[data-tour="map-canvas"]',
		popover: {
			title: 'Live Stadium Map',
			description:
				'The canvas shows the stadium layout on a 0–1000 coordinate grid. ' +
				'<b>Colored dots</b> are field staff with their real-time GPS positions. ' +
				'<b>Tier-colored markers</b> are active incidents. Click any marker to select it. ' +
				'<br><br>The map auto-refreshes every 2 seconds via diff-polling (ADR-0004). ' +
				'Drag to pan; scroll/pinch to zoom.',
			side: 'right',
		},
	},
	{
		element: '[data-tour="incident-queue"]',
		popover: {
			title: 'Incident Queue',
			description:
				'Active incidents (non-resolved) are listed here in priority order. ' +
				'Tier 1 = life safety (red), Tier 5 = advisory (gray). ' +
				'Click an incident to load it into the inspector on the right.',
			side: 'left',
		},
	},
	{
		element: '[data-tour="incident-inspector"]',
		popover: {
			title: 'Incident Inspector',
			description:
				'Detailed view of the selected incident: raw report text, AI-extracted metadata ' +
				'(category, severity, sector, coordinates), and status timeline. ' +
				'<br><br><b>Admins</b> see Acknowledge / On-Scene / Resolve buttons here to ' +
				transition the incident through its lifecycle.',
			side: 'left',
		},
	},
	{
		element: '[data-tour="tenant-switcher"]',
		popover: {
			title: 'Tenant Switcher',
			description:
				'<b>Superadmins</b> can switch between stadium contexts here. ' +
				'All operational data (incidents, staff, dispatches) is isolated by tenant — ' +
				'switching re-binds the entire dashboard to the new tenant.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		element: '[data-tour="compliance-log"]',
		popover: {
			title: 'Compliance Log',
			description:
				'Every state mutation (incident create/transition, dispatch, role change) ' +
				'is written to a <b>SHA-256 chained audit ledger</b> (ADR-0005). ' +
				'Click this button to open the Audit Timeline Inspector and verify chain integrity.',
			side: 'bottom',
			align: 'end',
		},
	},
	{
		element: '[data-tour="help-button"]',
		popover: {
			title: 'Need help?',
			description:
				'Click this button anytime to replay this tour, or read the full User Guide ' +
				'for detailed workflows (how to dispatch personnel, incident lifecycle, etc.). ' +
				'<br><br>You\'re ready to go. Welcome aboard.',
			side: 'bottom',
			align: 'end',
		},
	},
];

/** Hook: triggers the tour automatically on first login. */
export function useAutoTour(shouldShow: boolean): void {
	useEffect(() => {
		if (!shouldShow) return;
		if (hasCompletedTour()) return;

		// Delay to let the dashboard render.
		const timer = setTimeout(() => {
			startTour();
		}, 800);

		return () => clearTimeout(timer);
	}, [shouldShow]);
}

/** Start the tour programmatically. */
export function startTour(): void {
	const driverInstance = driver({
		steps: TOUR_STEPS,
		progressText: '{{current}} of {{total}}',
		nextBtnText: 'Next →',
		prevBtnText: '← Back',
		doneBtnText: 'Done',
		allowClose: true,
		onPopoverRender: (popover, _opts) => {
			// Style the popover to match the dark theme.
			popover.wrapper?.classList.add('!bg-slate-900', '!border-slate-700', '!text-slate-100');
			popover.title?.classList.add('!text-slate-100', '!font-mono', '!text-sm', '!uppercase', '!tracking-widest');
			popover.description?.classList.add('!text-slate-400', '!text-xs');
			popover.footer?.classList.add('!bg-slate-900');
		},
		onDestruction: () => {
			markTourCompleted();
		},
	});

	driverInstance.drive();
}
