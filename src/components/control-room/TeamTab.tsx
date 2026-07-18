/**
 * TeamTab — staff management surface (M9.5).
 *
 * Production-hardened (M9.5+):
 *   - Wrapped in ErrorBoundary (one broken tab doesn't kill the dashboard)
 *   - Skeleton loaders during initial fetch
 *   - Optimistic updates for role toggles + status/name edits
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
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
	Button,
	Input,
	Drawer,
	Spinner,
	Checkbox,
	CheckboxGroup,
	Label,
	Select,
	ListBox,
	Table,
} from '@heroui/react';
import { usePermissions } from '@/hooks/usePermissions';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import {
	adminListUsers,
	adminCreateStaff,
	adminAssignRole,
	adminRevokeRole,
	adminUpdateUser,
	adminGrantPermission,
	adminRevokePermission,
	type AdminUser,
	type CreateStaffInput,
	ApiError,
} from '@/services/api';
import { createStaffSchema, STAFF_SPECIALTIES, STAFF_ZONES, type CreateStaffForm } from '@/lib/admin-schemas';
import { TableSkeleton } from '@/components/shared/Skeletons';

const SYSTEM_ROLES = ['admin', 'manager', 'staff'];

const ALL_PERMISSIONS = [
	'incident:create', 'incident:transition', 'incident:read',
	'dispatch:create', 'dispatch:update', 'dispatch:read',
	'tenant:switch', 'tenant:manage',
	'staff:manage', 'staff:reassign', 'role:assign-admin',
	'audit:view',
	'surface:control-room', 'surface:field-client',
	'config:manage',
] as const;

export function TeamTab() {
	const { isSuperadmin } = usePermissions();
	const [createOpen, setCreateOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
	const [permsUser, setPermsUser] = useState<AdminUser | null>(null);

	const { items: users, loading, error, reload, mutate } = useOptimisticList<AdminUser[]>({
		loader: adminListUsers,
		initial: null,
	});

	const count = users?.length ?? 0;

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<header className="flex items-center gap-3">
				<h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">Team</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500 dark:text-slate-500">
					{count} member{count === 1 ? '' : 's'}
				</span>
				<div className="ml-auto" data-tour="team-add">
					<Button
						size="sm"
						variant="secondary"
						onPress={() => setCreateOpen(true)}
						className="neu-raised-sm neu-hover neu-active"
					>
						+ Add Staff
					</Button>
				</div>
			</header>

			{error && (
				<div className="rounded border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300 dark:text-red-300">
					{error}
					<Button
						size="sm"
						variant="ghost"
						onPress={() => void reload()}
						className="ml-3 neu-raised-sm neu-hover neu-active"
					>
						Retry
					</Button>
				</div>
			)}

			{loading && users === null ? (
				<TableSkeleton rows={5} cols={5} />
			) : (
				<div data-tour="team-table" className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
					<Table>
						<Table.ScrollContainer>
							<Table.Content aria-label="Team members" className="min-w-[640px]">
								<Table.Header className="bg-slate-100 dark:bg-slate-900/60">
									<Table.Column isRowHeader className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">Phone</Table.Column>
									<Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">Name</Table.Column>
									<Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">Roles</Table.Column>
									<Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">Status</Table.Column>
									<Table.Column className="text-end font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">Actions</Table.Column>
								</Table.Header>
								<Table.Body items={users ?? []} renderEmptyState={() => (
									<div className="p-8 text-center text-xs text-slate-900 dark:text-slate-500 dark:text-slate-500">
										No team members yet.
									</div>
								)}>
									{(u) => (
										<Table.Row id={u.userId} className="hover:bg-slate-100/70 dark:hover:bg-slate-200 dark:bg-slate-800/30">
											<Table.Cell className="font-mono text-slate-700 dark:text-slate-300">{u.phone}</Table.Cell>
											<Table.Cell className="text-slate-800 dark:text-slate-100">{u.fullName}</Table.Cell>
											<Table.Cell>
												<div className="flex flex-wrap gap-1">
													{u.roles.map((r) => (
														<span
															key={r}
															className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300"
														>
															{r}
														</span>
													))}
												</div>
											</Table.Cell>
											<Table.Cell>
												{u.status === 'active' ? (
													<span className="text-emerald-600 dark:text-emerald-400">● active</span>
												) : (
													<span className="text-red-600 dark:text-red-400">● disabled</span>
												)}
											</Table.Cell>
											<Table.Cell className="text-end">
												<Button size="sm" variant="ghost" onPress={() => setEditingUser(u)} className="neu-raised-sm neu-hover neu-active">Edit</Button>{' '}
												<Button size="sm" variant="ghost" onPress={() => setPermsUser(u)} className="neu-raised-sm neu-hover neu-active">Perms</Button>
											</Table.Cell>
										</Table.Row>
									)}
								</Table.Body>
							</Table.Content>
						</Table.ScrollContainer>
					</Table>
				</div>
			)}

			<CreateStaffDrawer
				isOpen={createOpen}
				isSuperadmin={isSuperadmin}
				onClose={() => setCreateOpen(false)}
				onCreated={async (newUser) => {
					// Optimistic: append to local list immediately.
					await mutate(
						async () => { /* already created by drawer */ },
						(draft) => { draft.push(newUser); },
					);
					setCreateOpen(false);
				}}
			/>

			{editingUser && (
				<EditUserDrawer
					user={editingUser}
					isSuperadmin={isSuperadmin}
					onClose={() => setEditingUser(null)}
					mutate={mutate}
				/>
			)}

			{permsUser && (
				<UserPermissionsDrawer
					user={permsUser}
					onClose={() => setPermsUser(null)}
				/>
			)}
		</div>
	);
}

// ─── Create Staff drawer ─────────────────────────────────────────────────────

function CreateStaffDrawer({
	isOpen,
	isSuperadmin,
	onClose,
	onCreated,
}: {
	isOpen: boolean;
	isSuperadmin: boolean;
	onClose: () => void;
	onCreated: (user: AdminUser) => void | Promise<void>;
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

	// useWatch avoids the React Compiler warning that `form.watch` triggers.
	const rolesValue = useWatch({ control: form.control, name: 'roles' }) ?? [];
	const specialtyValue = useWatch({ control: form.control, name: 'specialty' }) ?? 'security';
	const zoneValue = useWatch({ control: form.control, name: 'assignedZone' }) ?? 'ZONE-A';

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
			const result = await adminCreateStaff(input);
			// Build a local AdminUser preview to update the list optimistically.
			const preview: AdminUser = {
				userId: result.userId,
				phone: result.phone,
				fullName: values.fullName,
				globalRole: 'member',
				status: 'active',
				permsVersion: 1,
				roles: result.roles,
			};
			form.reset();
			await onCreated(preview);
		} catch (err) {
			setSubmitError(err instanceof ApiError ? err.message : 'Failed to create staff');
		} finally {
			setSubmitting(false);
		}
	};

	const assignableRoles = isSuperadmin ? SYSTEM_ROLES : ['staff', 'manager'];

	return (
		<Drawer>
			<Drawer.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
				<Drawer.Content>
					<Drawer.Dialog className="sm:max-w-md neu-raised rounded-2xl">
						<Drawer.CloseTrigger />
						<Drawer.Header>
							<Drawer.Heading className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
								Add Staff Member
							</Drawer.Heading>
						</Drawer.Header>
						<Drawer.Body>
							<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="phone" className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
										Phone (E.164)
									</Label>
									<Input
										id="phone"
										placeholder="+14155550000"

										className="neu-pressed"
										{...form.register('phone')}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<Label htmlFor="fullName" className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
										Full Name
									</Label>
									<Input
										id="fullName"
										placeholder="Jane Doe"

										className="neu-pressed"
										{...form.register('fullName')}
									/>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="flex flex-col gap-1.5">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Specialty</Label>
										<Select
											className="w-full"
											selectedKey={specialtyValue}
											onSelectionChange={(k) => form.setValue('specialty', k as CreateStaffForm['specialty'])}
										>
											<Select.Trigger className="neu-pressed">
												<Select.Value />
												<Select.Indicator />
											</Select.Trigger>
											<Select.Popover>
												<ListBox>
													{STAFF_SPECIALTIES.map((s) => (
														<ListBox.Item key={s} id={s} textValue={s}>
															{s}
															<ListBox.ItemIndicator />
														</ListBox.Item>
													))}
												</ListBox>
											</Select.Popover>
										</Select>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Zone</Label>
										<Select
											className="w-full"
											selectedKey={zoneValue}
											onSelectionChange={(k) => form.setValue('assignedZone', k as CreateStaffForm['assignedZone'])}
										>
											<Select.Trigger className="neu-pressed">
												<Select.Value />
												<Select.Indicator />
											</Select.Trigger>
											<Select.Popover>
												<ListBox>
													{STAFF_ZONES.map((z) => (
														<ListBox.Item key={z} id={z} textValue={z}>
															{z}
															<ListBox.ItemIndicator />
														</ListBox.Item>
													))}
												</ListBox>
											</Select.Popover>
										</Select>
									</div>
								</div>

								<div>
									<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Roles</Label>
									<CheckboxGroup
										value={rolesValue}
										onChange={(v) => form.setValue('roles', v)}
									>
										<div className="mt-1 flex flex-col gap-1">
											{assignableRoles.map((r) => (
												<Checkbox key={r} value={r}>
													<Checkbox.Content>
														<Checkbox.Control>
															<Checkbox.Indicator />
														</Checkbox.Control>
														{r}
													</Checkbox.Content>
												</Checkbox>
											))}
										</div>
									</CheckboxGroup>
									{!isSuperadmin && (
										<p className="mt-1 text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">
											Only superadmins can assign the admin role.
										</p>
									)}
								</div>

								{submitError && (
									<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
										{submitError}
									</div>
								)}
							</form>
						</Drawer.Body>
						<Drawer.Footer>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onPress={onClose}
								isDisabled={submitting}
								className="neu-raised-sm neu-hover neu-active"
							>
								Cancel
							</Button>
							<Button
								type="submit"
								size="sm"
								variant="primary"
								isDisabled={submitting}
								onPress={() => form.handleSubmit(onSubmit)()}
								className="neu-raised-sm neu-hover neu-active"
							>
								{submitting ? <Spinner size="sm" /> : 'Create'}
							</Button>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}

// ─── Edit User drawer (roles + status, optimistic) ───────────────────────────

interface EditUserMutate {
	(serverOp: () => Promise<unknown>, optimisticUpdate: (draft: AdminUser[]) => void): Promise<boolean>;
}

function EditUserDrawer({
	user,
	isSuperadmin,
	onClose,
	mutate,
}: {
	user: AdminUser;
	isSuperadmin: boolean;
	onClose: () => void;
	mutate: EditUserMutate;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fullName, setFullName] = useState(user.fullName);
	const [status, setStatus] = useState<'active' | 'disabled'>(user.status);

	const toggleRole = async (role: string, currentlyHas: boolean) => {
		setSubmitting(true);
		setError(null);
		const serverOp = currentlyHas
			? () => adminRevokeRole(user.userId, role)
			: () => adminAssignRole(user.userId, role);
		const ok = await mutate(serverOp, (draft) => {
			const target = draft.find((u) => u.userId === user.userId);
			if (target) {
				target.roles = currentlyHas
					? target.roles.filter((r) => r !== role)
					: [...target.roles, role];
			}
		});
		if (!ok) setError('Role update failed — rolled back.');
		setSubmitting(false);
	};

	const saveProfile = async () => {
		setSubmitting(true);
		setError(null);
		const ok = await mutate(
			() => adminUpdateUser(user.userId, { fullName, status }),
			(draft) => {
				const target = draft.find((u) => u.userId === user.userId);
				if (target) {
					target.fullName = fullName;
					target.status = status;
				}
			},
		);
		if (ok) {
			onClose();
		} else {
			setError('Update failed — rolled back.');
		}
		setSubmitting(false);
	};

	const assignableRoles = isSuperadmin ? SYSTEM_ROLES : ['staff', 'manager'];
	// Re-read user from latest state — but we only have the snapshot passed in.
	// For role toggles to feel live, re-derive current roles from props.
	const currentRoles = user.roles;

	return (
		<Drawer>
			<Drawer.Backdrop isOpen={true} onOpenChange={(o) => !o && onClose()}>
				<Drawer.Content>
					<Drawer.Dialog className="sm:max-w-md neu-raised rounded-2xl">
						<Drawer.CloseTrigger />
						<Drawer.Header>
							<Drawer.Heading className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
								Edit User
							</Drawer.Heading>
						</Drawer.Header>
						<Drawer.Body>
							<div className="flex flex-col gap-4">
								<div className="flex flex-col gap-1.5">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Full Name</Label>
									<Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="neu-pressed" />
								</div>

								<div className="flex flex-col gap-1.5">
									<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Status</Label>
									<Select
										className="w-full"
										selectedKey={status}
										onSelectionChange={(k) => setStatus(k as 'active' | 'disabled')}
									>
										<Select.Trigger className="neu-pressed">
											<Select.Value />
											<Select.Indicator />
										</Select.Trigger>
										<Select.Popover>
											<ListBox>
												<ListBox.Item id="active" textValue="active">
													active
													<ListBox.ItemIndicator />
												</ListBox.Item>
												<ListBox.Item id="disabled" textValue="disabled">
													disabled
													<ListBox.ItemIndicator />
												</ListBox.Item>
											</ListBox>
										</Select.Popover>
									</Select>
								</div>

								<div>
									<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Roles in this tenant</Label>
									<div className="mt-1 flex flex-col gap-1">
										{assignableRoles.map((r) => {
											const has = currentRoles.includes(r);
											return (
												<Checkbox
													key={r}
													isSelected={has}
													isDisabled={submitting}
													onChange={() => void toggleRole(r, has)}
												>
													<Checkbox.Content>
														<Checkbox.Control>
															<Checkbox.Indicator />
														</Checkbox.Control>
														{r}
													</Checkbox.Content>
												</Checkbox>
											);
										})}
									</div>
									{!isSuperadmin && (
										<p className="mt-1 text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">
											Only superadmins can promote/demote the admin role.
										</p>
									)}
								</div>

								{error && (
									<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
										{error}
									</div>
								)}
							</div>
						</Drawer.Body>
						<Drawer.Footer>
							<Button size="sm" variant="ghost" onPress={onClose} isDisabled={submitting} className="neu-raised-sm neu-hover neu-active">Close</Button>
							<Button size="sm" variant="primary" onPress={saveProfile} isDisabled={submitting} className="neu-raised-sm neu-hover neu-active">
								{submitting ? <Spinner size="sm" /> : 'Save Profile'}
							</Button>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}

// ─── Per-User Permissions drawer ─────────────────────────────────────────────

function UserPermissionsDrawer({
	user,
	onClose,
}: {
	user: AdminUser;
	onClose: () => void;
}) {
	const [granted, setGranted] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

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
		<Drawer>
			<Drawer.Backdrop isOpen={true} onOpenChange={(o) => !o && onClose()}>
				<Drawer.Content>
					<Drawer.Dialog className="sm:max-w-md neu-raised rounded-2xl">
						<Drawer.CloseTrigger />
						<Drawer.Header>
							<Drawer.Heading className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
								Grants — {user.fullName}
							</Drawer.Heading>
						</Drawer.Header>
						<Drawer.Body>
							<p className="text-xs text-slate-600 dark:text-slate-400">
								Per-user permission grants (ADR-0011 P1). Additive only — they grant
								capabilities on top of the user&apos;s role. Use sparingly for one-off exceptions.
							</p>

							<div className="mt-3 flex flex-col gap-1">
								{ALL_PERMISSIONS.map((p) => {
									const has = granted.has(p);
									return (
										<Checkbox
											key={p}
											isSelected={has}
											isDisabled={busy !== null}
											onChange={() => void toggle(p)}
										>
											<Checkbox.Content>
												<Checkbox.Control>
													<Checkbox.Indicator />
												</Checkbox.Control>
												<span className="font-mono text-xs">{p}</span>
												{busy === p && <Spinner size="sm" />}
											</Checkbox.Content>
										</Checkbox>
									);
								})}
							</div>

							{error && (
								<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
									{error}
								</div>
							)}
						</Drawer.Body>
						<Drawer.Footer>
							<Button size="sm" variant="ghost" onPress={onClose} className="neu-raised-sm neu-hover neu-active">Close</Button>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}
