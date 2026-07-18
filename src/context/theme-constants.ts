/**
 * Theme constants, types, context object, and useTheme hook.
 *
 * Lives in a .ts file (not .tsx) so the react-refresh/only-export-components
 * ESLint rule doesn't complain about non-component exports.
 *
 * Everything theme-related that isn't a React component lives here.
 * The ThemeProvider component lives in ThemeContext.tsx and imports
 * the context object from this file.
 */
import { createContext, useContext } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThemeMode = 'flat-dark' | 'neu-dark' | 'neu-light';

export interface ThemeContextValue {
	theme: ThemeMode;
	setTheme: (mode: ThemeMode) => void;
	cycleTheme: () => void;
	/** True when neumorphism is active (neu-dark or neu-light). */
	isNeumorphic: boolean;
	/** True when the background is dark (flat-dark or neu-dark). */
	isDark: boolean;
}

// ─── Context object ──────────────────────────────────────────────────────────

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ─── Constants ───────────────────────────────────────────────────────────────

export const THEME_KEY = 'stadiumops_theme';
export const DEFAULT_THEME: ThemeMode = 'flat-dark';
export const THEME_ORDER: ThemeMode[] = ['flat-dark', 'neu-dark', 'neu-light'];

export const THEME_LABELS: Record<ThemeMode, string> = {
	'flat-dark': 'Flat Dark',
	'neu-dark': 'Neu Dark',
	'neu-light': 'Neu Light',
};

export const THEME_ICONS: Record<ThemeMode, string> = {
	'flat-dark': '◉',
	'neu-dark': '◐',
	'neu-light': '○',
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) {
		throw new Error('useTheme must be used within a ThemeProvider.');
	}
	return ctx;
}
