/**
 * AuditTimelineInspector — right-side slide-out reviewing the WORM audit chain
 * (ADR-0005). Renders a chronological timeline of tamper-evident log entries with
 * actor, action, before/after state delta, and the SHA-256 chain hash per link.
 *
 * A simple chain-integrity badge (SECURE / BREACHED) is computed by re-hashing
 * each link's predecessor — the real verification happens server-side.
 */
import { useMemo } from 'react';
import { Drawer, Button } from '@heroui/react';
import type { AuditLogEntry } from '../../types';
import { timeAgo } from '../../lib/ui';

interface AuditTimelineInspectorProps {
	isOpen: boolean;
	onClose: () => void;
	entries?: AuditLogEntry[];
}

// ── Mock audit chain (server is the source of truth in production) ────────────
function buildMockChain(now: number): AuditLogEntry[] {
	const baseActor = {
		uid: '+14155552026',
		role: 'admin' as const,
		phoneOrEmail: '+14155552026',
		deviceFingerprint: 'fp_a3f9',
		ipAddress: '10.0.4.21',
	};
	const seed: Array<Omit<AuditLogEntry, 'cryptographicHash'>> = [
		{
			eventId: 'evt_003',
			tenantId: 'tenant_metlife',
			timestamp: now - 40_000,
			actor: baseActor,
			action: 'INCIDENT_STATUS_MUTATION',
			targetResourceId: 'inc_001',
			stateDelta: { before: { status: 'OPEN' }, after: { status: 'ACKNOWLEDGED' } },
		},
		{
			eventId: 'evt_002',
			tenantId: 'tenant_metlife',
			timestamp: now - 175_000,
			actor: { ...baseActor, uid: 'edge_dispatch' },
			action: 'DISPATCH_SENT',
			targetResourceId: 'dsp_001',
			stateDelta: { before: null, after: { status: 'SENT', target: '+14155550001' } },
		},
		{
			eventId: 'evt_001',
			tenantId: 'tenant_metlife',
			timestamp: now - 320_000,
			actor: { ...baseActor, uid: 'ai_triage' },
			action: 'INCIDENT_CREATED',
			targetResourceId: 'inc_001',
			stateDelta: { before: null, after: { tier: 1, category: 'CROWD', sector: 'SEC-112' } },
		},
	];

	// Deterministic faux SHA-256 chain (the server uses SubtleCrypto SHA-256).
	let prevHash = '0'.repeat(64);
	return seed.map((entry) => {
		const payload = `${prevHash}:${entry.eventId}:${entry.action}:${entry.targetResourceId}`;
		const hash = fauxHash(payload);
		prevHash = hash;
		return { ...entry, cryptographicHash: hash };
	});
}

// Lightweight deterministic 64-hex stand-in (NOT cryptographic — UI preview only).
function fauxHash(input: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x1000193;
	for (let i = 0; i < input.length; i++) {
		const c = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul((h2 + c) ^ (h1 >>> 13), 0x85ebca6b) >>> 0;
	}
	const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
	return (hex + hex + hex + hex).slice(0, 64);
}

function verifyChain(entries: AuditLogEntry[]): boolean {
	let prevHash = '0'.repeat(64);
	for (const entry of entries) {
		const payload = `${prevHash}:${entry.eventId}:${entry.action}:${entry.targetResourceId}`;
		if (entry.cryptographicHash !== fauxHash(payload)) return false;
		prevHash = entry.cryptographicHash;
	}
	return true;
}

function shortHash(hash: string): string {
	return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function AuditTimelineInspector({
	isOpen,
	onClose,
	entries: provided,
}: AuditTimelineInspectorProps) {
	const entries = useMemo(
		() => provided ?? buildMockChain(Date.now()),
		[provided],
	);
	const secure = useMemo(() => verifyChain(entries), [entries]);

	return (
		<Drawer>
			<Drawer.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				className="bg-slate-950/80 backdrop-blur-sm">
				<Drawer.Content
					placement="right"
					className="bg-slate-900 text-slate-100">
					<Drawer.Dialog className="w-full max-w-md sm:max-w-lg">
						<Drawer.Header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
							<div className="flex items-center gap-2">
								<h2 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-200">
									Compliance Log
								</h2>
								<span
									className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
										secure
											? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
											: 'border-red-500 bg-red-500/15 text-red-400'
									}`}>
									{secure ? 'SECURE' : 'BREACHED'}
								</span>
							</div>
							<Drawer.CloseTrigger />
						</Drawer.Header>

						<Drawer.Body className="p-4">
							<ol className="relative border-l border-slate-800 pl-5">
								{entries.map((entry) => (
									<li key={entry.eventId} className="mb-5 last:mb-0">
										<span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border border-slate-600 bg-slate-700" />
										<div className="mb-1 flex items-center gap-2">
											<span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-400">
												{entry.action.replace(/_/g, ' ')}
											</span>
											<span className="ml-auto font-mono text-[10px] text-slate-500">
												{timeAgo(entry.timestamp)}
											</span>
										</div>
										<p className="font-mono text-[10px] text-slate-500">
											target <span className="text-slate-300">{entry.targetResourceId}</span>
											{' · '}actor{' '}
											<span className="text-slate-300">{entry.actor.uid}</span>
										</p>
										<div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
											{entry.stateDelta.before ? (
												<DeltaChip label="BEFORE" value={entry.stateDelta.before} tone="muted" />
											) : null}
											{entry.stateDelta.after ? (
												<DeltaChip label="AFTER" value={entry.stateDelta.after} tone="accent" />
											) : null}
										</div>
										<p className="mt-1.5 break-all font-mono text-[9px] text-slate-600">
											sha-256 {shortHash(entry.cryptographicHash)}
										</p>
									</li>
								))}
							</ol>
						</Drawer.Body>

						<Drawer.Footer className="border-t border-slate-800 p-3">
							<Button
								fullWidth
								variant="secondary"
								onPress={onClose}
								className="font-bold uppercase tracking-widest">
								Close
							</Button>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}

function DeltaChip({
	label,
	value,
	tone,
}: {
	label: string;
	value: Record<string, unknown>;
	tone: 'muted' | 'accent';
}) {
	const text = JSON.stringify(value);
	const cls =
		tone === 'accent'
			? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
			: 'border-slate-700 bg-slate-800/50 text-slate-400';
	return (
		<span className={`rounded border px-1.5 py-0.5 ${cls}`}>
			<span className="opacity-60">{label} </span>
			{text.length > 40 ? `${text.slice(0, 40)}…` : text}
		</span>
	);
}
