/**
 * TeamTab — staff management surface (M9.5).
 *
 * Lists all users with a membership in the active tenant. Supports:
 *   - Create new staff (react-hook-form + zod)
 *   - Edit name/status inline
 *   - Assign / revoke roles
 *   - Open per-user permission grants drawer
 *
 * Requires the `staff:manage` permission (admin + superadmin).
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Select, ListBox, Label, Drawer, Spinner, Checkbox, CheckboxGroup } from '@heroui/react';
import { usePermissions } from '@/hooks/usePermissions';
import {
	adminListUsers,
	adminCreateStaff,
	adminAssignRole,
	adminRevokeRole,
	adminUpdateUser,
	type AdminUser,
	type CreateStaffInput,
	ApiError,
} from '@/services/api';
import { createStaffSchema, STAFF_SPECIALTIES, STAFF_ZONES, type CreateStaffForm } from '@/lib/admin-schemas';

const SYSTEM_ROLES = ['admin', 'manager', 'staff'];

export function TeamTab() {
	const { isSuperadmin } = usePermissions();
	const [users, setUsers] = useState<AdminUser[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
	const [permsUser, setPermsUser] = useState<AdminUser | null>(null);

	const load = async () => {
		try {
			setLoadError(null);
			const list = await adminListUsers();
			setUsers(list);
		} catch (err) {
			setLoadError(err instanceof ApiError ? err.message : 'Failed to load users');
		}
	};

	if (users === null && !loadError) {
		void load();
		return (
			<div className="flex items-center justify-center py-12 text-slate-400">
				<Spinner size="md" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<header className="flex items-center gap-3">
				<h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-100">
					Team
				</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
					{users?.length ?? 0} member{(users?.length ?? 0) === 1 ? '' : 's'}
				</span>
				<div className="ml-auto">
					<Button size="sm" variant="secondary" onPress={() => setCreateOpen(true)}>
						+ Add Staff
					</Button>
				</div>
			</header>

			{loadError && (
				<div className="rounded border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
					{loadError}
					<Button size="sm" variant="ghost" onPress={load} className="ml-3">Retry</Button>
				</div>
			)}

			<div className="overflow-auto rounded border border-slate-800 bg-slate-900/40">
				<table className="w-full text-left text-xs">
					<thead className="border-b border-slate-800 bg-slate-900/60 font-mono uppercase tracking-widest text-slate-500">
						<tr>
							<th className="px-3 py-2">Phone</th>
							<th className="px-3 py-2">Name</th>
							<th className="px-3 py-2">Roles</th>
							<th className="px-3 py-2">Status</th>
							<th className="px-3 py-2 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{users?.map((u) => (
							<tr key={u.userId} className="border-b border-slate-800/60 hover:bg-slate-800/30">
								<td className="px-3 py-2 font-mono text-slate-300">{u.phone}</td>
								<td className="px-3 py-2 text-slate-100">{u.fullName}</td>
								<td className="px-3 py-2">
									<div className="flex flex-wrap gap-1">
										{u.roles.map((r) => (
											<span key={r} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-300">
												{r}
											</span>
										))}
									</div>
								</td>
								<td className="px-3 py-2">
									{u.status === 'active' ? (
										<span className="text-emerald-400">● active</span>
									) : (
										<span className="text-red-400">● disabled</span>
									)}
								</td>
								<td className="px-3 py-2 text-right">
									<Button size="sm" variant="ghost" onPress={() => setEditingUser(u)}>Edit</Button>
									<Button size="sm" variant="ghost" onPress={() => setPermsUser(u)}>Perms</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<CreateStaffDrawer
				isOpen={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={() => {
					setCreateOpen(false);
					void load();
				}}
				isSuperadmin={isSuperadmin}
			/>

			{editingUser && (
				<EditUserDrawer
					user={editingUser}
					isOpen={!!editingUser}
					isSuperadmin={isSuperadmin}
					onClose={() => setEditingUser(null)}
					onUpdated={() => {
						setEditingUser(null);
						void load();
					}}
				/>
			)}

			{permsUser && (
				<UserPermissionsDrawer
					user={permsUser}
					isOpen={!!permsUser}
					onClose={() => setPermsUser(null)}
				/>
			)}
		</div>
	);
}

// ─── Create Staff drawer ─────────────────────────────────────────────────────

function CreateStaffDrawer({
	isOpen,
	onClose,
	onCreated,
	isSuperadmin,
}: {
	isOpen: boolean;
	onClose: () => void;
	onCreated: () => void;
	isSuperadmin: boolean;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm<CreateStaffForm>({
		resolver: zodResolver(createStaffSchema),
		defaultValues: {
			phone: '',
			fullName: '',
			specialty: 'security',
			assignedZone: 'ZONE-A',
			roles: ['staff'],
		},
	});

	const onSubmit = async (values: CreateStaffForm) => {
		setSubmitting(true);
		setSubmitError(null);
		try {
			const input: CreateStaffInput = {
				phone: values.phone,
				fullName: values.fullName,
				specialty: values.specialty,
				assignedZone: values.assignedZone,
				roles: values.roles,
			};
			await adminCreateStaff(input);
			form.reset();
			onCreated();
		} catch (err) {
			setSubmitError(err instanceof ApiError ? err.message : 'Failed to create staff');
		} finally {
			setSubmitting(false);
		}
	};

	// Non-superadmins can only assign staff/manager roles.
	const assignableRoles = isSuperadmin ? SYSTEM_ROLES : ['staff', 'manager'];

	return (
		<Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
			{/* Drawer content */}
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest">Add Staff Member</h3>

				<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
					<div>
						<Label htmlFor="phone" className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
							Phone (E.164)
						</Label>
						<Input
							id="phone"
							placeholder="+14155550000"
							isInvalid={!!form.formState.errors.phone}
							errorMessage={form.formState.errors.phone?.message}
							{...form.register('phone')}
						/>
					</div>

					<div>
						<Label htmlFor="fullName" className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
							Full Name
						</Label>
						<Input
							id="fullName"
							placeholder="Jane Doe"
							isInvalid={!!form.formState.errors.fullName}
							errorMessage={form.formState.errors.fullName?.message}
							{...form.register('fullName')}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Specialty</Label>
							<select
								className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
								{...form.register('specialty')}
							>
								{STAFF_SPECIALTIES.map((s) => (
									<option key={s} value={s}>{s}</option>
								))}
							</select>
						</div>
						<div>
							<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Zone</Label>
							<select
								className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
								{...form.register('assignedZone')}
							>
								{STAFF_ZONES.map((z) => (
									<option key={z} value={z}>{z}</option>
								))}
							</select>
						</div>
					</div>

					<div>
						<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Roles</Label>
						<CheckboxGroup
							value={form.watch('roles')}
							onValueChange={(v) => form.setValue('roles', v)}
						>
							<div className="flex flex-col gap-1">
								{assignableRoles.map((r) => (
									<Checkbox key={r} value={r}>{r}</Checkbox>
								))}
							</div>
						</CheckboxGroup>
						{!isSuperadmin && (
							<p className="mt-1 text-[10px] text-slate-500">
								Only superadmins can assign the admin role.
							</p>
						)}
					</div>

					{submitError && (
						<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
							{submitError}
						</div>
					)}

					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" size="sm" variant="ghost" onPress={onClose} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" size="sm" variant="primary" disabled={submitting}>
							{submitting ? <Spinner size="sm" /> : 'Create'}
						</Button>
					</div>
				</form>
			</div>
		</Drawer>
	);
}

// ─── Edit User drawer (roles + status) ───────────────────────────────────────

function EditUserDrawer({
	user,
	isOpen,
	isSuperadmin,
	onClose,
	onUpdated,
}: {
	user: AdminUser;
	isOpen: boolean;
	isSuperadmin: boolean;
	onClose: () => void;
	onUpdated: () => void;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fullName, setFullName] = useState(user.fullName);
	const [status, setStatus] = useState<'active' | 'disabled'>(user.status);
	const [currentRoles, setCurrentRoles] = useState<string[]>(user.roles);

	const assignableRoles = isSuperadmin ? SYSTEM_ROLES : ['staff', 'manager'];

	const toggleRole = async (role: string, currentlyHas: boolean) => {
		setSubmitting(true);
		setError(null);
		try {
			if (currentlyHas) {
				await adminRevokeRole(user.userId, role);
				setCurrentRoles((r) => r.filter((x) => x !== role));
			} else {
				await adminAssignRole(user.userId, role);
				setCurrentRoles((r) => [...r, role]);
			}
		} catch (err) {
			setError(err instanceof ApiError ? err.message : 'Role update failed');
		} finally {
			setSubmitting(false);
		}
	};

	const saveProfile = async () => {
		setSubmitting(true);
		setError(null);
		try {
			await adminUpdateUser(user.userId, { fullName, status });
			onUpdated();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : 'Update failed');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest">Edit User</h3>

				<div>
					<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Full Name</Label>
					<Input value={fullName} onValueChange={setFullName} />
				</div>

				<div>
					<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Status</Label>
					<select
						className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
						value={status}
						onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}
					>
						<option value="active">active</option>
						<option value="disabled">disabled</option>
					</select>
				</div>

				<div>
					<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Roles in this tenant</Label>
					<div className="mt-1 flex flex-col gap-1">
						{assignableRoles.map((r) => {
							const has = currentRoles.includes(r);
							return (
								<label key={r} className="flex items-center gap-2 text-sm text-slate-200">
									<input
										type="checkbox"
										checked={has}
										disabled={submitting}
										onChange={() => toggleRole(r, has)}
									/>
									<span>{r}</span>
								</label>
							);
						})}
					</div>
					{!isSuperadmin && (
						<p className="mt-1 text-[10px] text-slate-500">
							Only superadmins can promote/demote the admin role.
						</p>
					)}
				</div>

				{error && (
					<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
						{error}
					</div>
				)}

				<div className="flex justify-end gap-2 pt-2">
					<Button size="sm" variant="ghost" onPress={onClose} disabled={submitting}>Close</Button>
					<Button size="sm" variant="primary" onPress={saveProfile} disabled={submitting}>
						{submitting ? <Spinner size="sm" /> : 'Save Profile'}
					</Button>
				</div>
			</div>
		</Drawer>
	);
}

// ─── Per-User Permissions drawer ─────────────────────────────────────────────

const ALL_PERMISSIONS = [
	'incident:create', 'incident:transition', 'incident:read',
	'dispatch:create', 'dispatch:update', 'dispatch:read',
	'tenant:switch', 'tenant:manage',
	'staff:manage', 'staff:reassign', 'role:assign-admin',
	'audit:view',
	'surface:control-room', 'surface:field-client',
	'config:manage',
] as const;

function UserPermissionsDrawer({
	user,
	isOpen,
	onClose,
}: {
	user: AdminUser;
	isOpen: boolean;
	onClose: () => void;
}) {
	const [granted, setGranted] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	const load = async () => {
		// No direct "list grants" endpoint — grants are reflected in the user's
		// effective permissions, which we can't disambiguate from role perms
		// client-side. For now, treat this drawer as "grant/revoke" UI without
		// showing current state. A future /api/admin/users/:id/permissions GET
		// would populate initial state.
		setLoading(false);
		void user;
	};

	if (loading) void load();

	const toggle = async (perm: string) => {
		setBusy(perm);
		setError(null);
		try {
			const has = granted.has(perm);
			if (has) {
				await adminRevokePermission(user.userId, perm as never);
				setGranted((s) => { const n = new Set(s); n.delete(perm); return n; });
			} else {
				await adminGrantPermission(user.userId, perm as never);
				setGranted((s) => new Set(s).add(perm));
			}
		} catch (err) {
			setError(err instanceof ApiError ? err.message : 'Permission update failed');
		} finally {
			setBusy(null);
		}
	};

	return (
		<Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest">
					Grants — {user.fullName}
				</h3>
				<p className="text-xs text-slate-400">
					Per-user permission grants (ADR-0011 P1). These are ADDITIVE — they
					grant capabilities on top of the user's role. Use sparingly for
					one-off exceptions.
				</p>

				<div className="flex flex-col gap-1">
					{ALL_PERMISSIONS.map((p) => {
						const has = granted.has(p);
						return (
							<label key={p} className="flex items-center gap-2 text-sm text-slate-200">
								<input
									type="checkbox"
									checked={has}
									disabled={busy !== null}
									onChange={() => toggle(p)}
								/>
								<span className="font-mono text-xs">{p}</span>
								{busy === p && <Spinner size="sm" />}
							</label>
						);
					})}
				</div>

				{error && (
					<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
						{error}
					</div>
				)}

				<div className="flex justify-end pt-2">
					<Button size="sm" variant="ghost" onPress={onClose}>Close</Button>
				</div>
			</div>
		</Drawer>
	);
}

// `Select` and `ListBox` imported for future use; suppress unused warning.
void Select;
void ListBox;
