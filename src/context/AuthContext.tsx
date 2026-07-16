/**
 * Authentication context — manages JWT session state on the client (ADR-0003).
 *
 * On mount, loads the stored JWT and decodes its claims for UI rendering.
 * The claims are used ONLY to decide which surface to render (Control Room
 * vs Field Client). Every server-side API call re-verifies the JWT signature —
 * these client-decoded claims are never trusted for authorization.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { JwtClaims } from '@/types';
import {
	getAuthToken,
	setAuthToken,
	clearAuthToken,
	decodeClaims,
	requestOtp,
	verifyOtp,
	type ApiError,
	type RequestOtpResponse,
} from '@/services/api';

interface AuthContextValue {
	/** The raw JWT string, or null if signed out. */
	token: string | null;
	/** Decoded claims (UI rendering only — NOT verified client-side). */
	claims: JwtClaims | null;
	/** True while the initial session load is in progress. */
	loading: boolean;
	/** Requests an OTP code to be sent to the phone number. */
	sendOtp: (phoneNumber: string) => Promise<RequestOtpResponse>;
	/** Verifies the OTP code, stores the JWT, and sets claims. */
	signInWithOtp: (phoneNumber: string, code: string) => Promise<void>;
	/** Clears the token and claims. */
	signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
	const [token, setToken] = useState<string | null>(null);
	const [claims, setClaims] = useState<JwtClaims | null>(null);
	const [loading, setLoading] = useState(true);

	// On mount: hydrate from localStorage if a valid (non-expired) token exists.
	useEffect(() => {
		const stored = getAuthToken();
		if (stored) {
			const decoded = decodeClaims(stored);
			// Check expiry (exp is in seconds). If expired, clear it.
			if (decoded && decoded.exp * 1000 > Date.now()) {
				setToken(stored);
				setClaims(decoded);
			} else {
				clearAuthToken();
			}
		}
		setLoading(false);
	}, []);

	const sendOtp = useCallback(async (phoneNumber: string): Promise<RequestOtpResponse> => {
		return requestOtp(phoneNumber);
	}, []);

	const signInWithOtp = useCallback(
		async (phoneNumber: string, code: string): Promise<void> => {
			const { token: jwt, claims: decoded } = await verifyOtp(phoneNumber, code);
			setAuthToken(jwt);
			setToken(jwt);
			setClaims(decoded);
		},
		[],
	);

	const signOut = useCallback(() => {
		clearAuthToken();
		setToken(null);
		setClaims(null);
	}, []);

	const value: AuthContextValue = {
		token,
		claims,
		loading,
		sendOtp,
		signInWithOtp,
		signOut,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to access the auth context. Must be used within an AuthProvider. */
export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider.');
	}
	return context;
}

/** Type guard for ApiError thrown by the API service. */
export function isApiError(err: unknown): err is ApiError {
	return err instanceof Error && err.name === 'ApiError';
}
