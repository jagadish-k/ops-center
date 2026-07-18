/**
 * DispatchModal — full-screen urgent overlay shown when a dispatch directive is
 * active for the signed-in staff member.
 *
 * This is intentionally NOT a centered dialog: it is a full-bleed red overlay
 * with a pulsing border so it is unmissable outdoors / in glare. The operator
 * can Acknowledge (on arrival of intent) or Mark Resolved (task complete).
 */
import { Button } from '@heroui/react';
import type { DispatchDirective } from '@/types';

interface DispatchModalProps {
	dispatch: DispatchDirective;
	onAcknowledge: (dispatch: DispatchDirective) => void;
	onOnScene: (dispatch: DispatchDirective) => void;
	onResolve: (dispatch: DispatchDirective) => void;
}

export function DispatchModal({ dispatch, onAcknowledge, onOnScene, onResolve }: DispatchModalProps) {
	const acknowledged = dispatch.status === 'ACKNOWLEDGED' || dispatch.status === 'ON_SCENE';
	const onScene = dispatch.status === 'ON_SCENE';

	return (
		<div
			role="alertdialog"
			aria-label="Active dispatch directive"
			className="animate-pulse fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 border-4 border-red-500 bg-red-950/95 px-6 text-center">
			<div className="absolute inset-0 animate-ping rounded-none bg-red-500/10" aria-hidden />

			<div className="relative flex flex-col items-center gap-4">
				<span className="rounded-full border border-red-400 bg-red-500/20 px-4 py-1 font-mono text-[11px] font-black uppercase tracking-[0.3em] text-red-200">
					Active Dispatch
				</span>

				<p className="max-w-md font-sans text-lg font-bold leading-relaxed text-red-50">
					{dispatch.directiveText}
				</p>

				<p className="font-mono text-[10px] uppercase tracking-widest text-red-300/80">
					Status: {dispatch.status.replace('_', ' ')} · {dispatch.id}
				</p>
			</div>

			<div className="relative flex w-full max-w-xs flex-col gap-3">
				<Button
					fullWidth
					size="lg"
					isDisabled={acknowledged}
					onPress={() => onAcknowledge(dispatch)}
					className="bg-red-600 font-bold uppercase tracking-widest text-white hover:bg-red-500">
					{acknowledged ? 'Acknowledged' : 'Acknowledge'}
				</Button>
				<Button
					fullWidth
					size="lg"
					variant="secondary"
					isDisabled={!acknowledged || onScene}
					onPress={() => onOnScene(dispatch)}
					className="border-amber-400/60 bg-amber-900/30 font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-900/50">
					{onScene ? 'On Scene' : 'Mark On-Scene'}
				</Button>
				<Button
					fullWidth
					size="lg"
					variant="secondary"
					isDisabled={!acknowledged}
					onPress={() => onResolve(dispatch)}
					className="border-slate-400/40 bg-slate-200 dark:bg-slate-800 font-bold uppercase tracking-widest text-slate-800 dark:text-slate-100 hover:bg-slate-700">
					Mark Resolved
				</Button>
			</div>
		</div>
	);
}
