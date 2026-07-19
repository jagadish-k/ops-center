/**
 * IncidentQueue — scrollable list of open incidents for the Control Room.
 *
 * Filters out RESOLVED incidents and surfaces them tier-first. Selecting an item
 * delegates to the parent via `onSelect`. The active selection is highlighted.
 */
import { useMemo, useEffect, useRef } from 'react';
import type { IncidentReport, IncidentCategory } from '@/types';
import type { MapFloor } from '@/lib/map-layout';
import { tierBadge, severityBadge, statusBadge, timeAgo } from '@/lib/ui';

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
      <div className="flex flex-col gap-2 border-b border-slate-300 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            Incident Queue
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
            {open.length} active
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {floors && floors.length > 1 && onFloorChange && (
            <select
              value={selectedFloorId || ''}
              onChange={(e) => onFloorChange(e.target.value || null)}
              className="rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
            <div className="flex flex-1 gap-1 overflow-x-auto pb-1 no-scrollbar">
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
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {open.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-widest text-slate-600">
            No active incidents
          </div>
        ) : (
          <ul
            ref={listRef}
            className="divide-y divide-slate-800/70"
          >
            {open.map((incident) => {
              const tier = tierBadge(incident.tier);
              const sev = severityBadge(incident.extractedMetadata.severity);
              const st = statusBadge(incident.status);
              const isActive = selectedId === incident.id;
              return (
                <li
                  key={incident.id}
                  data-incident-id={incident.id}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(incident)}
                    aria-pressed={isActive}
                    className={`w-full border-l-4 px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-amber-500 bg-amber-100/80 dark:bg-amber-900/30'
                        : 'border-transparent bg-slate-100 dark:bg-slate-900/40 hover:bg-slate-200 dark:bg-slate-800/50'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${tier.className}`}
                      >
                        {tier.label}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${sev.className}`}
                      >
                        {sev.label}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${st.className}`}
                      >
                        {st.label}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-slate-900 dark:text-slate-500">
                        {timeAgo(incident.timestamp)}
                      </span>
                    </div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {incident.extractedMetadata.category}
                      </span>
                      <span className="font-mono text-[10px] text-slate-600">
                        /
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {incident.extractedMetadata.locationSector}
                      </span>
                    </div>
                    <p className="line-clamp-2 font-sans text-xs leading-relaxed text-slate-600 dark:text-slate-300">
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
