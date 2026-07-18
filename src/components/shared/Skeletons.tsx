/**
 * Skeleton primitives — placeholder shapes shown while data loads.
 *
 * Each skeleton matches the layout of its corresponding real component so
 * the page doesn't jump when data arrives. Pulsing animation is provided by
 * Tailwind's animate-pulse utility.
 */
import { Skeleton } from '@heroui/react';

// ─── Table skeleton (TeamTab) ────────────────────────────────────────────────

export function TableSkeleton({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40">
      {/* Header */}
      <div className="flex border-b border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-3 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3 flex-1 rounded"
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-3 border-b border-slate-300 dark:border-slate-800/40 px-3 py-2"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3 flex-1 rounded"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Card grid skeleton (RolesTab, TenantsTab) ───────────────────────────────

export function CardGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40 p-4"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-3 w-12 rounded" />
          </div>
          <Skeleton className="mt-2 h-3 w-full rounded" />
          <Skeleton className="mt-1 h-3 w-3/4 rounded" />
          <div className="mt-3 flex gap-1">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-3 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Inline row skeleton (single row in a table while toggling) ──────────────

export function InlineRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-300 dark:border-slate-800/40 px-3 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3 flex-1 rounded"
        />
      ))}
    </div>
  );
}

// ─── Single card skeleton (for empty states + tenant card) ───────────────────

export function CardSkeleton() {
  return (
    <div className="rounded border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-3 w-12 rounded" />
      </div>
      <Skeleton className="mt-2 h-3 w-3/4 rounded" />
      <Skeleton className="mt-1 h-2 w-1/2 rounded" />
    </div>
  );
}
