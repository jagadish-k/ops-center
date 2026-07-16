/**
 * Auth Gate — the entry surface mounted at "/".
 *
 * Decides what to render based on the JWT session state:
 *   loading      → spinner
 *   no session   → <OtpGateway />
 *   admin/super  → redirect to /control
 *   staff        → redirect to /field
 *
 * The redirect targets are UI hints only; every server function re-verifies the
 * JWT signature and role claims (ADR-0003).
 */
import { Navigate } from 'react-router';
import { Spinner } from '@heroui/react';
import { useAuth } from '../context/AuthContext';
import { OtpGateway } from '../components/auth/OtpGateway';

export default function AuthGate() {
	const { token, claims, loading } = useAuth();

	if (loading) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-50">
				<Spinner size="lg" />
				<p className="font-mono text-xs uppercase tracking-widest text-slate-500">
					Initializing Grid Matrix
				</p>
			</div>
		);
	}

	// No valid session — present the OTP login gateway.
	if (!token || !claims) {
		return <OtpGateway />;
	}

	// Route by role. Unknown roles fall back to the field surface.
	if (claims.role === 'admin' || claims.role === 'superadmin') {
		return <Navigate to="/control" replace />;
	}

	return <Navigate to="/field" replace />;
}
