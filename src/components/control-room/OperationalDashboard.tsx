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
import { useMemo, useState } from 'react';
import { Button, Tabs, Tab, TabList, TabPanel } from '@heroui/react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveOps } from '@/context/ActiveOpsContext';
import type { IncidentReport } from '@/types';

import { IncidentQueue } from './IncidentQueue';
import { IncidentInspector } from './IncidentInspector';
import { TenantSwitcher } from './TenantSwitcher';
import { AuditTimelineInspector } from './AuditTimelineInspector';
import { TeamTab } from './TeamTab';
import { RolesTab } from './RolesTab';
import { TenantsTab } from './TenantsTab';
import { mockTenants } from '@/lib/mockData';
import { OptimizedStadiumMapCanvas } from '@/components/shared/OptimizedStadiumMapCanvas';

type TabId = 'operations' | 'team' | 'roles' | 'tenants';

interface OperationalDashboardProps {
	onTenantChange: (tenantId: string) => void;
}

export function OperationalDashboard({ onTenantChange }: OperationalDashboardProps) {
	const { signOut, claims } = useAuth();
	const { can, phone, fullName, isSuperadmin } = usePermissions();
	const { incidents, staff, activeTenantId, connectionHealthy } = useActiveOps();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [auditOpen, setAuditOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>('operations');

	// Derive the freshest selected incident from the polled list.
	const selected = useMemo(() => incidents.find((i) => i.id === selectedId) ?? null, [incidents, selectedId]);

	const tenantName = mockTenants.find((t) => t.tenantId === activeTenantId)?.orgName ?? activeTenantId;

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
					{can('tenant:switch') && (
						<TenantSwitcher
							tenants={mockTenants}
							activeTenantId={activeTenantId}
							onTenantChange={onTenantChange}
						/>
					)}
					{can('audit:view') && (
						<Button
							size="sm"
							variant="secondary"
							onPress={() => setAuditOpen(true)}
							className="font-bold uppercase tracking-widest">
							Compliance Log
						</Button>
					)}
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
			<nav className="border-b border-slate-800 bg-slate-900/30 px-4">
				<Tabs
					selectedKey={activeTab}
					onSelectionChange={(k) => setActiveTab(k as TabId)}
					aria-label="Control Room sections"
				>
					<Tab id="operations" label="Operations" />
					{can('staff:manage') && <Tab id="team" label="Team" />}
					{can('tenant:manage') && <Tab id="roles" label="Roles" />}
					{can('tenant:switch') && <Tab id="tenants" label="Tenants" />}
				</Tabs>
			</nav>

			{/* ── Tab content ───────────────────────────────────────────── */}
			<main className="min-h-0 flex-1 overflow-hidden">
				{activeTab === 'operations' && (
					<div className="grid h-full grid-cols-1 gap-3 p-3 lg:grid-cols-3">
						<section className="min-h-[320px] lg:col-span-2 lg:min-h-0">
							<OptimizedStadiumMapCanvas
								incidents={incidents}
								staffMembers={staff}
								onIncidentSelect={handleSelect}
							/>
						</section>
						<aside className="flex min-h-0 flex-col gap-3 lg:col-span-1">
							<div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
								<IncidentQueue
									incidents={incidents}
									selectedId={selectedId}
									onSelect={handleSelect}
								/>
							</div>
							<div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
								<IncidentInspector incident={selected} />
							</div>
						</aside>
					</div>
				)}
				{activeTab === 'team' && can('staff:manage') && <TeamTab />}
				{activeTab === 'roles' && can('tenant:manage') && <RolesTab />}
				{activeTab === 'tenants' && can('tenant:switch') && <TenantsTab />}
			</main>

			{/* ── Compliance slide-out ──────────────────────────────────── */}
			<AuditTimelineInspector
				isOpen={auditOpen}
				onClose={() => setAuditOpen(false)}
			/>
		</div>
	);
}

// Re-export for consumers that want HeroUI tab primitives directly.
void TabList;
void TabPanel;
