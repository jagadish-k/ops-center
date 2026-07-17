/**
 * GuideTour — role-aware interactive walkthrough using driver.js.
 *
 * The tour is built dynamically based on the user's permissions, so each
 * role sees only the steps relevant to them:
 *
 *   - Staff:     Field Client tour (dispatches, voice ingest, manual triage)
 *   - Manager:   Operations + Team overview
 *   - Admin:     Operations + Team + Compliance log
 *   - Superadmin: Operations + Team + Roles + Tenants + Policies + Compliance
 *
 * For the Operations tab, specific elements are highlighted (map, queue,
 * inspector). For other tabs, centered popovers describe what the tab does
 * without needing the element to be in the DOM — the user can click the tab
 * themselves to explore.
 *
 * Triggers:
 *   - Automatically on first login (localStorage flag per role)
 *   - Manually via the Help button in the header
 */
import { useEffect } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'stadiumops_tour_v2';

/** Returns true if the user has completed the tour. */
export function hasCompletedTour(): boolean {
	try {
		return localStorage.getItem(TOUR_KEY) === 'true';
	} catch {
		return false;
	}
}

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

// ─── Permission profile passed to the tour builder ───────────────────────────

export interface TourPermissions {
	isSuperadmin: boolean;
	canStaffManage: boolean;
	canTenantManage: boolean;
	canTenantSwitch: boolean;
	canAuditView: boolean;
	canControlRoom: boolean;
	canFieldClient: boolean;
}

// ─── Step builders (filtered by permission) ──────────────────────────────────

function operationsSteps(): DriveStep[] {
	return [
		{
			element: '[data-tour="map-canvas"]',
			popover: {
				title: 'Live Stadium Map',
				description:
					'The canvas shows the stadium on a 0–1000 grid. ' +
					'<b>Green dots</b> = available staff. <b>Amber dots</b> = dispatched staff. ' +
					'<b>Colored markers</b> = active incidents (red = Tier 1 life safety). ' +
					'<br><br>Click any marker to select it. Drag to pan, scroll to zoom. ' +
					'Auto-refreshes every 2 seconds.',
				side: 'right',
			},
		},
		{
			element: '[data-tour="incident-queue"]',
			popover: {
				title: 'Incident Queue',
				description:
					'Active incidents listed by priority (Tier 1 at top). ' +
					'Click an incident to load its details into the inspector below.',
				side: 'left',
			},
		},
		{
			element: '[data-tour="incident-inspector"]',
			popover: {
				title: 'Incident Inspector',
				description:
					'Selected incident details: raw report, AI-extracted metadata, status timeline. ' +
					'<b>Admins</b> see Acknowledge / On-Scene / Resolve buttons here.',
				side: 'left',
			},
		},
	];
}

function teamTabStep(): DriveStep {
	return {
		popover: {
			title: '📋 Team Tab',
			description:
				'The <b>Team</b> tab (next to Operations in the nav bar) is where you:' +
				'<ul class="list-disc pl-4 mt-1">' +
				'<li>Create new staff members (phone, name, specialty, zone)</li>' +
				'<li>Assign roles (staff, manager, admin)</li>' +
				'<li>Grant individual permissions (e.g., give a staff member audit:view)</li>' +
				'<li>Activate / deactivate accounts</li>' +
				'</ul>' +
				'Click the <b>Team</b> tab above to explore it now.',
		},
	};
}

function rolesTabStep(): DriveStep {
	return {
		popover: {
			title: '🔐 Roles Tab',
			description:
				'The <b>Roles</b> tab (superadmin only) is where you:' +
				'<ul class="list-disc pl-4 mt-1">' +
				'<li>View the 4 system roles and their permission sets</li>' +
				'<li>Edit which permissions each role has</li>' +
				'<li>Create custom roles (e.g., "auditor" with read-only access)</li>' +
				'<li>Bulk-revoke per-user grants after role changes</li>' +
				'</ul>' +
				'Changes to a role bump <code>perms_version</code> for all affected users — ' +
				'they\'ll get a silent refresh on their next request.',
		},
	};
}

function tenantsTabStep(): DriveStep {
	return {
		popover: {
			title: '🏟️ Tenants Tab',
			description:
				'The <b>Tenants</b> tab (superadmin only) lists all stadium contexts. ' +
				'Each tenant is an isolated operational boundary — incidents, staff, and ' +
				'dispatches never cross tenant lines.' +
				'<br><br>Use the <b>Tenant Switcher</b> in the header to switch between stadiums. ' +
				'Creating a new tenant provisions a fresh isolation boundary.',
		},
	};
}

function policiesTabStep(): DriveStep {
	return {
		popover: {
			title: '📜 Policies Tab',
			description:
				'The <b>Policies</b> tab (superadmin only) is the Rego policy authoring surface:' +
				'<ul class="list-disc pl-4 mt-1">' +
				'<li>Write ABAC policies in Rego with syntax highlighting</li>' +
				'<li>Test policies against sample input JSON (server-side OPA eval)</li>' +
				'<li>Create custom rules for your stadium\'s specific needs</li>' +
				'</ul>' +
				'The system policy (<code>stadium/authz</code>) encodes the 5 ABAC rules ' +
				'(tier-gating, zone-gating, self-or-permitted).',
		},
	};
}

function complianceLogStep(): DriveStep {
	return {
		element: '[data-tour="compliance-log"]',
		popover: {
			title: '🔒 Compliance Log',
			description:
				'Every state mutation is written to a <b>SHA-256 chained audit ledger</b>. ' +
				'The chain is tamper-evident — any modification to a historical entry breaks the hash sequence. ' +
				'<br><br>Click this button to view the Audit Timeline Inspector and verify chain integrity.',
			side: 'bottom',
			align: 'end',
		},
	};
}

function tenantSwitcherStep(): DriveStep {
	return {
		element: '[data-tour="tenant-switcher"]',
		popover: {
			title: '🔄 Tenant Switcher',
			description:
				'Switch between stadium contexts here. All operational data is immediately ' +
				'scoped to the new tenant — a fresh JWT is minted with the new tenant_id.',
			side: 'bottom',
			align: 'end',
		},
	};
}

function helpButtonStep(): DriveStep {
	return {
		element: '[data-tour="help-button"]',
		popover: {
			title: 'Need help?',
			description:
				'Click <b>? Help</b> anytime to replay this tour. ' +
				'For detailed workflows (how to dispatch, incident lifecycle, etc.), ' +
				'read the <b>User Guide</b> at <code>docs/USER-GUIDE.md</code>.',
			side: 'bottom',
			align: 'end',
		},
	};
}

// ─── Build role-specific step list ───────────────────────────────────────────

function buildSteps(perms: TourPermissions): DriveStep[] {
	const steps: DriveStep[] = [];

	// Welcome — always shown.
	steps.push({
		popover: {
			title: `Welcome to Stadium Ops${perms.isSuperadmin ? ' (Superadmin)' : ''}`,
			description:
				'This is the Control Room — your command surface for real-time stadium ' +
				'incident management. Let\'s walk through what you can do here.',
		},
	});

	// Tab overview — mention all accessible tabs.
	const tabs: string[] = ['<b>Operations</b>'];
	if (perms.canStaffManage) tabs.push('<b>Team</b>');
	if (perms.canTenantManage) tabs.push('<b>Roles</b>');
	if (perms.canTenantSwitch) tabs.push('<b>Tenants</b>');
	if (perms.canTenantManage) tabs.push('<b>Policies</b>');

	steps.push({
		element: '[data-tour="tab-nav"]',
		popover: {
			title: 'Your Tabs',
			description:
				`You have access to: ${tabs.join(', ')}. ` +
				'Tabs you can\'t see are gated by your permissions. ' +
				'Let\'s explore each one.',
			side: 'bottom',
		},
	});

	// Operations tab — detailed element highlights (always visible for control room users).
	steps.push(...operationsSteps());

	// Team tab overview (centered popover — user clicks the tab themselves).
	if (perms.canStaffManage) {
		steps.push(teamTabStep());
	}

	// Roles tab overview (superadmin only).
	if (perms.canTenantManage) {
		steps.push(rolesTabStep());
	}

	// Tenants tab overview (superadmin only).
	if (perms.canTenantSwitch) {
		steps.push(tenantsTabStep());
	}

	// Policies tab overview (superadmin only).
	if (perms.canTenantManage) {
		steps.push(policiesTabStep());
	}

	// Tenant switcher (superadmin only).
	if (perms.canTenantSwitch) {
		steps.push(tenantSwitcherStep());
	}

	// Compliance log (admin + superadmin).
	if (perms.canAuditView) {
		steps.push(complianceLogStep());
	}

	// Closing — help button.
	steps.push(helpButtonStep());

	return steps;
}

// ─── Field Client tour (for staff) ───────────────────────────────────────────

function fieldClientSteps(): DriveStep[] {
	return [
		{
			popover: {
				title: 'Welcome to Field Ops',
				description:
					'This is your mobile command surface for ground operations. ' +
					'You\'ll receive dispatches, report incidents, and track your status here.',
			},
		},
		{
			popover: {
				title: '📻 Dispatches',
				description:
					'When a controller dispatches you to an incident, a full-screen directive appears with:' +
					'<ul class="list-disc pl-4 mt-1">' +
					'<li>The incident details (category, severity, sector)</li>' +
					'<li>Specific instructions from the controller</li>' +
					'<li><b>Acknowledge</b> → confirms you received it</li>' +
					'<li><b>On Scene</b> → confirms you arrived at the location</li>' +
					'<li><b>Resolve</b> → closes the dispatch; you return to Available</li>' +
					'</ul>',
			},
		},
		{
			popover: {
				title: '🎤 Voice Report',
				description:
					'Press the push-to-talk button to report an incident hands-free:' +
					'<br><br>' +
					'1. Your voice is transcribed by Whisper AI<br>' +
					'2. Gemini extracts category, severity, tier, and sector<br>' +
					'3. An incident is created automatically in the Control Room<br>' +
					'<br>No typing needed — just speak naturally.',
			},
		},
		{
			popover: {
				title: '📝 Manual Triage',
				description:
					'If voice reporting isn\'t available, use the 3-tap manual triage form:' +
					'<br><br>' +
					'1. Pick a category (Security, Medical, Crowd, Facilities, Advisory)<br>' +
					'2. Pick a severity (Critical → Low)<br>' +
					'3. Pick a sector (ZONE-A through ZONE-F)<br>' +
					'<br>The tier is inferred from severity (Critical=Tier 1, Low=Tier 4).',
			},
		},
		{
			popover: {
				title: '📍 GPS Tracking',
				description:
					'Your position is automatically sent to the Control Room every time you move ' +
					'more than 3 meters. The controller sees you as a colored dot on their map.' +
					'<br><br>If you lose connection, reports are queued offline and sent when ' +
					'you reconnect — no data is lost.',
			},
		},
		{
			popover: {
				title: 'Ready to go',
				description:
					'You\'re all set. Stay alert, respond to dispatches promptly, and report ' +
					'anything unusual. Your controller is watching the map.',
			},
		},
	];
}

/** Start the Field Client tour (for staff users). */
export function startFieldClientTour(): void {
	const steps = fieldClientSteps();

	const driverInstance = driver({
		steps,
		progressText: '{{current}} of {{total}}',
		nextBtnText: 'Next →',
		prevBtnText: '← Back',
		doneBtnText: 'Done',
		allowClose: true,
		onPopoverRender: (popover, _opts) => {
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

/** Hook: auto-triggers the Field Client tour on first login for staff. */
export function useAutoFieldClientTour(shouldShow: boolean): void {
	useEffect(() => {
		if (!shouldShow) return;
		if (hasCompletedTour()) return;

		const timer = setTimeout(() => {
			startFieldClientTour();
		}, 800);

		return () => clearTimeout(timer);
	}, [shouldShow]);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Start the tour for a specific permission profile. */
export function startTour(perms: TourPermissions): void {
	const steps = buildSteps(perms);

	const driverInstance = driver({
		steps,
		progressText: '{{current}} of {{total}}',
		nextBtnText: 'Next →',
		prevBtnText: '← Back',
		doneBtnText: 'Done',
		allowClose: true,
		onPopoverRender: (popover, _opts) => {
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

/** Hook: auto-triggers the tour on first login, role-aware. */
export function useAutoTour(perms: TourPermissions | null): void {
	useEffect(() => {
		if (!perms) return;
		if (hasCompletedTour()) return;

		const timer = setTimeout(() => {
			startTour(perms);
		}, 800);

		return () => clearTimeout(timer);
	}, [perms]);
}
