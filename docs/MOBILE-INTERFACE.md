# Ergonomic Ground Staff Interaction Layer

This document delivers the production-ready code for the field interface layer (`src/components/mobile/`). Designed for 80,000-seat stadium environments, these components place critical operational triggers directly within the lower 40% thumb-interaction zone and enforce absolute button-disabling states to handle spotty, high-density cellular networks.

---

## 1. Tactical Voice Capture Node (`VoiceIngest.tsx`)

This component binds directly to the native browser MediaRecorder API, converting voice captures to structured server packets while preventing accidental multi-tap packet spamming over choked networks.

```tsx
// src/components/mobile/VoiceIngest.tsx
import React, { useState, useRef } from 'react';
import { sendAudioToTriageEngine } from '../../services/whisper';

interface VoiceIngestProps {
	onTriageComplete: (analysisPayload: any) => void;
	onExtractionFailure: (errorText: string) => void;
}

type RecordingState = 'IDLE' | 'RECORDING' | 'UPLOADING' | 'SUCCESS' | 'ERROR';

export const VoiceIngest: React.FC<VoiceIngestProps> = ({ onTriageComplete, onExtractionFailure }) => {
	const [engineState, setEngineState] = useState<RecordingState>('IDLE');
	const [runtimeFeedback, setRuntimeFeedback] = useState<string>('');

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioChunksRef = useRef<Blob[]>([]);

	const startAcousticCapture = async () => {
		audioChunksRef.current = [];
		try {
			const liveStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});

			// Enforce lightweight compressed webm configuration constraints
			const recordingOptions = { mimeType: 'audio/webm;codecs=opus' };
			const recorder = new MediaRecorder(liveStream, recordingOptions);

			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			recorder.onstop = async () => {
				const consolidatedAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

				// Terminate active mic hardware lines instantly
				liveStream.getTracks().forEach((track) => track.stop());

				await dispatchAudioPayload(consolidatedAudioBlob);
			};

			recorder.start(250); // Slice audio stream into 250ms byte frames
			setEngineState('RECORDING');
			setRuntimeFeedback('LISTENING TO INCIDENT RECORD...');
		} catch (hardwareError) {
			console.error('Microphone allocation failure:', hardwareError);
			setEngineState('ERROR');
			setRuntimeFeedback('MIC ACCESS DENIED. REVERT TO MANUAL INPUT.');
			onExtractionFailure('Hardware interface allocation blocked.');
		}
	};

	const stopAcousticCapture = () => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
			mediaRecorderRef.current.stop();
		}
	};

	const dispatchAudioPayload = async (audioBlob: Blob) => {
		// Throttling State Lock: Intercepts multi-tap execution attempts over slow arrays
		setEngineState('UPLOADING');
		setRuntimeFeedback('TRANSMITTING OVER STADIUM NETWORKS...');

		try {
			const triageResult = await sendAudioToTriageEngine(audioBlob);
			setEngineState('SUCCESS');
			setRuntimeFeedback('INCIDENT LOGGED SUCCESSFULLY');
			onTriageComplete(triageResult);

			// Auto-reset state matrix back to entry parameters after visual feedback delay
			setTimeout(() => {
				setEngineState('IDLE');
				setRuntimeFeedback('');
			}, 2000);
		} catch (pipelineError: any) {
			setEngineState('ERROR');
			setRuntimeFeedback('TRANSMISSION TIMEOUT. RETRYING...');
			onExtractionFailure(pipelineError.message || 'Network pipe processing failure.');
		}
	};

	return (
		<div className="w-full bg-slate-900 border-t border-slate-800 p-6 rounded-t-2xl shadow-2xl pb-10">
			<div className="flex flex-col items-center justify-center space-y-4">
				{/* Real-time Visual Status Indicator Context Panel */}
				<div className="w-full text-center">
					<span
						className={`text-xs font-mono font-bold tracking-widest uppercase px-3 py-1 rounded-full
            ${engineState === 'RECORDING' ? 'bg-red-500/20 text-red-400 animate-pulse' : ''}
            ${engineState === 'UPLOADING' ? 'bg-amber-500/20 text-amber-400' : ''}
            ${engineState === 'SUCCESS' ? 'bg-green-500/20 text-green-400' : ''}
            ${engineState === 'ERROR' ? 'bg-rose-500/20 text-rose-500' : ''}
            ${engineState === 'IDLE' ? 'bg-slate-800 text-slate-400' : ''}
          `}>
						{engineState}
					</span>
					<p className="mt-2 text-sm font-bold tracking-wide text-slate-200 min-h-[20px]">
						{runtimeFeedback || 'PRESS AND HOLD BUTTON TO DISPATCH INTERVENTION'}
					</p>
				</div>

				{/* Tactical Large Format Ergonomic Thumb Target Button */}
				<button
					onMouseDown={startAcousticCapture}
					onMouseUp={stopAcousticCapture}
					onTouchStart={(e) => {
						e.preventDefault();
						startAcousticCapture();
					}}
					onTouchEnd={(e) => {
						e.preventDefault();
						stopAcousticCapture();
					}}
					disabled={engineState === 'UPLOADING' || engineState === 'SUCCESS'}
					className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-150 select-none touch-none active:scale-95
            ${
							engineState === 'RECORDING'
								? 'bg-red-600 shadow-[0_0_40px_rgba(220,38,38,0.6)] ring-4 ring-red-400/30'
								: 'bg-blue-600 shadow-lg shadow-blue-950/50'
						}
            disabled:bg-slate-800 disabled:shadow-none disabled:scale-100 disabled:cursor-not-allowed
          `}>
					{engineState === 'UPLOADING' ? (
						<div className="w-8 h-8 border-4 border-slate-400 border-t-white rounded-full animate-spin" />
					) : (
						<svg
							className={`w-12 h-12 text-white ${engineState === 'RECORDING' ? 'scale-110' : ''}`}
							fill="currentColor"
							viewBox="0 0 24 24">
							<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
							<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
						</svg>
					)}
				</button>
			</div>
		</div>
	);
};
```

---

## 2. Dynamic 3-Tap Failsafe Intake Drawer (`ManualTriageDrawer.tsx`)

When massive environmental crowd noise compromises acoustic transcription parsing clarity, this fallback bottom-sheet component enables rapid manual incident logging in exactly 3 precise taps.

```tsx
// src/components/mobile/ManualTriageDrawer.tsx
import React, { useState } from 'react';

interface ManualTriageData {
	category: 'SECURITY' | 'MEDICAL' | 'CROWD' | 'FACILITIES';
	severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
	locationSector: string;
}

interface ManualTriageDrawerProps {
	onFormSubmit: (data: ManualTriageData) => Promise<void>;
	onClose: () => void;
}

export const ManualTriageDrawer: React.FC<ManualTriageDrawerProps> = ({ onFormSubmit, onClose }) => {
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [networkLock, setNetworkLock] = useState<boolean>(false);
	const [formData, setFormData] = useState<Partial<ManualTriageData>>({});

	const CATEGORIES: Array<ManualTriageData['category']> = ['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES'];
	const SEVERITIES: Array<ManualTriageData['severity']> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
	const TARGET_SECTORS = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'];

	const handleSelection = async (key: keyof ManualTriageData, value: string) => {
		const updatedState = { ...formData, [key]: value };
		setFormData(updatedState);

		if (step === 1) {
			setStep(2);
		} else if (step === 2) {
			setStep(3);
		} else if (step === 3) {
			// Execute the third and final data transmission payload bind
			setNetworkLock(true);
			try {
				await onFormSubmit(updatedState as ManualTriageData);
				onClose();
			} catch (err) {
				console.error('Manual form logging push exception:', err);
				setNetworkLock(false); // Release validation freeze if request network breaks
			}
		}
	};

	return (
		<div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center backdrop-blur-sm">
			<div className="w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl pb-12">
				{/* Header Metadata Summary Track */}
				<div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
					<div>
						<h2 className="text-md font-bold tracking-wider text-slate-100 uppercase">FAILSAFE MANUAL INTAKE</h2>
						<p className="text-xs font-mono text-slate-400 mt-0.5">STEP {step} OF 3: SELECT ACTIVE VECTOR TARGET</p>
					</div>
					<button
						onClick={onClose}
						disabled={networkLock}
						className="p-2 rounded-full bg-slate-800 text-slate-400 active:bg-slate-700 disabled:opacity-30">
						✕
					</button>
				</div>

				{/* Dynamic 3-Step Selection Grid Matrix */}
				<div className="min-h-[220px]">
					{networkLock ? (
						<div className="flex flex-col items-center justify-center h-[220px] space-y-3">
							<div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
							<p className="text-xs font-mono text-blue-400 uppercase tracking-widest animate-pulse">
								SYNCING STATE AT THE EDGE...
							</p>
						</div>
					) : (
						<>
							{/* STEP 1: CATEGORY ALLOCATION SELECTION TRACK */}
							{step === 1 && (
								<div className="grid grid-cols-2 gap-3">
									{CATEGORIES.map((cat) => (
										<button
											key={cat}
											onClick={() => handleSelection('category', cat)}
											className="p-5 rounded-xl border-2 border-slate-800 bg-slate-950 text-slate-200 font-bold text-sm tracking-wider active:bg-blue-900 active:border-blue-500 transition-colors uppercase">
											{cat}
										</button>
									))}
								</div>
							)}

							{/* STEP 2: THREAT SEVERITY ALLOCATION TRACK */}
							{step === 2 && (
								<div className="grid grid-cols-2 gap-3">
									{SEVERITIES.map((sev) => (
										<button
											key={sev}
											onClick={() => handleSelection('severity', sev)}
											className={`p-5 rounded-xl border-2 border-slate-800 bg-slate-950 font-bold text-sm tracking-wider active:scale-95 transition-all uppercase
                        ${sev === 'CRITICAL' ? 'text-red-400 active:bg-red-950 active:border-red-600' : ''}
                        ${sev === 'HIGH' ? 'text-amber-400 active:bg-amber-950 active:border-amber-600' : ''}
                        ${sev === 'MEDIUM' ? 'text-yellow-400 active:bg-yellow-950 active:border-yellow-600' : ''}
                        ${sev === 'LOW' ? 'text-slate-400 active:bg-slate-800 active:border-slate-600' : ''}
                      `}>
											{sev}
										</button>
									))}
								</div>
							)}

							{/* STEP 3: PHYSICAL LOCATION STADIUM AREA SECTOR ALLOCATION TRACK */}
							{step === 3 && (
								<div className="grid grid-cols-3 gap-2">
									{TARGET_SECTORS.map((sector) => (
										<button
											key={sector}
											onClick={() => handleSelection('locationSector', sector)}
											className="p-4 rounded-lg border border-slate-800 bg-slate-950 text-xs font-mono font-bold text-slate-300 active:bg-green-900 active:border-green-500 transition-colors">
											{sector}
										</button>
									))}
								</div>
							)}
						</>
					)}
				</div>

				{/* Back navigation step interceptor hook */}
				{step > 1 && !networkLock && (
					<button
						onClick={() => setStep((prev) => (prev - 1) as any)}
						className="mt-4 w-full py-2.5 bg-slate-800 rounded-xl text-xs font-bold tracking-widest text-slate-400 uppercase active:bg-slate-750 transition-colors">
						← RETURN TO PREVIOUS PARAMETER
					</button>
				)}
			</div>
		</div>
	);
};
```

```

```
