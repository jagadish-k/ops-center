/**
 * ThemeProvider component — the ONLY export from this .tsx file.
 *
 * All types, constants, the context object, and the useTheme hook live in
 * theme-constants.ts (a .ts file, exempt from react-refresh rules).
 *
 * Architecture: A3+B2+E3+F2 (grilling session decisions).
 */
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
	ThemeContext,
	THEME_KEY,
	DEFAULT_THEME,
	THEME_ORDER,
	type ThemeMode,
} from './theme-constants';

/** Apply the theme to the DOM (<html> element). */
function applyThemeToDOM(theme: ThemeMode): void {
	const root = document.documentElement;
	root.dataset.theme = theme;

	// Tailwind dark: prefix: active for flat-dark and neu-dark, inactive for light themes.
	if (theme === 'neu-light' || theme === 'flat-light') {
		root.classList.remove('dark');
	} else {
		root.classList.add('dark');
	}

	// Set the body background color directly — this is the baseline that
	// neumorphic shadows are calibrated against.
	// NOTE: We now rely on Tailwind's dark: prefix and CSS variables in neumorphism.css
	// to manage the body background color, so we no longer apply inline styles here.
	document.body.style.backgroundColor = '';
	document.body.style.color = '';
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
	const [theme, setThemeState] = useState<ThemeMode>(() => {
		try {
			const stored = localStorage.getItem(THEME_KEY) as ThemeMode | null;
			return stored && THEME_ORDER.includes(stored) ? stored : DEFAULT_THEME;
		} catch {
			return DEFAULT_THEME;
		}
	});

	// Apply to DOM on mount + whenever theme changes.
	useEffect(() => {
		applyThemeToDOM(theme);
		try {
			localStorage.setItem(THEME_KEY, theme);
		} catch {
			// localStorage unavailable — non-fatal.
		}
	}, [theme]);

	const setTheme = useCallback((mode: ThemeMode) => {
		setThemeState(mode);
	}, []);

	const cycleTheme = useCallback(() => {
		setThemeState((prev) => {
			const idx = THEME_ORDER.indexOf(prev);
			return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
		});
	}, []);

	const value = {
		theme,
		setTheme,
		cycleTheme,
		isNeumorphic: theme === 'neu-dark' || theme === 'neu-light',
		isDark: theme === 'flat-dark' || theme === 'neu-dark',
	};

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
