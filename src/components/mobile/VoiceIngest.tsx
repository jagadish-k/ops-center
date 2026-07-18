/**
 * VoiceIngest — push-to-talk audio capture for field staff.
 *
 * Captures audio via MediaRecorder (webm/opus), then POSTs the blob to the AI
 * triage pipeline. The submit button lives in the lower thumb zone per
 * CODE-DESIGN.md. States cycle IDLE → RECORDING → UPLOADING → SUCCESS/ERROR.
 *
 * The upload uses a raw authenticated fetch (not apiFetch) because the body is
 * multipart FormData — apiFetch would force application/json and strip the
 * boundary. The Bearer token is still injected from the same token store.
 *
 * The /api/ai-triage endpoint is built in M2; until then failures are shown
 * gracefully so the surface remains fully reviewable.
 */
import { useRef, useState, useCallback } from 'react';
import { Spinner } from '@heroui/react';
import { getAuthToken, ApiError } from '@/services/api';

type VoiceState = 'IDLE' | 'RECORDING' | 'UPLOADING' | 'SUCCESS' | 'ERROR';

interface VoiceIngestProps {
	/** Phone number of the authenticated staff member (sent for attribution). */
	staffPhone: string;
	tenantId: string;
}

export function VoiceIngest({ staffPhone, tenantId }: VoiceIngestProps) {
	const [state, setState] = useState<VoiceState>('IDLE');
	const [errorText, setErrorText] = useState<string>('');
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const streamRef = useRef<MediaStream | null>(null);

	const stateLabel: Record<VoiceState, string> = {
		IDLE: 'Hold to report',
		RECORDING: 'Recording… release to send',
		UPLOADING: 'Uploading to triage…',
		SUCCESS: 'Report received',
		ERROR: 'Failed — tap to retry',
	};

	const cleanupStream = useCallback((): void => {
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
	}, []);

	const upload = useCallback(
		async (blob: Blob): Promise<void> => {
			setState('UPLOADING');
			const form = new FormData();
			form.append('audio', blob, 'report.webm');
			form.append('staffPhone', staffPhone);
			form.append('tenantId', tenantId);

			const token = getAuthToken();
			const headers: HeadersInit = {};
			if (token) headers['Authorization'] = `Bearer ${token}`;
			// NOTE: Content-Type intentionally omitted — the browser sets the
			// multipart boundary.

			try {
				const res = await fetch('/api/ai-triage', {
					method: 'POST',
					headers,
					body: form,
				});
				if (!res.ok) {
					throw new ApiError(`Triage rejected (${res.status})`, res.status);
				}
				setState('SUCCESS');
				// Reset to idle shortly so the operator can file another report.
				window.setTimeout(() => setState('IDLE'), 2200);
			} catch (err) {
				setState('ERROR');
				setErrorText(
					err instanceof Error ? err.message : 'Network or microphone error.',
				);
			}
		},
		[staffPhone, tenantId],
	);

	const startRecording = useCallback(async (): Promise<void> => {
		setErrorText('');
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
			mediaRecorderRef.current = recorder;
			chunksRef.current = [];

			recorder.ondataavailable = (e: BlobEvent): void => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};
			recorder.onstop = (): void => {
				const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
				cleanupStream();
				if (blob.size === 0) {
					setState('ERROR');
					setErrorText('No audio captured.');
					return;
				}
				void upload(blob);
			};

			recorder.start();
			setState('RECORDING');
		} catch (err) {
			setState('ERROR');
			setErrorText(
				err instanceof Error ? `Microphone unavailable: ${err.message}` : 'Microphone unavailable.',
			);
		}
	}, [cleanupStream, upload]);

	const stopRecording = useCallback((): void => {
		const recorder = mediaRecorderRef.current;
		if (recorder && recorder.state !== 'inactive') {
			recorder.stop();
		}
	}, []);

	const handlePress = (): void => {
		if (state === 'UPLOADING') return; // throttle double-submit
		if (state === 'RECORDING') {
			stopRecording();
			return;
		}
		void startRecording();
	};

	const isRecording = state === 'RECORDING';
	const isUploading = state === 'UPLOADING';

	return (
		<div className="flex flex-col items-center gap-2">
			<button
				type="button"
				onPointerDown={(e) => {
					e.preventDefault();
					if (state === 'IDLE' || state === 'SUCCESS' || state === 'ERROR') {
						void startRecording();
					}
				}}
				onPointerUp={(e) => {
					e.preventDefault();
					if (state === 'RECORDING') stopRecording();
				}}
				onPointerLeave={() => {
					if (state === 'RECORDING') stopRecording();
				}}
				disabled={isUploading}
				aria-label={stateLabel[state]}
				className={`relative flex h-20 w-20 select-none items-center justify-center rounded-full border-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 ${
					isRecording
						? 'animate-pulse border-red-500 bg-red-500/30 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.5)]'
						: 'border-blue-500 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25'
				}`}>
				{isUploading ? <Spinner color="current" size="md" /> : <span>{isRecording ? 'STOP' : 'PTT'}</span>}
			</button>

			<p
				className={`font-mono text-[10px] uppercase tracking-widest ${
					state === 'ERROR' ? 'text-red-400' : state === 'SUCCESS' ? 'text-emerald-400' : 'text-slate-500 dark:text-slate-400'
				}`}>
				{stateLabel[state]}
			</p>
			{state === 'ERROR' && errorText && (
				<p className="max-w-[80%] text-center font-mono text-[9px] text-red-500/80">{errorText}</p>
			)}
			{/* Fallback tap target (some devices mishold pointerdown). */}
			<button
				type="button"
				onClick={handlePress}
				disabled={isUploading}
				className="font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500 underline-offset-2 hover:text-slate-600 dark:text-slate-300 hover:underline disabled:opacity-40">
				Tap to {isRecording ? 'stop' : 'report'}
			</button>
		</div>
	);
}
