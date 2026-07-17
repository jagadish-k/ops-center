/**
 * Field Client page — the mobile staff surface.
 *
 * Guards on role (staff). Mounts the ActiveOpsProvider and renders the FieldShell.
 * Disconnect signs the operator out and returns to the auth gate.
 *
 * Post-ADR-0013: tenant_id and phone come from JWT claims directly (no
 * separate usePermissions() call needed for these display fields).
 */
import { Navigate } from 'react-router';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ActiveOpsProvider } from '@/context/ActiveOpsContext';
import { FieldShell } from '@/components/mobile/FieldShell';

export default function FieldClient() {
	const { claims, loading, signOut } = useAuth();
	const { can } = usePermissions();

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
				<p className="font-mono text-xs uppercase tracking-widest">Authorizing…</p>
			</div>
		);
	}

	if (!claims || !can('surface:field-client')) {
		return <Navigate to="/" replace />;
	}

	const staffPhone = claims.phone ?? 'unknown';
	const tenantId = claims.tenant_id;

	return (
		<ActiveOpsProvider tenantId={tenantId}>
			<FieldShell
				staffPhone={staffPhone}
				tenantId={tenantId}
				onDisconnect={signOut}
			/>
		</ActiveOpsProvider>
	);
}
