/**
 * ErrorBoundary — wraps a subtree, catches render errors, shows a fallback
 * with a retry button.
 *
 * Per-tab boundaries prevent one broken tab from killing the whole Control
 * Room. The top-level boundary (in pages/control-room.tsx) catches errors
 * that escape the tab boundaries.
 *
 * Uses react-error-boundary under the hood; this file provides a typed
 * wrapper + a consistent fallback UI matching the platform's design system.
 */
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { Button } from '@heroui/react';

interface ErrorFallbackProps {
	error: Error;
	resetErrorBoundary: () => void;
	/** Optional label for the retry button. Defaults to "Retry". */
	retryLabel?: string;
	/** Optional message shown above the error details. */
	hint?: string;
}

export function ErrorFallback({
	error,
	resetErrorBoundary,
	retryLabel = 'Retry',
	hint,
}: ErrorFallbackProps) {
	return (
		<div
			role="alert"
			className="flex flex-col items-center justify-center gap-3 rounded border border-red-500/40 bg-red-50 p-6 text-center dark:bg-red-950/20"
		>
			<div className="text-2xl">⚠️</div>
			<h3 className="font-mono text-sm font-bold uppercase tracking-widest text-red-700 dark:text-red-300">
				{hint ?? 'Something broke'}
			</h3>
			<p className="max-w-md text-xs text-slate-600 dark:text-slate-400">
				{error.message || 'An unexpected error occurred while rendering this section.'}
			</p>
			{process.env.NODE_ENV !== 'production' && (
				<details className="max-w-md text-left text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">
					<summary className="cursor-pointer">Stack trace</summary>
					<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{error.stack}</pre>
				</details>
			)}
			<Button size="sm" variant="secondary" onPress={resetErrorBoundary} className="neu-raised-sm neu-hover neu-active">
				{retryLabel}
			</Button>
		</div>
	);
}

interface ErrorBoundaryProps {
	children: React.ReactNode;
	/** Identifier shown in the fallback UI for context. */
	name?: string;
	/** Reset keys — when these change, the boundary resets. Useful for
	 * retrying after data refetches. */
	resetKeys?: unknown[];
	/** Called when an error is caught. Useful for logging. */
	onError?: (error: Error, info: { componentStack: string }) => void;
	/** Override the default fallback. */
	fallback?: React.ReactNode;
}

export function ErrorBoundary({
	children,
	name,
	resetKeys,
	onError,
	fallback,
}: ErrorBoundaryProps) {
	const handleError = (error: Error, info: { componentStack: string | null }) => {
		// Always log to console — future: hook into Sentry / equivalent.
		console.error(`[ErrorBoundary${name ? `: ${name}` : ''}]`, error, info);
		onError?.(error, { componentStack: info.componentStack ?? '' });
	};

	return (
		<ReactErrorBoundary
			FallbackComponent={(props) =>
				fallback ?? (
					<ErrorFallback
						{...props}
						error={props.error}
						resetErrorBoundary={props.resetErrorBoundary}
						hint={name ? `${name} failed to load` : undefined}
					/>
				)
			}
			onError={handleError}
			resetKeys={resetKeys}
		>
			{children}
		</ReactErrorBoundary>
	);
}
