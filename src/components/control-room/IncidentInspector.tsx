/**
 * IncidentInspector — detail panel for the currently selected incident.
 *
 * Surfaces the full report (raw text, classification grid, coordinates) and the
 * primary lifecycle actions: Acknowledge, Resolve, Dispatch Personnel (M5).
 * Actions attempt the lifecycle endpoint optimistically; failures fall back to a
 * local status override so the UI stays functional while the backend is built.
 */
import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import type { IncidentReport, IncidentStatus } from '../../types';
import { apiFetch, ApiError } from '../../services/api';
import { tierBadge, severityBadge, statusBadge } from '../../lib/ui';

interface IncidentInspectorProps {
	incident: IncidentReport | null;
}

export function IncidentInspector({ incident }: IncidentInspectorProps) {
	const [localStatus, setLocalStatus] = useState<IncidentStatus | null>(null);
	const [pending, setPending] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	if (!incident) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
				<p className="font-mono text-xs uppercase tracking-widest text-slate-600">
					No incident selected
				</p>
				<p className="font-sans text-[11px] text-slate-700">
					Select an incident from the queue or tap a beacon on the grid.
				</p>
			</div>
		);
	}

	const effectiveStatus = localStatus ?? incident.status;
	const tier = tierBadge(incident.tier);
	const sev = severityBadge(incident.extractedMetadata.severity);
	const st = statusBadge(effectiveStatus);

	const mutate = async (action: string, next: IncidentStatus): Promise<void> => {
		setPending(action);
		setFeedback(null);
		try {
			await apiFetch(`/api/incidents/${incident.id}/${action}`, { method: 'POST' });
			setLocalStatus(next);
			setFeedback({ kind: 'ok', text: `${action.toUpperCase()} acknowledged by server.` });
		} catch (err) {
			// Endpoint unbuilt (M3) — advance locally for review, flag offline.
			setLocalStatus(next);
			const text =
				err instanceof ApiError || err instanceof Error
					? `Offline mode — ${action} staged locally.`
					: 'Unknown error.';
			setFeedback({ kind: 'err', text });
		} finally {
			setPending(null);
		}
	};

	const handleAck = (): void => {
		void mutate('acknowledge', 'ACKNOWLEDGED');
	};
	const handleResolve = (): void => {
		void mutate('resolve', 'RESOLVED');
	};
	const handleDispatch = (): void => {
		setFeedback({ kind: 'ok', text: 'Dispatch workflow arrives in M5.' });
	};

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="border-b border-slate-800 px-4 py-3">
				<div className="mb-1 flex items-center gap-1.5">
					<span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${tier.className}`}>
						{tier.label}
					</span>
					<span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${st.className}`}>
						{st.label}
					</span>
					<span className="ml-auto font-mono text-[10px] text-slate-500">{incident.id}</span>
				</div>
				<h3 className="font-mono text-xs uppercase tracking-widest text-slate-300">
					Incident Inspector
				</h3>
			</div>

			{/* Body */}
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<p className="mb-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-sans text-sm leading-relaxed text-slate-200">
					{incident.rawText}
				</p>

				<dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
					<Field label="Category" value={incident.extractedMetadata.category} />
					<Field label="Severity" value={sev.label} valueClass={sev.className} />
					<Field label="Sector" value={incident.extractedMetadata.locationSector} />
					<Field label="Source" value={incident.source.replace('_', ' ')} />
					<Field
						label="Grid"
						value={`${incident.coordinates.x}, ${incident.coordinates.y}`}
					/>
					<Field label="Tier" value={`Tier ${incident.tier}`} />
				</dl>

				{incident.extractedMetadata.actionRequired && (
					<div className="mt-4">
						<p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
							Action Required
						</p>
						<p className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 font-sans text-xs leading-relaxed text-amber-200">
							{incident.extractedMetadata.actionRequired}
						</p>
					</div>
				)}

				{feedback && (
					<div
						className={`mt-4 rounded-lg border p-2.5 text-center font-mono text-[10px] font-bold uppercase tracking-widest ${
							feedback.kind === 'ok'
								? 'border-emerald-900/50 bg-emerald-950/20 text-emerald-400'
								: 'border-amber-900/50 bg-amber-950/20 text-amber-400'
						}`}>
						{feedback.text}
					</div>
				)}
			</div>

			{/* Action rail */}
			<div className="border-t border-slate-800 p-3">
				<div className="grid grid-cols-2 gap-2">
					<Button
						size="md"
						variant="secondary"
						isDisabled={effectiveStatus !== 'OPEN' || pending !== null}
						onPress={handleAck}
						className="font-bold uppercase tracking-widest">
						{({ isPending }) => (
							<>
								{pending === 'acknowledge' || isPending ? <Spinner color="current" size="sm" /> : null}
								{pending === 'acknowledge' ? 'Ack…' : 'Acknowledge'}
							</>
						)}
					</Button>
					<Button
						size="md"
						isDisabled={effectiveStatus === 'RESOLVED' || pending !== null}
						onPress={handleResolve}
						className="font-bold uppercase tracking-widest">
						{({ isPending }) => (
							<>
								{pending === 'resolve' || isPending ? <Spinner color="current" size="sm" /> : null}
								{pending === 'resolve' ? 'Res…' : 'Resolve'}
							</>
						)}
					</Button>
				</div>
				<Button
					fullWidth
					variant="secondary"
					className="mt-2 font-bold uppercase tracking-widest"
					onPress={handleDispatch}>
					Dispatch Personnel
				</Button>
			</div>
		</div>
	);
}

function Field({
	label,
	value,
	valueClass,
}: {
	label: string;
	value: string;
	valueClass?: string;
}) {
	return (
		<div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
			<dt className="text-[9px] uppercase tracking-widest text-slate-600">{label}</dt>
			<dd className={`mt-0.5 font-bold uppercase tracking-wide text-slate-300 ${valueClass ?? ''}`}>
				{value}
			</dd>
		</div>
	);
}
