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
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { OtpGateway } from '@/components/auth/OtpGateway';

export default function AuthGate() {
	const { token, loading } = useAuth();
	const { isAuthenticated, can } = usePermissions();

	if (loading) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50">
				<Spinner size="lg" />
				<p className="font-mono text-xs uppercase tracking-widest text-slate-900 dark:text-slate-500">
					Initializing Grid Matrix
				</p>
			</div>
		);
	}

	// No valid session — present the OTP login gateway.
	if (!token || !isAuthenticated) {
		return <OtpGateway />;
	}

	// Route by permission. Control-room access → /control, else → /field.
	if (can('surface:control-room')) {
		return <Navigate to="/control" replace />;
	}

	return <Navigate to="/field" replace />;
}
