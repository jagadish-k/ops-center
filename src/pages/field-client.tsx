/**
 * Field Client page — the mobile staff surface.
 *
 * Guards on role (staff). Mounts the ActiveOpsProvider and renders the FieldShell.
 * Disconnect signs the operator out and returns to the auth gate.
 */
import { Navigate } from 'react-router';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ActiveOpsProvider } from '@/context/ActiveOpsContext';
import { FieldShell } from '@/components/mobile/FieldShell';

export default function FieldClient() {
	const { claims, loading, signOut } = useAuth();
	const { can, phoneNumber, tenantId } = usePermissions();

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

	const staffPhone = phoneNumber ?? claims.tenantId;

	return (
		<ActiveOpsProvider tenantId={tenantId ?? claims.tenantId}>
			<FieldShell
				staffPhone={staffPhone}
				tenantId={tenantId ?? claims.tenantId}
				onDisconnect={signOut}
			/>
		</ActiveOpsProvider>
	);
}
