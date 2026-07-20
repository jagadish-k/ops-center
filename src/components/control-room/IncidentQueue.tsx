/**
 * IncidentQueue — scrollable list of open incidents for the Control Room.
 *
 * Filters out RESOLVED incidents and surfaces them tier-first. Selecting an item
 * delegates to the parent via `onSelect`. The active selection is highlighted.
 */
import { useMemo, useEffect, useRef } from 'react';
import type { IncidentReport, IncidentCategory } from '@/types';
import type { MapFloor } from '@/lib/map-layout';
import { timeAgo } from '@/lib/ui';

interface IncidentQueueProps {
  incidents: IncidentReport[];
  selectedId: string | null;
  onSelect: (incident: IncidentReport) => void;
  selectedFloorId?: string | null;
  onFloorChange?: (floorId: string | null) => void;
  selectedCategories?: Set<IncidentCategory>;
  onCategoryToggle?: (category: IncidentCategory) => void;
  floors?: MapFloor[];
}

export function IncidentQueue({
  incidents,
  selectedId,
  onSelect,
  selectedFloorId = null,
  onFloorChange,
  selectedCategories,
  onCategoryToggle,
  floors = [],
}: IncidentQueueProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll into view on selection change
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const item = listRef.current.querySelector(
      `[data-incident-id="${selectedId}"]`,
    );
    if (item) {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId]);
  // Open incidents, filtered by floor/category, sorted by tier then recency.
  const open = useMemo(() => {
    return incidents
      .filter((i) => i.status !== 'RESOLVED')
      .filter(
        (i) =>
          !selectedFloorId ||
          !i.floorId || // If incident has no floorId, show everywhere
          i.floorId === selectedFloorId,
      )
      .filter(
        (i) =>
          !selectedCategories ||
          selectedCategories.has(i.extractedMetadata.category),
      )
      .slice()
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return b.timestamp - a.timestamp;
      });
  }, [incidents, selectedFloorId, selectedCategories]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">
            Incident Queue - Live Feed
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">
            {open.length} active
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          {floors && floors.length > 1 && onFloorChange && (
            <select
              value={selectedFloorId || ''}
              onChange={(e) => onFloorChange(e.target.value || null)}
              className="rounded bg-white/5 border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-300 outline-none focus:border-cyan-500"
            >
              <option value="">All Floors</option>
              {floors.map((f) => (
                <option
                  key={f.id}
                  value={f.id}
                >
                  {f.name}
                </option>
              ))}
            </select>
          )}

          {selectedCategories && onCategoryToggle && (
            <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {(
                [
                  'SECURITY',
                  'MEDICAL',
                  'CROWD',
                  'FACILITIES',
                  'ADVISORY',
                ] as IncidentCategory[]
              ).map((cat) => {
                const isActive = selectedCategories.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryToggle(cat)}
                    className={`shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors ${
                      isActive
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                        : 'border-white/10 bg-transparent text-slate-500 hover:border-slate-500'
                    }`}
                  >
                    {cat.substring(0, 3)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {open.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-widest text-slate-500">
            No active incidents
          </div>
        ) : (
          open.map((incident) => {
            const isActive = selectedId === incident.id;
            const isHigh = incident.tier === 1;
            const isMedium = incident.tier === 2;

            // Define colors based on tier
            let glowClass =
              'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]';
            let tagClass = 'border-emerald-500 text-emerald-400';

            if (isHigh) {
              glowClass =
                'border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
              tagClass = 'border-red-500 text-red-400';
            } else if (isMedium) {
              glowClass =
                'border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.2)]';
              tagClass = 'border-orange-500 text-orange-400';
            }

            if (isActive) {
              glowClass = glowClass
                .replace('0.15', '0.4')
                .replace('0.2', '0.4');
            }

            return (
              <button
                key={incident.id}
                data-incident-id={incident.id}
                type="button"
                onClick={() => onSelect(incident)}
                aria-pressed={isActive}
                className={`w-full flex flex-col text-left rounded-xl border bg-slate-950/80 p-4 transition-all hover:-translate-y-0.5 ${glowClass}`}
              >
                <div className="flex justify-between items-start mb-2 w-full">
                  <div>
                    <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-1">
                      ID:{' '}
                      {new Date(incident.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <h3 className="text-white font-sans text-sm font-semibold uppercase tracking-wide line-clamp-1">
                      {incident.extractedMetadata.category}:{' '}
                      {incident.rawText.substring(0, 20)}...
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase tracking-widest ${tagClass}`}
                  >
                    {incident.status}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mb-3 text-slate-400 font-sans text-xs">
                  <span>📍</span>
                  <span>{incident.extractedMetadata.locationSector}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 w-full border-t border-white/5 pt-3">
                  <div className="flex flex-col">
                    <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">
                      Priority
                    </span>
                    <span
                      className={`font-mono text-xs font-bold mt-0.5 ${isHigh ? 'text-red-400' : isMedium ? 'text-orange-400' : 'text-emerald-400'}`}
                    >
                      {isHigh ? 'H / M' : isMedium ? 'M / L' : 'L / L'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">
                      Status
                    </span>
                    <span
                      className={`font-mono text-xs font-bold mt-0.5 ${tagClass.split(' ')[1]}`}
                    >
                      {incident.status}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">
                      Duration
                    </span>
                    <span className="font-mono text-xs text-white mt-0.5">
                      {timeAgo(incident.timestamp)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
