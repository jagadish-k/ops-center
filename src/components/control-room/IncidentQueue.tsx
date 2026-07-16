/**
 * IncidentQueue — scrollable list of open incidents for the Control Room.
 *
 * Filters out RESOLVED incidents and surfaces them tier-first. Selecting an item
 * delegates to the parent via `onSelect`. The active selection is highlighted.
 */
import { useMemo } from 'react';
import type { IncidentReport } from '@/types';
import { tierBadge, severityBadge, statusBadge, timeAgo } from '@/lib/ui';

interface IncidentQueueProps {
	incidents: IncidentReport[];
	selectedId: string | null;
	onSelect: (incident: IncidentReport) => void;
}

export function IncidentQueue({ incidents, selectedId, onSelect }: IncidentQueueProps) {
	// Open incidents, sorted by tier (life-safety first) then recency.
	const open = useMemo(() => {
		return incidents
			.filter((i) => i.status !== 'RESOLVED')
			.slice()
			.sort((a, b) => {
				if (a.tier !== b.tier) return a.tier - b.tier;
				return b.timestamp - a.timestamp;
			});
	}, [incidents]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
				<h2 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
					Incident Queue
				</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
					{open.length} active
				</span>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{open.length === 0 ? (
					<div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-widest text-slate-600">
						No active incidents
					</div>
				) : (
					<ul className="divide-y divide-slate-800/70">
						{open.map((incident) => {
							const tier = tierBadge(incident.tier);
							const sev = severityBadge(incident.extractedMetadata.severity);
							const st = statusBadge(incident.status);
							const isActive = selectedId === incident.id;
							return (
								<li key={incident.id}>
									<button
										type="button"
										onClick={() => onSelect(incident)}
										aria-pressed={isActive}
										className={`w-full border-l-2 px-4 py-3 text-left transition-colors ${
											isActive
												? 'border-blue-500 bg-blue-500/10'
												: 'border-transparent bg-slate-900/40 hover:bg-slate-800/50'
										}`}>
										<div className="mb-1.5 flex items-center gap-1.5">
											<span
												className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${tier.className}`}>
												{tier.label}
											</span>
											<span
												className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${sev.className}`}>
												{sev.label}
											</span>
											<span
												className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${st.className}`}>
												{st.label}
											</span>
											<span className="ml-auto font-mono text-[10px] text-slate-500">
												{timeAgo(incident.timestamp)}
											</span>
										</div>
										<div className="mb-1 flex items-center gap-2">
											<span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
												{incident.extractedMetadata.category}
											</span>
											<span className="font-mono text-[10px] text-slate-600">/</span>
											<span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
												{incident.extractedMetadata.locationSector}
											</span>
										</div>
										<p className="line-clamp-2 font-sans text-xs leading-relaxed text-slate-300">
											{incident.rawText}
										</p>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
