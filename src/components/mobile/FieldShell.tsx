/**
 * FieldShell — the mobile-first staff surface layout.
 *
 * Three zones (CODE-DESIGN.md §4): a compact header (identity + disconnect), a
 * main area that prioritizes an active dispatch as a full-screen alert, and a
 * bottom thumb zone hosting the voice push-to-talk control. A manual-triage
 * bottom sheet is offered as a fallback to voice.
 */
import { useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { useActiveOps } from '@/context/ActiveOpsContext';
import type { DispatchDirective } from '@/types';
import { updateDispatchStatus } from '@/services/api';
import { VoiceIngest } from './VoiceIngest';
import { ManualTriageDrawer } from './ManualTriageDrawer';
import { DispatchModal } from './DispatchModal';

interface FieldShellProps {
	staffPhone: string;
	tenantId: string;
	onDisconnect: () => void;
}

export function FieldShell({ staffPhone, tenantId, onDisconnect }: FieldShellProps) {
	const { dispatches, connectionHealthy } = useActiveOps();
	const [triageOpen, setTriageOpen] = useState(false);

	// Active (non-resolved) dispatch targeting this operator.
	const activeDispatch = useMemo<DispatchDirective | null>(() => {
		return (
			dispatches.find(
				(d) => d.targetStaffPhone === staffPhone && d.status !== 'RESOLVED',
			) ?? null
		);
	}, [dispatches, staffPhone]);

	const handleAck = async (dispatch: DispatchDirective): Promise<void> => {
		try {
			await updateDispatchStatus(dispatch.id, 'ACKNOWLEDGED');
		} catch (err) {
			console.error('Failed to acknowledge dispatch:', err);
		}
	};

	const handleOnScene = async (dispatch: DispatchDirective): Promise<void> => {
		try {
			await updateDispatchStatus(dispatch.id, 'ON_SCENE');
		} catch (err) {
			console.error('Failed to mark on-scene:', err);
		}
	};

	const handleResolve = async (dispatch: DispatchDirective): Promise<void> => {
		try {
			await updateDispatchStatus(dispatch.id, 'RESOLVED');
		} catch (err) {
			console.error('Failed to resolve dispatch:', err);
		}
	};

	return (
		<div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
			{/* ── Header ───────────────────────────────────────────── */}
			<header className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/70 px-4 py-3">
				<h1 className="font-mono text-xs font-black uppercase tracking-widest text-slate-100">
					Field Active Link
				</h1>
				<div className="ml-auto flex items-center gap-2">
					<span
						className={`h-2 w-2 rounded-full ${
							connectionHealthy ? 'bg-emerald-500' : 'bg-amber-500'
						}`}
					/>
					<span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
						{staffPhone}
					</span>
				</div>
				<Button
					size="sm"
					variant="secondary"
					onPress={onDisconnect}
					className="font-bold uppercase tracking-widest">
					Disconnect
				</Button>
			</header>

			{/* ── Main ─────────────────────────────────────────────── */}
			<main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
				{activeDispatch ? (
					<DispatchModal
						dispatch={activeDispatch}
						onAcknowledge={handleAck}
						onOnScene={handleOnScene}
						onResolve={handleResolve}
					/>
				) : (
					<>
						<div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center">
							<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10">
								<span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
							</div>
							<h2 className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-300">
								Awaiting Dispatch
							</h2>
							<p className="mt-2 font-sans text-xs leading-relaxed text-slate-400">
								You are on the active roster. Hold the push-to-talk control below to file a
								verbal report, or open manual triage.
							</p>
						</div>

						<Button
							fullWidth
							variant="secondary"
							onPress={() => setTriageOpen(true)}
							className="max-w-sm font-bold uppercase tracking-widest">
							Manual Triage
						</Button>
					</>
				)}
			</main>

			{/* ── Bottom thumb zone (voice control) ────────────────── */}
			<footer className="border-t border-slate-800 bg-slate-900/70 px-4 pb-6 pt-4">
				<VoiceIngest staffPhone={staffPhone} tenantId={tenantId} />
			</footer>

			{/* ── Manual triage bottom sheet ───────────────────────── */}
			<ManualTriageDrawer
				isOpen={triageOpen}
				onClose={() => setTriageOpen(false)}
				staffPhone={staffPhone}
				tenantId={tenantId}
			/>
		</div>
	);
}
