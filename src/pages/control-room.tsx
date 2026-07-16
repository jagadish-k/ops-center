/**
 * Control Room page — the admin/supervisor command surface.
 *
 * Guards on role (admin / superadmin); non-privileged roles are redirected to the
 * auth gate. Mounts the ActiveOpsProvider (diff-polling) and renders the
 * OperationalDashboard. A client-side tenant override lets superadmins switch
 * isolation boundaries without re-authenticating.
 */
import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ActiveOpsProvider } from '@/context/ActiveOpsContext';
import { OperationalDashboard } from '@/components/control-room/OperationalDashboard';

export default function ControlRoom() {
	const { claims, loading } = useAuth();
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
		<ActiveOpsProvider tenantId={jwtTenantId ?? claims.tenantId} overrideTenantId={overrideTenantId}>
			<OperationalDashboard onTenantChange={setOverrideTenantId} />
		</ActiveOpsProvider>
	);
}
