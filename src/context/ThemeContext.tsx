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

	// Tailwind dark: prefix: active for flat-dark and neu-dark, inactive for neu-light.
	if (theme === 'neu-light') {
		root.classList.remove('dark');
	} else {
		root.classList.add('dark');
	}

	// Set the body background color directly — this is the baseline that
	// neumorphic shadows are calibrated against.
	const bgColors: Record<ThemeMode, string> = {
		'flat-dark': '#020617',  // slate-950
		'neu-dark': '#1e293b',   // slate-800
		'neu-light': '#e0e8f6',  // soft blue-grey
	};
	document.body.style.backgroundColor = bgColors[theme];
	document.body.style.color = theme === 'neu-light' ? '#1e293b' : '#f1f5f9';
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
		isDark: theme !== 'neu-light',
	};

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
