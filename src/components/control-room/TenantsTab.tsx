/**
 * TenantsTab — superadmin tenant management (M9.5, redesigned).
 *
 * Scrollable HeroUI Table layout. Each row shows:
 *   - Organization name + status badge
 *   - Tenant ID (monospace)
 *   - Creation date
 *   - Actions: Edit Map
 *
 * Requires the `tenant:switch` permission (superadmin only).
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, TextField, FieldError, Spinner, Modal, Table, Label } from '@heroui/react';
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

	const count = tenants?.length ?? 0;

	return (
		<div className="flex h-full flex-col gap-4 p-4">
			<header className="flex items-center gap-3">
				<h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
					Tenants
				</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500 dark:text-slate-500">
					{count} tenant{count === 1 ? '' : 's'}
				</span>
				<div className="ml-auto">
					<Button
						size="sm"
						variant="secondary"
						onPress={() => setCreateOpen(true)}
						className="neu-raised-sm neu-hover neu-active"
					>
						+ New Tenant
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

			{loading && tenants === null ? (
				<CardGridSkeleton cards={3} />
			) : (
				<div className="flex-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
					<Table>
						<Table.ScrollContainer className="h-full">
							<Table.Content
								aria-label="Tenants"
								className="min-w-[640px]"
							>
								<Table.Header className="bg-slate-100 dark:bg-slate-900/95">
									<Table.Column isRowHeader className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
										Organization
									</Table.Column>
									<Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
										Tenant ID
									</Table.Column>
									<Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
										Status
									</Table.Column>
									<Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
										Created
									</Table.Column>
									<Table.Column className="text-end font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
										Actions
									</Table.Column>
								</Table.Header>
								<Table.Body
									items={tenants ?? []}
									renderEmptyState={() => (
										<div className="p-8 text-center text-xs text-slate-900 dark:text-slate-500 dark:text-slate-500">
											No tenants yet. Click &quot;+ New Tenant&quot; to create one.
										</div>
									)}
								>
									{(t) => (
										<Table.Row id={t.id} className="hover:bg-slate-100/70 dark:hover:bg-slate-200 dark:bg-slate-800/30">
											<Table.Cell className="font-bold text-slate-800 dark:text-slate-100">
												{t.orgName}
											</Table.Cell>
											<Table.Cell>
												<code className="text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">{t.id}</code>
											</Table.Cell>
											<Table.Cell>
												{t.status === 'ACTIVE' ? (
													<span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
														active
													</span>
												) : (
													<span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-red-700 dark:bg-red-900/50 dark:text-red-300">
														suspended
													</span>
												)}
											</Table.Cell>
											<Table.Cell className="text-slate-600 dark:text-slate-400">
												{new Date(t.createdAt).toLocaleDateString()}
											</Table.Cell>
											<Table.Cell className="text-end">
												<Button
													size="sm"
													variant="secondary"
													onPress={() => setEditingMap({ tenantId: t.id, orgName: t.orgName, layout: null })}
													className="neu-raised-sm neu-hover neu-active"
												>
													🗺 Edit Map
												</Button>
											</Table.Cell>
										</Table.Row>
									)}
								</Table.Body>
							</Table.Content>
						</Table.ScrollContainer>
					</Table>
				</div>
			)}

			<CreateTenantModal
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

// ─── Create Tenant modal ────────────────────────────────────────────────────

function CreateTenantModal({
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
		<Modal>
			<Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
				<Modal.Container>
					<Modal.Dialog className="sm:max-w-lg neu-raised rounded-2xl">
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
								New Tenant
							</Modal.Heading>
						</Modal.Header>
						<Modal.Body>
							<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
								<div className="flex flex-col gap-1.5">
									<TextField
										isInvalid={!!form.formState.errors.tenantId}
									>
										<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
											Tenant ID
										</Label>
										<Input
											className="neu-pressed w-full"
											{...form.register('tenantId')}
										/>
										<FieldError className="text-xs text-red-500">
											{form.formState.errors.tenantId?.message}
										</FieldError>
									</TextField>
								</div>

								<div className="flex flex-col gap-1.5">
									<TextField
										isInvalid={!!form.formState.errors.orgName}
									>
										<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
											Organization Name
										</Label>
										<Input
											className="neu-pressed w-full"
											{...form.register('orgName')}
										/>
										<FieldError className="text-xs text-red-500">
											{form.formState.errors.orgName?.message}
										</FieldError>
									</TextField>
								</div>

								<details className="rounded border border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
									<summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest">
										Optional: GPS bounding box
									</summary>
									<p className="mt-2">
										Used for GPS-to-grid projection. If omitted, defaults to a small box around
										the first coordinate reported by a staff member.
									</p>
									<div className="mt-2 grid grid-cols-2 gap-2">
										<Input type="number" step="0.0001" placeholder="min lat" className="neu-pressed" {...form.register('bboxMinLat', { valueAsNumber: true })} />
										<Input type="number" step="0.0001" placeholder="max lat" className="neu-pressed" {...form.register('bboxMaxLat', { valueAsNumber: true })} />
										<Input type="number" step="0.0001" placeholder="min lng" className="neu-pressed" {...form.register('bboxMinLng', { valueAsNumber: true })} />
										<Input type="number" step="0.0001" placeholder="max lng" className="neu-pressed" {...form.register('bboxMaxLng', { valueAsNumber: true })} />
									</div>
								</details>

								{submitError && (
									<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
										{submitError}
									</div>
								)}
							</form>
						</Modal.Body>
						<Modal.Footer>
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
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
