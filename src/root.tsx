// src/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './index.css'; // Imports Tailwind v4 and HeroUI v3 styles

// 1. Global Shell Layout (Document Structure)
export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html
			lang="en"
			className="dark">
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1"
				/>
				<Meta />
				<Links />
			</head>
			<body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

// 2. Main App Component (Required: Renders the matched route layout)
export default function App() {
	return <Outlet />;
}

// 3. Hydration Fallback (Crucial for SPA mode)
export function HydrateFallback() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-50">
			<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
			<p className="text-sm font-medium tracking-wide text-slate-400">Initializing Grid Matrix...</p>
		</div>
	);
}
