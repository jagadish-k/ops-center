/**
 * Control Room page — the admin/supervisor command surface.
 *
 * Guards on role (admin / superadmin); non-privileged roles are redirected to the
 * auth gate. Mounts the ActiveOpsProvider (diff-polling) and renders the
 * OperationalDashboard. A client-side tenant override lets superadmins switch
 * isolation boundaries without re-authenticating.
 *
 * Top-level ErrorBoundary catches fatal errors that escape the per-tab
 * boundaries inside OperationalDashboard (e.g., context-provider failures).
 */
import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ActiveOpsProvider } from '@/context/ActiveOpsContext';
import { OperationalDashboard } from '@/components/control-room/OperationalDashboard';
import { ErrorBoundary, ErrorFallback } from '@/components/shared/ErrorBoundary';
import { Button } from '@heroui/react';

export default function ControlRoom() {
	const { claims, loading, signOut } = useAuth();
	const { can, tenantId: jwtTenantId } = usePermissions();
	const [overrideTenantId, setOverrideTenantId] = useState<string | undefined>(undefined);

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
				<p className="font-mono text-xs uppercase tracking-widest">Authorizing…</p>
			</div>
		);
	}

	// No session or lacks control-room permission → back to the gate.
	if (!claims || !can('surface:control-room')) {
		return <Navigate to="/" replace />;
	}

	return (
		<ErrorBoundary
			name="Control Room"
			fallback={
				<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
					<div className="text-4xl">⚠️</div>
					<h1 className="font-mono text-lg font-black uppercase tracking-widest text-red-300">
						Control Room crashed
					</h1>
					<p className="max-w-md text-sm text-slate-400">
						A fatal error occurred. Sign out and back in to reset the session. If the
						problem persists, check the browser console for details.
					</p>
					<Button variant="secondary" onPress={signOut}>Sign Out</Button>
				</div>
			}
		>
			<ActiveOpsProvider tenantId={jwtTenantId ?? claims.tenant_id} overrideTenantId={overrideTenantId}>
				<OperationalDashboard onTenantChange={setOverrideTenantId} />
			</ActiveOpsProvider>
		</ErrorBoundary>
	);
}

// `ErrorFallback` re-exported for callers that want the default fallback
// outside this file.
void ErrorFallback;
