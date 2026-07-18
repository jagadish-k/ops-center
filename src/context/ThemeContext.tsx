/**
 * ThemeContext — three-state aesthetic toggle for the platform.
 *
 * Modes:
 *   - 'flat-dark'  : Current dark theme (slate-950 bg, flat surfaces). Default.
 *   - 'neu-dark'   : Neumorphic dark (slate-800 bg, dual-shadow surfaces).
 *   - 'neu-light'  : Neumorphic light (#e0e8f6 bg, dual-shadow surfaces,
 *                    dark text on light background).
 *
 * Architecture (ADR: grilling session decisions A3+B2+E3+F2):
 *   - React context holds the current theme + setter.
 *   - On change, writes data-theme="..." to <html> and toggles the
 *     `dark` class (Tailwind v4 dark: prefix).
 *   - Persists to localStorage so the choice survives refresh.
 *   - Components use useTheme() to get { theme, setTheme, cycleTheme }.
 *   - Neumorphic utility classes (.neu-raised etc.) are CSS-scoped to
 *     [data-theme] attributes — they activate/deactivate automatically.
 */
import { createContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export type ThemeMode = 'flat-dark' | 'neu-dark' | 'neu-light';

const THEME_KEY = 'stadiumops_theme';
const DEFAULT_THEME: ThemeMode = 'flat-dark';

const THEME_ORDER: ThemeMode[] = ['flat-dark', 'neu-dark', 'neu-light'];

interface ThemeContextValue {
	theme: ThemeMode;
	setTheme: (mode: ThemeMode) => void;
	cycleTheme: () => void;
	/** True when neumorphism is active (neu-dark or neu-light). */
	isNeumorphic: boolean;
	/** True when the background is dark (flat-dark or neu-dark). */
	isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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

	const value: ThemeContextValue = {
		theme,
		setTheme,
		cycleTheme,
		isNeumorphic: theme === 'neu-dark' || theme === 'neu-light',
		isDark: theme !== 'neu-light',
	};

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
