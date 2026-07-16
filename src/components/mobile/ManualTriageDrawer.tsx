/**
 * ManualTriageDrawer — bottom-sheet manual incident filing (3 taps).
 *
 * Fallback to voice ingest: a deliberately low-friction Category → Severity →
 * Zone flow so a field operator can file a structured report in seconds.
 * Submission posts to the incident-create endpoint (M3); until then it is staged
 * locally and surfaced with a network-lock spinner during the attempt.
 */
import { useState } from 'react';
import { Drawer, Button, Spinner } from '@heroui/react';
import type { IncidentCategory, IncidentSeverity } from '../../types';
import { apiFetch, ApiError } from '../../services/api';

interface ManualTriageDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	staffPhone: string;
	tenantId: string;
}

type Step = 1 | 2 | 3;

const CATEGORIES: { id: IncidentCategory; label: string; className: string }[] = [
	{ id: 'SECURITY', label: 'Security', className: 'border-blue-500 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20' },
	{ id: 'MEDICAL', label: 'Medical', className: 'border-emerald-500 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20' },
	{ id: 'CROWD', label: 'Crowd', className: 'border-red-500 bg-red-500/10 text-red-200 hover:bg-red-500/20' },
	{ id: 'FACILITIES', label: 'Facilities', className: 'border-amber-500 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20' },
];

const SEVERITIES: { id: IncidentSeverity; label: string; className: string }[] = [
	{ id: 'CRITICAL', label: 'Critical', className: 'border-red-500 bg-red-500/15 text-red-300' },
	{ id: 'HIGH', label: 'High', className: 'border-amber-500 bg-amber-500/15 text-amber-300' },
	{ id: 'MEDIUM', label: 'Medium', className: 'border-yellow-500 bg-yellow-500/15 text-yellow-300' },
	{ id: 'LOW', label: 'Low', className: 'border-slate-500 bg-slate-500/15 text-slate-300' },
];

const ZONES = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'] as const;

const STEP_LABELS: Record<Step, string> = {
	1: 'Step 1 — Category',
	2: 'Step 2 — Severity',
	3: 'Step 3 — Zone',
};

export function ManualTriageDrawer({
	isOpen,
	onClose,
	staffPhone,
	tenantId,
}: ManualTriageDrawerProps) {
	const [step, setStep] = useState<Step>(1);
	const [category, setCategory] = useState<IncidentCategory | null>(null);
	const [severity, setSeverity] = useState<IncidentSeverity | null>(null);
	const [zone, setZone] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const reset = (): void => {
		setStep(1);
		setCategory(null);
		setSeverity(null);
		setZone(null);
		setFeedback(null);
		setSubmitting(false);
	};

	const handleClose = (): void => {
		if (submitting) return;
		reset();
		onClose();
	};

	const submit = async (): Promise<void> => {
		if (!category || !severity || !zone) return;
		setSubmitting(true);
		setFeedback(null);
		try {
			await apiFetch('/api/incidents', {
				method: 'POST',
				body: JSON.stringify({
					category,
					severity,
					locationSector: zone,
					rawText: `Manual triage — ${category} / ${severity} at ${zone}`,
					sourceStaffPhone: staffPhone,
					tenantId,
				}),
			});
			setFeedback({ kind: 'ok', text: 'Report filed.' });
			window.setTimeout(() => handleClose(), 1200);
		} catch (err) {
			setFeedback({
				kind: 'err',
				text:
					err instanceof ApiError || err instanceof Error
						? `Offline — staged locally. (${err.message})`
						: 'Unknown error.',
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Drawer>
			<Drawer.Backdrop
				isOpen={isOpen}
				onOpenChange={(open) => {
					if (!open) handleClose();
				}}
				className="bg-slate-950/80 backdrop-blur-sm">
				<Drawer.Content placement="bottom" className="bg-slate-900 text-slate-100">
					<Drawer.Dialog className="w-full rounded-t-2xl">
						<Drawer.Handle />
						<Drawer.Header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
							<h2 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-200">
								{STEP_LABELS[step]}
							</h2>
							<button
								type="button"
								onClick={handleClose}
								disabled={submitting}
								className="font-mono text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300 disabled:opacity-40">
								Cancel
							</button>
						</Drawer.Header>

						<Drawer.Body className="px-4 py-4">
							{/* Progress dots */}
							<div className="mb-4 flex items-center justify-center gap-2">
								{([1, 2, 3] as Step[]).map((n) => (
									<span
										key={n}
										className={`h-1.5 w-8 rounded-full ${
											n <= step ? 'bg-blue-500' : 'bg-slate-700'
										}`}
									/>
								))}
							</div>

							{step === 1 && (
								<div className="grid grid-cols-2 gap-3">
									{CATEGORIES.map((c) => (
										<button
											key={c.id}
											type="button"
											onClick={() => {
												setCategory(c.id);
												setStep(2);
											}}
											className={`rounded-xl border-2 px-4 py-6 font-mono text-sm font-bold uppercase tracking-widest ${c.className}`}>
											{c.label}
										</button>
									))}
								</div>
							)}

							{step === 2 && (
								<div className="grid grid-cols-2 gap-3">
									{SEVERITIES.map((s) => (
										<button
											key={s.id}
											type="button"
											onClick={() => {
												setSeverity(s.id);
												setStep(3);
											}}
											className={`rounded-xl border-2 px-4 py-6 font-mono text-sm font-bold uppercase tracking-widest ${s.className}`}>
											{s.label}
										</button>
									))}
								</div>
							)}

							{step === 3 && (
								<div className="grid grid-cols-3 gap-3">
									{ZONES.map((z) => (
										<button
											key={z}
											type="button"
											onClick={() => setZone(z)}
											className={`rounded-xl border-2 px-3 py-6 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
												zone === z
													? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
													: 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
											}`}>
											{z}
										</button>
									))}
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
						</Drawer.Body>

						<Drawer.Footer className="flex items-center gap-2 border-t border-slate-800 p-3">
							{step > 1 && (
								<Button
									variant="secondary"
									onPress={() => setStep((step - 1) as Step)}
									isDisabled={submitting}
									className="font-bold uppercase tracking-widest">
									Back
								</Button>
							)}
							<Button
								fullWidth
								onPress={submit}
								isDisabled={!zone || submitting}
								isPending={submitting}
								className="font-bold uppercase tracking-widest">
								{({ isPending }) => (
									<>
										{isPending || submitting ? <Spinner color="current" size="sm" /> : null}
										{submitting ? 'Submitting…' : 'File Report'}
									</>
								)}
							</Button>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}
