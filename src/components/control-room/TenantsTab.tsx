/**
 * TenantsTab — superadmin tenant management (M9.5).
 *
 * Production-hardened: ErrorBoundary + CardGridSkeleton + optimistic create.
 *
 * Requires the `tenant:manage` permission (superadmin only).
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Spinner, Drawer } from '@heroui/react';
import {
	adminListTenants,
	adminCreateTenant,
	type AdminTenant,
	ApiError,
} from '@/services/api';
import { createTenantSchema, type CreateTenantForm } from '@/lib/admin-schemas';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { CardGridSkeleton } from '@/components/shared/Skeletons';
import { MapLayoutEditor } from './MapLayoutEditor';
import { METLIFE_MAP_LAYOUT, type MapLayout } from '@/lib/map-layout';

export function TenantsTab() {
	const [createOpen, setCreateOpen] = useState(false);
	const [editingMap, setEditingMap] = useState<{ tenantId: string; orgName: string; layout: MapLayout | null } | null>(null);

	const { items: tenants, loading, error, reload, mutate } = useOptimisticList<AdminTenant[]>({
		loader: adminListTenants,
		initial: null,
	});

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<header className="flex items-center gap-3">
				<h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-100">Tenants</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
					{tenants?.length ?? 0} tenant{(tenants?.length ?? 0) === 1 ? '' : 's'}
				</span>
				<div className="ml-auto">
					<Button size="sm" variant="secondary" onPress={() => setCreateOpen(true)}>+ New Tenant</Button>
				</div>
			</header>

			{error && (
				<div className="rounded border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
					{error}
					<Button size="sm" variant="ghost" onPress={() => void reload()} className="ml-3">Retry</Button>
				</div>
			)}

			{loading && tenants === null ? (
				<CardGridSkeleton cards={3} />
			) : (
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{tenants?.map((t) => (
						<div key={t.id} className="rounded border border-slate-800 bg-slate-900/40 p-4">
							<div className="flex items-center gap-2">
								<h3 className="font-mono text-sm font-bold text-slate-100">{t.orgName}</h3>
								{t.status === 'ACTIVE' ? (
									<span className="rounded bg-emerald-900/50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-emerald-300">active</span>
								) : (
									<span className="rounded bg-red-900/50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-red-300">suspended</span>
								)}
							</div>
							<p className="mt-2 font-mono text-xs text-slate-500">{t.id}</p>
							<p className="mt-2 text-[10px] text-slate-500">
								Created {new Date(t.createdAt).toLocaleDateString()}
							</p>
							<Button
								size="sm"
								variant="secondary"
								className="mt-3 w-full"
								onPress={() => setEditingMap({ tenantId: t.id, orgName: t.orgName, layout: null })}
							>
								🗺 Edit Map Layout
							</Button>
						</div>
					))}
				</div>
			)}

			<CreateTenantDrawer
				isOpen={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={async (newTenant) => {
					await mutate(async () => {}, (draft) => { draft.push(newTenant); });
					setCreateOpen(false);
				}}
			/>

			{editingMap && (
				<MapLayoutEditor
					tenantId={editingMap.tenantId}
					tenantName={editingMap.orgName}
					initialLayout={editingMap.layout ?? (editingMap.tenantId === 'tenant_metlife_ops' ? METLIFE_MAP_LAYOUT : null)}
					onClose={() => setEditingMap(null)}
				/>
			)}
		</div>
	);
}

// ─── Create Tenant drawer ────────────────────────────────────────────────────

function CreateTenantDrawer({
	isOpen,
	onClose,
	onCreated,
}: {
	isOpen: boolean;
	onClose: () => void;
	onCreated: (tenant: AdminTenant) => void | Promise<void>;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm<CreateTenantForm>({
		resolver: zodResolver(createTenantSchema),
		defaultValues: { tenantId: '', orgName: '' },
	});

	const onSubmit = async (values: CreateTenantForm) => {
		setSubmitting(true);
		setSubmitError(null);
		try {
			await adminCreateTenant({
				tenantId: values.tenantId,
				orgName: values.orgName,
				bbox:
					values.bboxMinLat != null && values.bboxMaxLat != null && values.bboxMinLng != null && values.bboxMaxLng != null
						? { minLat: values.bboxMinLat, maxLat: values.bboxMaxLat, minLng: values.bboxMinLng, maxLng: values.bboxMaxLng }
						: undefined,
			});
			const preview: AdminTenant = {
				id: values.tenantId,
				orgName: values.orgName,
				status: 'ACTIVE',
				createdAt: new Date().toISOString(),
			};
			form.reset();
			await onCreated(preview);
		} catch (err) {
			setSubmitError(err instanceof ApiError ? err.message : 'Failed to create tenant');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest">New Tenant</h3>

				<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
					<div>
						<label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Tenant ID</label>
						<Input
							placeholder="tenant_metlife_ops"
							isInvalid={!!form.formState.errors.tenantId}
							errorMessage={form.formState.errors.tenantId?.message}
							{...form.register('tenantId')}
						/>
					</div>

					<div>
						<label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Organization Name</label>
						<Input
							placeholder="MetLife Stadium Ops Core"
							isInvalid={!!form.formState.errors.orgName}
							errorMessage={form.formState.errors.orgName?.message}
							{...form.register('orgName')}
						/>
					</div>

					<details className="rounded border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
						<summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest">
							Optional: GPS bounding box
						</summary>
						<p className="mt-2">
							Used for GPS-to-grid projection. If omitted, defaults to a small box around
							the first coordinate reported by a staff member.
						</p>
						<div className="mt-2 grid grid-cols-2 gap-2">
							<Input type="number" step="0.0001" placeholder="min lat" {...form.register('bboxMinLat', { valueAsNumber: true })} />
							<Input type="number" step="0.0001" placeholder="max lat" {...form.register('bboxMaxLat', { valueAsNumber: true })} />
							<Input type="number" step="0.0001" placeholder="min lng" {...form.register('bboxMinLng', { valueAsNumber: true })} />
							<Input type="number" step="0.0001" placeholder="max lng" {...form.register('bboxMaxLng', { valueAsNumber: true })} />
						</div>
					</details>

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
