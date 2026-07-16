/**
 * OperationalDashboard — the Control Room command shell.
 *
 * Desktop layout: a tactical header bar over a 2-column grid. The left column
 * (≈2/3) is the live stadium map canvas; the right column (≈1/3) stacks the
 * incident queue above the incident inspector. A compliance-log slide-out
 * (AuditTimelineInspector) is triggered from the header.
 *
 * Live operational state is consumed from the ActiveOps context (diff-polling).
 */
import { useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { useAuth } from '../../context/AuthContext';
import { useActiveOps } from '../../context/ActiveOpsContext';
import type { IncidentReport } from '../../types';
import { OptimizedStadiumMapCanvas } from '../shared/OptimizedStadiumMapCanvas';
import { IncidentQueue } from './IncidentQueue';
import { IncidentInspector } from './IncidentInspector';
import { TenantSwitcher } from './TenantSwitcher';
import { AuditTimelineInspector } from './AuditTimelineInspector';
import { mockTenants } from '../../lib/mockData';

interface OperationalDashboardProps {
	onTenantChange: (tenantId: string) => void;
}

export function OperationalDashboard({ onTenantChange }: OperationalDashboardProps) {
	const { signOut, claims } = useAuth();
	const { incidents, staff, activeTenantId, connectionHealthy } = useActiveOps();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [auditOpen, setAuditOpen] = useState(false);

	// Derive the freshest selected incident from the polled list.
	const selected = useMemo(
		() => incidents.find((i) => i.id === selectedId) ?? null,
		[incidents, selectedId],
	);

	const tenantName =
		mockTenants.find((t) => t.tenantId === activeTenantId)?.orgName ?? activeTenantId;

	const handleSelect = (incident: IncidentReport): void => {
		setSelectedId(incident.id);
	};

	return (
		<div className="flex h-screen flex-col bg-slate-950 text-slate-100">
			{/* ── Header bar ─────────────────────────────────────────────── */}
			<header className="flex items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-mono text-sm font-black uppercase tracking-widest text-slate-100">
						Stadium Ops
					</h1>
					<span className="font-mono text-[10px] uppercase tracking-widest text-blue-400">
						// Command Room
					</span>
				</div>

				<div className="mx-2 hidden h-5 w-px bg-slate-800 sm:block" />

				<div className="hidden items-center gap-2 sm:flex">
					<span
						className={`h-2 w-2 rounded-full ${
							connectionHealthy ? 'bg-emerald-500' : 'bg-amber-500'
						}`}
					/>
					<span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
						{tenantName}
					</span>
				</div>

				<div className="ml-auto flex items-center gap-2">
					<TenantSwitcher
						tenants={mockTenants}
						activeTenantId={activeTenantId}
						onTenantChange={onTenantChange}
					/>
					<Button
						size="sm"
						variant="secondary"
						onPress={() => setAuditOpen(true)}
						className="font-bold uppercase tracking-widest">
						Compliance Log
					</Button>
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
			{claims?.phoneNumber && (
				<div className="border-b border-slate-800/60 bg-slate-950 px-4 py-1">
					<p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">
						Operator {claims.phoneNumber} · {claims.role}
					</p>
				</div>
			)}

			{/* ── Main grid ─────────────────────────────────────────────── */}
			<main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-3">
				{/* Left: canvas (spans 2 of 3 columns on large screens) */}
				<section className="min-h-[320px] lg:col-span-2 lg:min-h-0">
					<OptimizedStadiumMapCanvas
						incidents={incidents}
						staffMembers={staff}
						onIncidentSelect={handleSelect}
					/>
				</section>

				{/* Right: queue + inspector */}
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
			</main>

			{/* ── Compliance slide-out ──────────────────────────────────── */}
			<AuditTimelineInspector isOpen={auditOpen} onClose={() => setAuditOpen(false)} />
		</div>
	);
}
