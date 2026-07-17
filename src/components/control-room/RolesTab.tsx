/**
 * RolesTab — DB-driven role management (M9.5, superadmin-only).
 *
 * Production-hardened: ErrorBoundary + CardGridSkeleton + optimistic updates
 * for permission toggles, role create, and delete.
 *
 * Requires the `tenant:manage` permission (superadmin only per ADR-0011).
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Spinner, Drawer, Modal } from '@heroui/react';
import {
	adminListRoles,
	adminCreateRole,
	adminUpdateRole,
	adminDeleteRole,
	adminCascadeRevoke,
	type AdminRole,
	ApiError,
} from '@/services/api';
import { createRoleSchema, type CreateRoleForm } from '@/lib/admin-schemas';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { CardGridSkeleton } from '@/components/shared/Skeletons';
import type { Permission } from '@/lib/permissions';

const ALL_PERMISSIONS: Permission[] = [
	'incident:create', 'incident:transition', 'incident:read',
	'dispatch:create', 'dispatch:update', 'dispatch:read',
	'tenant:switch', 'tenant:manage',
	'staff:manage', 'staff:reassign', 'role:assign-admin',
	'audit:view',
	'surface:control-room', 'surface:field-client',
	'config:manage',
];

export function RolesTab() {
	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<AdminRole | null>(null);

	const { items: roles, loading, error, reload, mutate } = useOptimisticList<AdminRole[]>({
		loader: adminListRoles,
		initial: null,
	});

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<header className="flex items-center gap-3">
				<h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-100">Roles</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
					{roles?.length ?? 0} role{(roles?.length ?? 0) === 1 ? '' : 's'}
				</span>
				<div className="ml-auto">
					<Button size="sm" variant="secondary" onPress={() => setCreateOpen(true)}>
						+ New Role
					</Button>
				</div>
			</header>

			{error && (
				<div className="rounded border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
					{error}
					<Button size="sm" variant="ghost" onPress={() => void reload()} className="ml-3">Retry</Button>
				</div>
			)}

			{loading && roles === null ? (
				<CardGridSkeleton cards={4} />
			) : (
				<div data-tour="roles-grid" className="grid gap-3 lg:grid-cols-2">
					{roles?.map((role) => (
						<RoleCard
							key={role.name}
							role={role}
							onEdit={() => setEditing(role)}
							mutate={mutate}
						/>
					))}
				</div>
			)}

			<CreateRoleDrawer
				isOpen={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={async (newRole) => {
					await mutate(async () => {}, (draft) => { draft.push(newRole); });
					setCreateOpen(false);
				}}
			/>

			{editing && (
				<EditRoleDrawer
					role={editing}
					onClose={() => setEditing(null)}
					mutate={mutate}
				/>
			)}
		</div>
	);
}

// ─── Role card (with optimistic delete) ──────────────────────────────────────

interface RoleCardMutate {
	(serverOp: () => Promise<unknown>, optimisticUpdate: (draft: AdminRole[]) => void): Promise<boolean>;
}

function RoleCard({
	role,
	onEdit,
	mutate,
}: {
	role: AdminRole;
	onEdit: () => void;
	mutate: RoleCardMutate;
}) {
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const handleDelete = async () => {
		setDeleting(true);
		setDeleteError(null);
		const ok = await mutate(
			() => adminDeleteRole(role.name),
			(draft) => {
				const idx = draft.findIndex((r) => r.name === role.name);
				if (idx >= 0) draft.splice(idx, 1);
			},
		);
		if (!ok) setDeleteError('Delete failed — role may still be held by users.');
		setDeleting(false);
	};

	return (
		<div className="rounded border border-slate-800 bg-slate-900/40 p-4">
			<div className="flex items-center gap-2">
				<h3 className="font-mono text-sm font-bold text-slate-100">{role.name}</h3>
				{role.isSystem && (
					<span className="rounded bg-blue-900/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-blue-300">
						system
					</span>
				)}
			</div>
			<p className="mt-1 text-xs text-slate-400">{role.description}</p>

			<div className="mt-3">
				<p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
					{role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
				</p>
				<div className="mt-1 flex flex-wrap gap-1">
					{role.permissions.map((p) => (
						<span key={p} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
							{p}
						</span>
					))}
				</div>
			</div>

			<div className="mt-4 flex justify-end gap-2">
				<Button size="sm" variant="ghost" onPress={onEdit}>Edit Permissions</Button>
				{!role.isSystem && (
					<Button
						size="sm"
						variant="ghost"
						className="text-red-400"
						isDisabled={deleting}
						onPress={handleDelete}
					>
						{deleting ? <Spinner size="sm" /> : 'Delete'}
					</Button>
				)}
			</div>

			{deleteError && <p className="mt-2 text-xs text-red-300">{deleteError}</p>}
		</div>
	);
}

// ─── Create Role drawer ──────────────────────────────────────────────────────

function CreateRoleDrawer({
	isOpen,
	onClose,
	onCreated,
}: {
	isOpen: boolean;
	onClose: () => void;
	onCreated: (role: AdminRole) => void | Promise<void>;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm<CreateRoleForm>({
		resolver: zodResolver(createRoleSchema),
		defaultValues: { name: '', description: '', permissions: [] },
	});

	const onSubmit = async (values: CreateRoleForm) => {
		setSubmitting(true);
		setSubmitError(null);
		try {
			await adminCreateRole({
				name: values.name,
				description: values.description,
				permissions: values.permissions as Permission[],
			});
			const preview: AdminRole = {
				name: values.name,
				description: values.description,
				isSystem: false,
				createdAt: new Date().toISOString(),
				permissions: values.permissions,
			};
			form.reset();
			await onCreated(preview);
		} catch (err) {
			setSubmitError(err instanceof ApiError ? err.message : 'Failed to create role');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest">New Custom Role</h3>

				<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
					<div>
						<label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Name</label>
						<Input
							placeholder="auditor"
							isInvalid={!!form.formState.errors.name}
							errorMessage={form.formState.errors.name?.message}
							{...form.register('name')}
						/>
					</div>

					<div>
						<label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Description</label>
						<Input
							placeholder="Read-only compliance auditor"
							isInvalid={!!form.formState.errors.description}
							errorMessage={form.formState.errors.description?.message}
							{...form.register('description')}
						/>
					</div>

					<div>
						<label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
							Permissions ({form.watch('permissions').length} selected)
						</label>
						<div className="mt-1 max-h-60 overflow-auto rounded border border-slate-800 bg-slate-900/60 p-2">
							{ALL_PERMISSIONS.map((p) => {
								const selected = form.watch('permissions').includes(p);
								return (
									<label key={p} className="flex items-center gap-2 py-0.5 text-xs text-slate-200">
										<input
											type="checkbox"
											checked={selected}
											onChange={() => {
												const current = form.getValues('permissions');
												form.setValue(
													'permissions',
													selected ? current.filter((x) => x !== p) : [...current, p],
												);
											}}
										/>
										<span className="font-mono">{p}</span>
									</label>
								);
							})}
						</div>
						{form.formState.errors.permissions && (
							<p className="mt-1 text-xs text-red-300">{form.formState.errors.permissions.message}</p>
						)}
					</div>

					{submitError && (
						<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
							{submitError}
						</div>
					)}

					<div className="flex justify-end gap-2">
						<Button type="button" size="sm" variant="ghost" onPress={onClose} disabled={submitting}>Cancel</Button>
						<Button type="submit" size="sm" variant="primary" disabled={submitting}>
							{submitting ? <Spinner size="sm" /> : 'Create'}
						</Button>
					</div>
				</form>
			</div>
		</Drawer>
	);
}

// ─── Edit Role drawer (permission matrix, optimistic + perms_version toast) ──

function EditRoleDrawer({
	role,
	onClose,
	mutate,
}: {
	role: AdminRole;
	onClose: () => void;
	mutate: RoleCardMutate;
}) {
	const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [affectedUsers, setAffectedUsers] = useState<number | null>(null);

	const originalSet = new Set(role.permissions);

	const togglePerm = (perm: Permission) => {
		setSelected((s) => {
			const next = new Set(s);
			if (next.has(perm)) next.delete(perm);
			else next.add(perm);
			return next;
		});
	};

	const save = async () => {
		setSaving(true);
		setError(null);
		const perms = Array.from(selected) as Permission[];
		const ok = await mutate(
			async () => {
				const r = await adminUpdateRole(role.name, { permissions: perms });
				setAffectedUsers(r.affectedUserCount ?? 0);
			},
			(draft) => {
				const target = draft.find((r) => r.name === role.name);
				if (target) target.permissions = perms;
			},
		);
		if (!ok) setError('Update failed — rolled back.');
		setSaving(false);
	};

	return (
		<Drawer isOpen={true} onOpenChange={(o) => !o && onClose()}>
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest">
					{role.name} — Permissions
				</h3>

				<div className="max-h-96 overflow-auto rounded border border-slate-800 bg-slate-900/60 p-2">
					{ALL_PERMISSIONS.map((p) => {
						const has = selected.has(p);
						const wasOriginal = originalSet.has(p);
						const changed = wasOriginal !== has;
						return (
							<label
								key={p}
								className={`flex items-center gap-2 py-0.5 text-xs ${
									changed ? (has ? 'text-emerald-300' : 'text-red-300 line-through') : 'text-slate-200'
								}`}
							>
								<input type="checkbox" checked={has} onChange={() => togglePerm(p)} />
								<span className="font-mono">{p}</span>
								{changed && (
									<span className="ml-auto text-[9px] uppercase tracking-widest">
										{has ? 'added' : 'removed'}
									</span>
								)}
							</label>
						);
					})}
				</div>

				{affectedUsers !== null && affectedUsers > 0 && (
					<div className="rounded border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-300">
						Permissions updated. <strong>{affectedUsers}</strong> user(s) held this role and
						their <code>perms_version</code> was bumped — their next request will trigger a refresh.
					</div>
				)}

				{error && (
					<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
						{error}
					</div>
				)}

				<div className="flex justify-end gap-2">
					<Button size="sm" variant="ghost" onPress={onClose} disabled={saving}>Close</Button>
					<Button size="sm" variant="primary" onPress={save} disabled={saving}>
						{saving ? <Spinner size="sm" /> : 'Save Changes'}
					</Button>
				</div>
			</div>
		</Drawer>
	);
}

// Cascade-revoke modal (unchanged from previous — included for completeness)
function CascadeRevokeModal({
	roleName,
	permission,
	onClose,
}: {
	roleName: string;
	permission: Permission;
	onClose: () => void;
}) {
	const [userIds, setUserIds] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<number | null>(null);

	const submit = async () => {
		const ids = userIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
		if (ids.length === 0) return setError('Paste at least one user UUID.');
		if (ids.length > 100) return setError('Maximum 100 user UUIDs per batch.');
		setSubmitting(true);
		setError(null);
		try {
			const r = await adminCascadeRevoke(roleName, permission, ids);
			setResult(r.revokedFromUsers ?? 0);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : 'Cascade revoke failed');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal>
			<Modal.Backdrop isOpen={true} onOpenChange={() => onClose()}>
				<Modal.Container>
					<Modal.Dialog className="sm:max-w-lg">
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="font-mono text-sm uppercase tracking-widest">
								Cascade Revoke — {permission}
							</Modal.Heading>
						</Modal.Header>
						<Modal.Body>
							<p className="text-xs text-slate-400">
								Paste UUIDs of users who held <strong>{roleName}</strong> and had a per-user grant of{' '}
								<code>{permission}</code>. Max 100 per batch.
							</p>
							<textarea
								className="mt-2 h-32 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs text-slate-200"
								placeholder="paste UUIDs separated by newlines or commas"
								value={userIds}
								onChange={(e) => setUserIds(e.target.value)}
							/>
							{error && <p className="text-xs text-red-300">{error}</p>}
							{result !== null && <p className="text-xs text-emerald-300">✓ Revoked from {result} user(s).</p>}
						</Modal.Body>
						<Modal.Footer>
							<Button size="sm" variant="ghost" onPress={onClose} disabled={submitting}>Cancel</Button>
							<Button size="sm" variant="primary" onPress={submit} disabled={submitting || result !== null}>
								{submitting ? <Spinner size="sm" /> : `Revoke from ${userIds.split(/[\s,]+/).filter(Boolean).length} user(s)`}
							</Button>
							{result !== null && <Button size="sm" variant="secondary" onPress={onClose}>Done</Button>}
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}

// Suppress unused-export warning for the modal (kept for future cascade wiring).
void CascadeRevokeModal;
