import { Button } from '@heroui/react';

function Home() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-900">
			<h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100">Vite + HeroUI v3 Setup</h1>
			<p className="text-slate-600 dark:text-slate-400">Tailwind CSS v4 is up and running!</p>

			{/* Testing a HeroUI Button */}
			<Button size="lg">HeroUI Button</Button>
		</div>
	);
}

export default Home;
