import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Input, TextArea, Spinner } from '@heroui/react';
import { useTheme } from '@/context/theme-constants';

export default function LandingPage() {
	const navigate = useNavigate();
	const { theme, cycleTheme } = useTheme();

	const [formState, setFormState] = useState({ name: '', email: '', message: '' });
	const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setStatus('loading');
		
		try {
			// Placeholder webhook for Google Sheets integration
			// Replace with actual Google Apps Script URL later
			await fetch('https://script.google.com/macros/s/AKfycbz_placeholder_webhook/exec', {
				method: 'POST',
				mode: 'no-cors', // typically required for direct web-to-apps-script posts
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formState)
			});
			setStatus('success');
			setFormState({ name: '', email: '', message: '' });
		} catch {
			setStatus('error');
		}
	};

	return (
		<div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors duration-500 dark:bg-slate-950 dark:text-slate-50">
			{/* Navbar */}
			<header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/70 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/70">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 font-mono text-lg font-black text-white">S</div>
						<span className="font-mono text-lg font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">StadiumOps</span>
					</div>
					<div className="flex items-center gap-4">
						<button 
							onClick={cycleTheme}
							className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
							aria-label="Toggle theme"
						>
							{theme === 'flat-dark' && '🌙'}
							{theme === 'flat-light' && '☀️'}
							{theme === 'neu-dark' && '🌑'}
							{theme === 'neu-light' && '🌕'}
						</button>
						<Button 
							variant="primary" 
							className="font-bold shadow-lg shadow-blue-600/30 transition-all hover:scale-105"
							onPress={() => navigate('/login')}
						>
							Login / Platform Access
						</Button>
					</div>
				</div>
			</header>

			{/* Hero Section */}
			<main className="flex-1">
				<section className="relative overflow-hidden pt-32 pb-24 lg:pt-48 lg:pb-32">
					<div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-blue-900/20 via-slate-50/0 to-slate-50/0 dark:from-blue-600/10 dark:via-slate-950/0 dark:to-slate-950/0"></div>
					
					<div className="relative z-10 mx-auto max-w-7xl px-6 text-center">
						<h1 className="mx-auto max-w-4xl font-mono text-5xl font-black uppercase tracking-tight sm:text-7xl lg:text-8xl">
							<span className="block text-slate-900 dark:text-slate-100">Command The</span>
							<span className="block bg-linear-to-r from-blue-600 to-indigo-400 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-300">Unpredictable.</span>
						</h1>
						
						<p className="mx-auto mt-8 max-w-2xl text-lg text-slate-600 sm:text-xl dark:text-slate-400">
							Hardware-accelerated situational awareness for stadiums and mega-events. Map assets, dispatch staff, and resolve incidents in real-time.
						</p>
						
						<div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
							<Button 
								size="lg"
								variant="primary" 
								className="h-14 w-full px-8 text-lg font-bold shadow-2xl shadow-blue-600/40 sm:w-auto"
								onPress={() => navigate('/login')}
							>
								Launch Control Room
							</Button>
							<Button 
								size="lg"
								variant="outline"
								className="h-14 w-full border-2 border-slate-300 px-8 text-lg font-bold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 sm:w-auto"
								onPress={() => {
									document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
								}}
							>
								Request Demo
							</Button>
						</div>
					</div>
					
					{/* Abstract Grid Graphic */}
					<div className="mt-20 flex justify-center">
						<div className="relative h-64 w-full max-w-4xl overflow-hidden rounded-t-3xl border border-b-0 border-slate-300 bg-white/50 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
							<div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-size-[40px_40px] opacity-60 dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)]"></div>
							{/* Faux radar sweeping effect */}
							<div className="absolute left-1/2 top-full h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 animate-[spin_4s_linear_infinite] rounded-full border border-blue-500/30 bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(59,130,246,0.3)_360deg)]"></div>
						</div>
					</div>
				</section>

				{/* Features Section */}
				<section className="border-t border-slate-200 bg-white py-24 dark:border-slate-800 dark:bg-slate-900/20">
					<div className="mx-auto max-w-7xl px-6">
						<div className="mb-16 text-center">
							<h2 className="font-mono text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Core Engine</h2>
							<p className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">Military-grade situational awareness.</p>
						</div>
						
						<div className="grid gap-12 lg:grid-cols-3">
							<div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-950">
								<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-2xl text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">🗺️</div>
								<h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tactical Radar</h3>
								<p className="text-slate-600 dark:text-slate-400">Hardware-accelerated 60fps canvas tracking thousands of staff members and incidents across a responsive 0-1000 coordinate grid.</p>
							</div>
							<div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-950">
								<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">⚡</div>
								<h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Real-Time Dispatch</h3>
								<p className="text-slate-600 dark:text-slate-400">Instantly deploy medical, security, and cleaning staff with single-click triage. Mobile field clients receive updates in milliseconds.</p>
							</div>
							<div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-950">
								<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 text-2xl text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">🎙️</div>
								<h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Voice Ingestion</h3>
								<p className="text-slate-600 dark:text-slate-400">Field staff can report incidents purely through voice. Natural language processing automatically categorizes and places incidents on the map.</p>
							</div>
						</div>
					</div>
				</section>

				{/* Contact Form Section */}
				<section id="contact" className="border-t border-slate-200 bg-slate-100 py-24 dark:border-slate-800 dark:bg-slate-950/50">
					<div className="mx-auto max-w-3xl px-6 text-center">
						<h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">Ready to secure your venue?</h2>
						<p className="mt-4 text-lg text-slate-600 dark:text-slate-400">Leave your details below and our deployment team will contact you for a technical demo.</p>
						
						<form onSubmit={handleSubmit} className="mx-auto mt-12 flex flex-col gap-4 text-left">
							<div className="grid gap-4 sm:grid-cols-2">
								<div>
									<label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
									<Input 
										id="name"
										required
										value={formState.name}
										onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
										placeholder="John Doe"
										className="w-full bg-white dark:bg-slate-900" 
									/>
								</div>
								<div>
									<label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Work Email</label>
									<Input 
										id="email"
										type="email"
										required
										value={formState.email}
										onChange={(e) => setFormState(prev => ({ ...prev, email: e.target.value }))}
										placeholder="john@stadium.com"
										className="w-full bg-white dark:bg-slate-900" 
									/>
								</div>
							</div>
							<div>
								<label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Venue Details & Requirements</label>
								<TextArea 
									id="message"
									required
									value={formState.message}
									onChange={(e) => setFormState(prev => ({ ...prev, message: e.target.value }))}
									placeholder="Tell us about your capacity, current systems, and timeline..."
									className="w-full bg-white dark:bg-slate-900"
									rows={4}
								/>
							</div>
							
							<Button 
								type="submit"
								size="lg"
								variant="primary"
								isDisabled={status === 'loading'}
								className="mt-4 w-full font-bold shadow-lg shadow-blue-600/30"
							>
								{status === 'loading' ? <Spinner size="sm" color="current" /> : 'Request Demo'}
							</Button>
							
							{status === 'success' && (
								<p className="mt-4 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
									Thank you! We have received your request and will be in touch shortly.
								</p>
							)}
							{status === 'error' && (
								<p className="mt-4 text-center text-sm font-medium text-red-600 dark:text-red-400">
									Something went wrong. Please try again later.
								</p>
							)}
						</form>
					</div>
				</section>
			</main>
			
			<footer className="border-t border-slate-200 py-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
				<p>© 2026 StadiumOps Grid Matrix. All rights reserved.</p>
			</footer>
		</div>
	);
}
