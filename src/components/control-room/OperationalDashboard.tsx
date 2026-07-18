/**
 * OperationalDashboard — the Control Room command shell.
 *
 * Tabbed layout (M9.5): Operations / Team / Roles / Tenants. The Operations
 * tab is the original 2-column dashboard (map + queue + inspector). The other
 * tabs are admin surfaces gated by permission:
 *   - Team:        staff:manage (admin + superadmin)
 *   - Roles:       tenant:manage (superadmin only)
 *   - Tenants:     tenant:switch (superadmin only)
 *
 * Live operational state is consumed from the ActiveOps context (diff-polling).
 */
import { useMemo, useState, useEffect } from 'react';
import { Button, Tabs } from '@heroui/react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveOps } from '@/context/ActiveOpsContext';
import type { IncidentReport } from '@/types';
import { adminListTenants } from '@/services/api';

import { IncidentQueue } from './IncidentQueue';
import { IncidentInspector } from './IncidentInspector';
import { TenantSwitcher } from './TenantSwitcher';
import { AuditTimelineInspector } from './AuditTimelineInspector';
import { TeamTab } from './TeamTab';
import { RolesTab } from './RolesTab';
import { TenantsTab } from './TenantsTab';
import { PoliciesTab } from './PoliciesTab';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useTabTourBanner, startTabTour } from '@/components/shared/GuideTour';
import { useTheme, THEME_LABELS, THEME_ICONS } from '@/context/theme-constants';
import { OptimizedStadiumMapCanvas } from '@/components/shared/OptimizedStadiumMapCanvas';

type TabId = 'operations' | 'team' | 'roles' | 'tenants' | 'policies';

interface OperationalDashboardProps {
	onTenantChange: (tenantId: string) => Promise<void>;
}

export function OperationalDashboard({ onTenantChange }: OperationalDashboardProps) {
	const { signOut, claims } = useAuth();
	const { can, phone, fullName, isSuperadmin } = usePermissions();
	const { incidents, staff, activeTenantId, connectionHealthy, mapLayout } = useActiveOps();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [auditOpen, setAuditOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>('operations');

	// Fetch real tenant list from the API for the TenantSwitcher.
	const [tenants, setTenants] = useState<{ tenantId: string; orgName: string }[]>([]);
	useEffect(() => {
		if (!can('tenant:switch')) return;
		adminListTenants()
			.then((list) => {
				setTenants(list.map((t) => ({ tenantId: t.id, orgName: t.orgName })));
			})
			.catch(() => {
				// Fall back to mock data if the API call fails.
				setTenants([
					{ tenantId: 'tenant_metlife_ops', orgName: 'MetLife Stadium' },
					{ tenantId: 'tenant_sofi_ops', orgName: 'SoFi Stadium' },
					{ tenantId: 'tenant_hardrock_ops', orgName: 'Hard Rock Stadium' },
				]);
			});
	}, [can]);

	// Per-tab tour banner: shows "Take a quick tour?" on first visit.
	const tour = useTabTourBanner(activeTab);

	// Theme toggle.
	const { theme, cycleTheme } = useTheme();

	// Derive the freshest selected incident from the polled list.
	const selected = useMemo(() => incidents.find((i) => i.id === selectedId) ?? null, [incidents, selectedId]);

	const tenantName = tenants.find((t) => t.tenantId === activeTenantId)?.orgName ?? activeTenantId;

	const handleSelect = (incident: IncidentReport): void => {
		setSelectedId(incident.id);
	};

	return (
		<div className="flex h-screen flex-col bg-slate-950 text-slate-100">
			{/* ── Header bar ─────────────────────────────────────────────── */}
			<header className="flex items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-mono text-sm font-black uppercase tracking-widest text-slate-100">Stadium Ops</h1>
					<span className="font-mono text-[10px] uppercase tracking-widest text-blue-400">// Command Room</span>
				</div>

				<div className="mx-2 hidden h-5 w-px bg-slate-800 sm:block" />

				<div className="hidden items-center gap-2 sm:flex">
					<span className={`h-2 w-2 rounded-full ${connectionHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
					<span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{tenantName}</span>
				</div>

				<div className="ml-auto flex items-center gap-2">
					{can('tenant:switch') && tenants.length > 0 && (
						<div data-tour="tenant-switcher">
							<TenantSwitcher
								tenants={tenants}
								activeTenantId={activeTenantId}
								onTenantChange={(tid) => void onTenantChange(tid)}
							/>
						</div>
					)}
					{can('audit:view') && (
						<Button
							data-tour="compliance-log"
							size="sm"
							variant="secondary"
							onPress={() => setAuditOpen(true)}
							className="font-bold uppercase tracking-widest">
							Compliance Log
						</Button>
					)}
					<Button
						data-tour="help-button"
						size="sm"
						variant="ghost"
						onPress={() => startTabTour(activeTab)}
						className="font-bold uppercase tracking-widest">
						? Help
					</Button>
					<button
						onClick={cycleTheme}
						title={`Theme: ${THEME_LABELS[theme]} (click to cycle)`}
						className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700/60"
					>
						<span className="mr-1">{THEME_ICONS[theme]}</span>
						<span className="font-mono text-[9px] uppercase tracking-widest">{THEME_LABELS[theme]}</span>
					</button>
					<Button
						size="sm"
						variant="secondary"
						onPress={signOut}
						className="font-bold uppercase tracking-widest">
						Sign Out
					</Button>
				</div>
			</header>

			{/* ── Operator identity (footprint) ─────────────────────────── */}
			{(phone || fullName) && (
				<div className="border-b border-slate-800/60 bg-slate-950 px-4 py-1">
					<p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">
						Operator {fullName ?? phone} · {isSuperadmin ? 'superadmin' : 'member'}
						{claims?.tenant_id ? ` · ${claims.tenant_id}` : ''}
					</p>
				</div>
			)}

			{/* ── Tab nav (M9.5) ────────────────────────────────────────── */}
			<nav data-tour="tab-nav" className="border-b border-slate-800 bg-slate-900/30 px-4">
				<Tabs
					selectedKey={activeTab}
					onSelectionChange={(k) => setActiveTab(k as TabId)}
				>
					<Tabs.ListContainer>
						<Tabs.List aria-label="Control Room sections">
							<Tabs.Tab id="operations">Operations<Tabs.Indicator /></Tabs.Tab>
							{can('staff:manage') && <Tabs.Tab id="team">Team<Tabs.Indicator /></Tabs.Tab>}
							{can('tenant:manage') && <Tabs.Tab id="roles">Roles<Tabs.Indicator /></Tabs.Tab>}
							{can('tenant:switch') && <Tabs.Tab id="tenants">Tenants<Tabs.Indicator /></Tabs.Tab>}
							{can('tenant:manage') && <Tabs.Tab id="policies">Policies<Tabs.Indicator /></Tabs.Tab>}
						</Tabs.List>
					</Tabs.ListContainer>
				</Tabs>
			</nav>

			{/* ── Tab content (each wrapped in its own ErrorBoundary) ──── */}
			<main className="min-h-0 flex-1 overflow-hidden">
				{/* Tour prompt banner — shown once per tab until dismissed */}
				{tour.showBanner && (
					<div className="flex items-center gap-3 border-b border-blue-800/40 bg-blue-950/30 px-4 py-2">
						<span className="text-xs text-blue-300">
							First time on the <strong className="capitalize">{activeTab}</strong> tab?
						</span>
						<button
							onClick={tour.startTour}
							className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-blue-500"
						>
							Start Tour
						</button>
						<button
							onClick={tour.dismissBanner}
							className="ml-auto text-[10px] text-slate-500 hover:text-slate-300"
						>
							✕ Dismiss
						</button>
					</div>
				)}
				{activeTab === 'operations' && (
					<ErrorBoundary name="Operations tab">
						<div className="grid h-full grid-cols-1 gap-3 p-3 lg:grid-cols-3">
							<section data-tour="map-canvas" className="min-h-[320px] lg:col-span-2 lg:min-h-0">
							<OptimizedStadiumMapCanvas
								incidents={incidents}
								staffMembers={staff}
								mapLayout={mapLayout}
								onIncidentSelect={handleSelect}
							/>
							</section>
							<aside className="flex min-h-0 flex-col gap-3 lg:col-span-1">
								<div data-tour="incident-queue" className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
									<IncidentQueue
										incidents={incidents}
										selectedId={selectedId}
										onSelect={handleSelect}
									/>
								</div>
								<div data-tour="incident-inspector" className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
									<IncidentInspector incident={selected} />
								</div>
							</aside>
						</div>
					</ErrorBoundary>
				)}
				{activeTab === 'team' && can('staff:manage') && (
					<ErrorBoundary name="Team tab">
						<TeamTab />
					</ErrorBoundary>
				)}
				{activeTab === 'roles' && can('tenant:manage') && (
					<ErrorBoundary name="Roles tab">
						<RolesTab />
					</ErrorBoundary>
				)}
				{activeTab === 'tenants' && can('tenant:switch') && (
					<ErrorBoundary name="Tenants tab">
						<TenantsTab />
					</ErrorBoundary>
				)}
				{activeTab === 'policies' && can('tenant:manage') && (
					<ErrorBoundary name="Policies tab">
						<PoliciesTab />
					</ErrorBoundary>
				)}
			</main>

			{/* ── Compliance slide-out ──────────────────────────────────── */}
			<AuditTimelineInspector
				isOpen={auditOpen}
				onClose={() => setAuditOpen(false)}
			/>
		</div>
	);
}
