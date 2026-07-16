/**
 * OTP Authentication Gateway — HeroUI v3 component (ADR-0003).
 *
 * Two-step passwordless flow:
 *   Step 1: Enter E.164 phone number → request OTP via SMS.
 *   Step 2: Enter 6-digit code → verify → receive JWT.
 *
 * High-contrast dark theme for glare-resistant field use (CODE-DESIGN.md §4).
 * Submit button in the lower thumb zone for one-handed mobile operation.
 */
import { useState, type FormEvent } from 'react';
import { Input, Button, Spinner } from '@heroui/react';
import { useAuth, isApiError } from '@/context/AuthContext';

type Step = 'phone' | 'code';

export function OtpGateway() {
	const { sendOtp, signInWithOtp } = useAuth();
	const [step, setStep] = useState<Step>('phone');
	const [phoneNumber, setPhoneNumber] = useState('');
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [isPending, setIsPending] = useState(false);
	const [devCode, setDevCode] = useState<string | null>(null);

	const handlePhoneSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError('');

		// Client-side E.164 validation (server re-validates).
		if (!/^\+\d{6,15}$/.test(phoneNumber)) {
			setError('Enter a valid E.164 phone number (e.g., +14155552671).');
			return;
		}

		setIsPending(true);
		try {
			// requestOtp returns { status, devCode? } — devCode only in dev mode.
			const result = await sendOtp(phoneNumber);
			if (result.devCode) setDevCode(result.devCode);
			setStep('code');
		} catch (err) {
			setError(isApiError(err) ? err.message : 'Failed to send code. Try again.');
		} finally {
			setIsPending(false);
		}
	};

	const handleCodeSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError('');

		if (!/^\d{6}$/.test(code)) {
			setError('Enter the 6-digit code.');
			return;
		}

		setIsPending(true);
		try {
			await signInWithOtp(phoneNumber, code);
			// AuthContext will update and the router will swap surfaces.
		} catch (err) {
			setError(isApiError(err) ? err.message : 'Verification failed. Try again.');
			setCode('');
		} finally {
			setIsPending(false);
		}
	};

	const handleBack = () => {
		setStep('phone');
		setCode('');
		setError('');
		setDevCode(null);
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 font-sans">
			<div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
				{/* Header */}
				<div className="mb-6 text-center">
					<h1 className="text-xl font-black uppercase tracking-wider text-slate-100">
						Stadium Ops
					</h1>
					<p className="mt-1 font-mono text-xs text-slate-400">
						{step === 'phone' ? 'Identity Verification' : 'Enter Access Code'}
					</p>
				</div>

				{/* Error banner */}
				{error && (
					<div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 p-2.5 text-center font-mono text-xs font-bold uppercase text-red-500">
						{error}
					</div>
				)}

				{/* Dev mode code hint */}
				{devCode && (
					<div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 p-2.5 text-center font-mono text-xs text-amber-400">
						Dev mode — code: <span className="font-bold tracking-widest">{devCode}</span>
					</div>
				)}

				{step === 'phone' ? (
					<form onSubmit={handlePhoneSubmit} className="space-y-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor="phone-input"
								className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">
								E.164 Phone Number
							</label>
							<Input
								id="phone-input"
								type="tel"
								placeholder="+14155552671"
								value={phoneNumber}
								onChange={(e) => setPhoneNumber(e.target.value)}
								disabled={isPending}
								fullWidth
								className="rounded-xl border border-slate-800 bg-slate-950 font-mono text-sm text-slate-100 placeholder-slate-700 focus:border-blue-500"
							/>
						</div>
						<Button
							type="submit"
							fullWidth
							size="lg"
							isDisabled={isPending || !phoneNumber}
							isPending={isPending}
							className="font-bold uppercase tracking-widest">
							{({ isPending: pending }) => (
								<>
									{pending ? <Spinner color="current" size="sm" /> : null}
									{pending ? 'Sending...' : 'Send Code'}
								</>
							)}
						</Button>
					</form>
				) : (
					<form onSubmit={handleCodeSubmit} className="space-y-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor="code-input"
								className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">
								6-Digit Code
							</label>
							<Input
								id="code-input"
								type="text"
								inputMode="numeric"
								maxLength={6}
								placeholder="000000"
								value={code}
								onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
								disabled={isPending}
								fullWidth
								className="rounded-xl border border-slate-800 bg-slate-950 text-center font-mono text-lg tracking-widest text-slate-100 placeholder-slate-700 focus:border-blue-500"
							/>
						</div>
						<Button
							type="submit"
							fullWidth
							size="lg"
							isDisabled={isPending || code.length !== 6}
							isPending={isPending}
							className="font-bold uppercase tracking-widest">
							{({ isPending: pending }) => (
								<>
									{pending ? <Spinner color="current" size="sm" /> : null}
									{pending ? 'Verifying...' : 'Verify & Access'}
								</>
							)}
						</Button>
						<button
							type="button"
							onClick={handleBack}
							disabled={isPending}
							className="w-full pt-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-30">
							← Back to phone
						</button>
					</form>
				)}
			</div>
		</div>
	);
}
