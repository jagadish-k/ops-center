/**
 * AuditTimelineInspector — right-side slide-out reviewing the WORM audit chain
 * (ADR-0005, M6). Fetches real entries + chain verification from /api/audit-ledger.
 *
 * Displays a chronological timeline of tamper-evident log entries with actor,
 * action, before/after state delta, and the SHA-256 chain hash per link.
 * The SECURE / BREACHED badge reflects real server-side chain verification.
 */
import { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Spinner } from '@heroui/react';
import type { AuditLogEntry } from '@/types';
import { apiFetch } from '@/services/api';
import { timeAgo } from '@/lib/ui';

interface VerificationReport {
  isChainValid: boolean;
  totalEntries: number;
  tamperedEventIds: string[];
}

interface AuditTimelineInspectorProps {
  isOpen: boolean;
  onClose: () => void;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function AuditTimelineInspector({
  isOpen,
  onClose,
}: AuditTimelineInspectorProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [verification, setVerification] = useState<VerificationReport | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        entries: AuditLogEntry[];
        verification: VerificationReport;
      }>('/api/audit-ledger');
      setEntries(data.entries ?? []);
      setVerification(data.verification);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load audit data.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when the drawer opens. Data-fetching on visibility change is a
  // legitimate effect use-case (React docs:
  // https://react.dev/learn/you-might-not-need-an-effect).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) void fetchAuditData();
  }, [isOpen, fetchAuditData]);

  const secure = verification?.isChainValid ?? true;

  return (
    <Drawer>
      <Drawer.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        className="bg-slate-50 dark:bg-slate-950/80 backdrop-blur-sm"
      >
        <Drawer.Content
          placement="right"
          className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        >
          <Drawer.Dialog className="w-full max-w-md sm:max-w-lg">
            <Drawer.Header className="flex items-center justify-between border-b border-slate-300 dark:border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                  Compliance Log
                </h2>
                {verification && (
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      secure
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                        : 'border-red-500 bg-red-500/15 text-red-400'
                    }`}
                  >
                    {secure ? 'SECURE' : 'BREACHED'}
                  </span>
                )}
                {verification && (
                  <span className="font-mono text-[10px] text-slate-900 dark:text-slate-500">
                    {verification.totalEntries}{' '}
                    {verification.totalEntries === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>
              <Drawer.CloseTrigger />
            </Drawer.Header>

            <Drawer.Body className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="md" />
                </div>
              ) : error ? (
                <div className="py-8 text-center">
                  <p className="font-mono text-xs text-red-400">{error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => void fetchAuditData()}
                    className="mt-3 font-bold uppercase tracking-widest"
                  >
                    Retry
                  </Button>
                </div>
              ) : entries.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="font-mono text-xs uppercase tracking-widest text-slate-600">
                    No audit entries yet
                  </p>
                  <p className="mt-1 font-sans text-[11px] text-slate-700">
                    Mutations will appear here as they occur.
                  </p>
                </div>
              ) : (
                <ol className="relative border-l border-slate-300 dark:border-slate-800 pl-5">
                  {entries.map((entry) => (
                    <li
                      key={entry.eventId}
                      className="mb-5 last:mb-0"
                    >
                      <span className="absolute left-[-5px] mt-1 h-2.5 w-2.5 rounded-full border border-slate-400 dark:border-slate-600 bg-slate-700" />
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-400">
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-slate-900 dark:text-slate-500">
                          {timeAgo(entry.timestamp)}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-900 dark:text-slate-500">
                        target{' '}
                        <span className="text-slate-600 dark:text-slate-300">
                          {entry.targetResourceId}
                        </span>
                        {' · '}actor{' '}
                        <span className="text-slate-600 dark:text-slate-300">
                          {entry.actor.uid}
                        </span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        {entry.stateDelta.before ? (
                          <DeltaChip
                            label="BEFORE"
                            value={entry.stateDelta.before}
                            tone="muted"
                          />
                        ) : null}
                        {entry.stateDelta.after ? (
                          <DeltaChip
                            label="AFTER"
                            value={entry.stateDelta.after}
                            tone="accent"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1.5 break-all font-mono text-[9px] text-slate-600">
                        sha-256 {shortHash(entry.cryptographicHash)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Drawer.Body>

            <Drawer.Footer className="border-t border-slate-300 dark:border-slate-800 p-3">
              {!secure && verification && (
                <p className="mb-2 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-red-400">
                  Chain integrity compromised:{' '}
                  {verification.tamperedEventIds.length} tampered entry(s)
                </p>
              )}
              <Button
                fullWidth
                variant="secondary"
                onPress={onClose}
                className="font-bold uppercase tracking-widest"
              >
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
      : 'border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400';
  return (
    <span className={`rounded border px-1.5 py-0.5 ${cls}`}>
      <span className="opacity-60">{label} </span>
      {text.length > 40 ? `${text.slice(0, 40)}…` : text}
    </span>
  );
}
