/**
 * Field Client page — the mobile staff surface.
 *
 * Guards on role (staff). Mounts the ActiveOpsProvider and renders the FieldShell.
 * Disconnect signs the operator out and returns to the auth gate.
 */
import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { ActiveOpsProvider } from '../context/ActiveOpsContext';
import { FieldShell } from '../components/mobile/FieldShell';

export default function FieldClient() {
	const { claims, loading, signOut } = useAuth();

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
				<p className="font-mono text-xs uppercase tracking-widest">Authorizing…</p>
			</div>
		);
	}

	if (!claims) return <Navigate to="/" replace />;
	// Staff surface is for the 'staff' role; admins who land here are bounced.
	if (claims.role !== 'staff') {
		return <Navigate to="/" replace />;
	}

	const staffPhone = claims.phoneNumber ?? claims.tenantId; // phone is the staff id

	return (
		<ActiveOpsProvider tenantId={claims.tenantId}>
			<FieldShell
				staffPhone={staffPhone}
				tenantId={claims.tenantId}
				onDisconnect={signOut}
			/>
		</ActiveOpsProvider>
	);
}
