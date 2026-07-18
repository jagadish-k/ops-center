import { useContext } from 'react';
import { ThemeContext, type ThemeMode, type ThemeContextValue } from './ThemeContext';

export type { ThemeMode, ThemeContextValue };

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

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) {
		throw new Error('useTheme must be used within a ThemeProvider.');
	}
	return ctx;
}
