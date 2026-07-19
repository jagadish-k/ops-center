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
import {
  Button,
  Input,
  TextField,
  FieldError,
  Spinner,
  Modal,
  Table,
  Label,
} from '@heroui/react';
import {
  adminListTenants,
  adminCreateTenant,
  adminUpdateTenant,
  adminCreateContact,
  adminDeleteContact,
  adminCreateAccessPeriod,
  adminDeleteAccessPeriod,
  adminUpdateTenantStatus,
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
  const [editingMap, setEditingMap] = useState<{
    tenantId: string;
    orgName: string;
    layout: MapLayout | null;
  } | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<AdminTenant | null>(
    null,
  );
  const [editingTenant, setEditingTenant] = useState<AdminTenant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    items: tenants,
    loading,
    error,
    reload,
    mutate,
  } = useOptimisticList<AdminTenant[]>({
    loader: adminListTenants,
    initial: null,
  });

  const count = tenants?.length ?? 0;

  const filteredTenants =
    tenants?.filter((t) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.orgName.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
      );
    }) ?? [];

  const handleUpdateStatus = async (
    tenantId: string,
    status: AdminTenant['status'],
  ) => {
    try {
      await adminUpdateTenantStatus(tenantId, status);
      await mutate(
        async () => {},
        (draft) => {
          const idx = draft.findIndex((t) => t.id === tenantId);
          if (idx !== -1) draft[idx].status = status;
        },
      );
    } catch (e) {
      console.error('Failed to update status', e);
      alert('Failed to update tenant status');
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
          Tenants
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500 dark:text-slate-500">
          {count} tenant{count === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Search tenants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 shadow-sm focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setCreateOpen(true)}
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
            className="ml-3"
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
                  <Table.Column
                    isRowHeader
                    className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500"
                  >
                    Organization
                  </Table.Column>
                  <Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
                    Tenant ID
                  </Table.Column>
                  <Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
                    Status
                  </Table.Column>
                  <Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
                    Tier
                  </Table.Column>
                  <Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
                    Health
                  </Table.Column>
                  <Table.Column className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
                    Created
                  </Table.Column>
                  <Table.Column className="text-end font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
                    Actions
                  </Table.Column>
                </Table.Header>
                <Table.Body
                  items={filteredTenants}
                  renderEmptyState={() => (
                    <div className="p-8 text-center text-xs text-slate-900 dark:text-slate-500 dark:text-slate-500">
                      No tenants yet. Click &quot;+ New Tenant&quot; to create
                      one.
                    </div>
                  )}
                >
                  {(t) => (
                    <Table.Row
                      id={t.id}
                      className="hover:bg-slate-100 dark:hover:bg-slate-700/50 dark:bg-slate-800/30"
                    >
                      <Table.Cell className="font-bold text-slate-800 dark:text-slate-100">
                        {t.orgName}
                      </Table.Cell>
                      <Table.Cell>
                        <code className="text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">
                          {t.id}
                        </code>
                      </Table.Cell>
                      <Table.Cell>
                        {t.status === 'ACTIVE' && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            active
                          </span>
                        )}
                        {t.status === 'SUSPENDED' && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-red-700 dark:bg-red-900/50 dark:text-red-300">
                            suspended
                          </span>
                        )}
                        {t.status === 'PAUSED' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                            paused
                          </span>
                        )}
                        {t.status === 'DEACTIVATED' && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            deactivated
                          </span>
                        )}
                        {t.status === 'ARCHIVED' && (
                          <span className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-500 dark:border-slate-600 dark:text-slate-400">
                            archived
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-[10px] uppercase text-slate-700 dark:text-slate-300">
                          {t.tier}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`h-2 w-2 rounded-full ${t.healthScore >= 80 ? 'bg-emerald-500' : t.healthScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          />
                          <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">
                            {t.healthScore}/100
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-slate-600 dark:text-slate-400">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </Table.Cell>
                      <Table.Cell className="text-end">
                        <div className="flex items-center justify-end gap-2">
                          <select
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-mono text-slate-700 shadow-sm focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            value={t.status}
                            onChange={(e) =>
                              handleUpdateStatus(
                                t.id,
                                e.target.value as AdminTenant['status'],
                              )
                            }
                          >
                            <option value="ACTIVE">▶️ Active</option>
                            <option value="PAUSED">⏸ Paused</option>
                            <option value="SUSPENDED">⛔ Suspended</option>
                            <option value="DEACTIVATED">❌ Deactivated</option>
                            <option value="ARCHIVED">📦 Archived</option>
                          </select>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="px-2 py-1 text-[10px]"
                            onPress={() => setEditingTenant(t)}
                          >
                            ✏️ Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="px-2 py-1 text-[10px]"
                            onPress={() => setSelectedTenant(t)}
                          >
                            ℹ️ Details
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="px-2 py-1 text-[10px]"
                            onPress={() =>
                              setEditingMap({
                                tenantId: t.id,
                                orgName: t.orgName,
                                layout: t.mapLayout as MapLayout | null,
                              })
                            }
                          >
                            🗺 Map
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      )}

      <TenantFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={async (newTenant) => {
          await mutate(
            async () => {},
            (draft) => {
              draft.push(newTenant);
            },
          );
          setCreateOpen(false);
        }}
      />

      {editingTenant && (
        <TenantFormModal
          isOpen={true}
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSaved={async (updated) => {
            await mutate(
              async () => {},
              (draft) => {
                const idx = draft.findIndex((t) => t.id === updated.id);
                if (idx !== -1) draft[idx] = { ...draft[idx], ...updated };
              },
            );
            setEditingTenant(null);
          }}
        />
      )}

      {editingMap && (
        <MapLayoutEditor
          tenantId={editingMap.tenantId}
          tenantName={editingMap.orgName}
          initialLayout={
            editingMap.layout ??
            (editingMap.tenantId === 'tenant_metlife_ops'
              ? METLIFE_MAP_LAYOUT
              : null)
          }
          onClose={() => setEditingMap(null)}
        />
      )}

      {selectedTenant && (
        <TenantDetailsModal
          tenant={selectedTenant}
          isOpen={true}
          onClose={() => setSelectedTenant(null)}
          onMutate={() => reload()}
        />
      )}
    </div>
  );
}

// ─── Tenant Form Modal (Create & Edit) ──────────────────────────────────────

function TenantFormModal({
  isOpen,
  tenant,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  tenant?: AdminTenant | null;
  onClose: () => void;
  onSaved: (tenant: AdminTenant) => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = !!tenant;

  const form = useForm<CreateTenantForm>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      tenantId: tenant?.id || '',
      orgName: tenant?.orgName || '',
      tier: tenant?.tier || 'BASIC',
      healthScore: tenant?.healthScore ?? 100,
      renewalDate: tenant?.renewalDate ? tenant.renewalDate.split('T')[0] : '',
      accountManagerId: tenant?.accountManagerId || '',
      notes: tenant?.notes || '',
      // Map layout bbox fallback if available
    },
  });

  const onSubmit = async (values: CreateTenantForm) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (isEdit) {
        await adminUpdateTenant(values.tenantId, {
          orgName: values.orgName,
          tier: values.tier,
          healthScore: values.healthScore,
          renewalDate: values.renewalDate || null,
          accountManagerId: values.accountManagerId || null,
          notes: values.notes || null,
          bbox:
            values.bboxMinLat != null &&
            values.bboxMaxLat != null &&
            values.bboxMinLng != null &&
            values.bboxMaxLng != null
              ? {
                  minLat: values.bboxMinLat,
                  maxLat: values.bboxMaxLat,
                  minLng: values.bboxMinLng,
                  maxLng: values.bboxMaxLng,
                }
              : undefined,
        });
        form.reset();
        await onSaved({
          ...tenant,
          orgName: values.orgName,
          tier: values.tier as 'BASIC' | 'PRO' | 'ENTERPRISE',
          healthScore: values.healthScore,
          renewalDate: values.renewalDate || null,
          accountManagerId: values.accountManagerId || null,
          notes: values.notes || null,
        } as AdminTenant);
      } else {
        await adminCreateTenant({
          tenantId: values.tenantId,
          orgName: values.orgName,
          tier: values.tier,
          healthScore: values.healthScore,
          renewalDate: values.renewalDate || null,
          accountManagerId: values.accountManagerId || null,
          notes: values.notes || null,
          bbox:
            values.bboxMinLat != null &&
            values.bboxMaxLat != null &&
            values.bboxMinLng != null &&
            values.bboxMaxLng != null
              ? {
                  minLat: values.bboxMinLat,
                  maxLat: values.bboxMaxLat,
                  minLng: values.bboxMinLng,
                  maxLng: values.bboxMaxLng,
                }
              : undefined,
        });
        const preview: AdminTenant = {
          id: values.tenantId,
          orgName: values.orgName,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          tier: (values.tier as 'BASIC' | 'PRO' | 'ENTERPRISE') || 'BASIC',
          healthScore: values.healthScore || 100,
          renewalDate: values.renewalDate || null,
          accountManagerId: values.accountManagerId || null,
          notes: values.notes || null,
        };
        form.reset();
        await onSaved(preview);
      }
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${isEdit ? 'update' : 'create'} tenant`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(o) => !o && onClose()}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg rounded-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
                {isEdit ? 'Edit Tenant' : 'New Tenant'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[70vh] overflow-y-auto">
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <TextField isInvalid={!!form.formState.errors.tenantId}>
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                      Tenant ID
                    </Label>
                    <Input
                      className="w-full"
                      {...form.register('tenantId')}
                      readOnly={isEdit}
                    />
                    <FieldError className="text-xs text-red-500">
                      {form.formState.errors.tenantId?.message}
                    </FieldError>
                  </TextField>
                </div>

                <div className="flex flex-col gap-1.5">
                  <TextField isInvalid={!!form.formState.errors.orgName}>
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                      Organization Name
                    </Label>
                    <Input
                      className="w-full"
                      {...form.register('orgName')}
                    />
                    <FieldError className="text-xs text-red-500">
                      {form.formState.errors.orgName?.message}
                    </FieldError>
                  </TextField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <TextField>
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                      Tier
                    </Label>
                    <select
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      {...form.register('tier')}
                    >
                      <option value="BASIC">Basic</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </TextField>

                  <TextField isInvalid={!!form.formState.errors.healthScore}>
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                      Health Score (0-100)
                    </Label>
                    <Input
                      type="number"
                      className="w-full"
                      {...form.register('healthScore', { valueAsNumber: true })}
                    />
                  </TextField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <TextField>
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                      Renewal Date
                    </Label>
                    <Input
                      type="date"
                      className="w-full"
                      {...form.register('renewalDate')}
                    />
                  </TextField>

                  <TextField>
                    <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                      Account Manager
                    </Label>
                    <Input
                      className="w-full"
                      {...form.register('accountManagerId')}
                      placeholder="e.g. user_123"
                    />
                  </TextField>
                </div>

                <TextField>
                  <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
                    Internal Notes
                  </Label>
                  <textarea
                    className="w-full rounded border border-slate-300 bg-white p-2 text-sm focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    rows={3}
                    {...form.register('notes')}
                  />
                </TextField>

                <details className="rounded border border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest">
                    Optional: GPS bounding box
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="min lat"
                      {...form.register('bboxMinLat', { valueAsNumber: true })}
                    />
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="max lat"
                      {...form.register('bboxMaxLat', { valueAsNumber: true })}
                    />
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="min lng"
                      {...form.register('bboxMinLng', { valueAsNumber: true })}
                    />
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="max lng"
                      {...form.register('bboxMaxLng', { valueAsNumber: true })}
                    />
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
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                isDisabled={submitting}
                onPress={() => form.handleSubmit(onSubmit)()}
              >
                {submitting ? (
                  <Spinner size="sm" />
                ) : isEdit ? (
                  'Save Changes'
                ) : (
                  'Create'
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// ─── Tenant Details modal ───────────────────────────────────────────────────

function TenantDetailsModal({
  tenant,
  isOpen,
  onClose,
  onMutate,
}: {
  tenant: AdminTenant;
  isOpen: boolean;
  onClose: () => void;
  onMutate: () => void;
}) {
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
  });
  const [addingContact, setAddingContact] = useState(false);
  const [newPeriod, setNewPeriod] = useState({
    type: 'EVENT',
    startDate: '',
    endDate: '',
    notes: '',
  });
  const [addingPeriod, setAddingPeriod] = useState(false);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminCreateContact({ tenantId: tenant.id, ...newContact });
      setNewContact({ name: '', email: '', phone: '', role: '' });
      setAddingContact(false);
      onMutate();
    } catch {
      alert('Failed to add contact');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await adminDeleteContact(id);
      onMutate();
    } catch {
      alert('Failed to delete contact');
    }
  };

  const handleAddPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminCreateAccessPeriod({ tenantId: tenant.id, ...newPeriod });
      setNewPeriod({ type: 'EVENT', startDate: '', endDate: '', notes: '' });
      setAddingPeriod(false);
      onMutate();
    } catch {
      alert('Failed to add access period');
    }
  };

  const handleDeletePeriod = async (id: string) => {
    if (!confirm('Delete this access period?')) return;
    try {
      await adminDeleteAccessPeriod(id);
      onMutate();
    } catch {
      alert('Failed to delete access period');
    }
  };

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(o) => !o && onClose()}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-2xl rounded-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
                {tenant.orgName} Details
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col gap-6 p-1">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      Account Manager
                    </h4>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1">
                      {tenant.accountManagerId || (
                        <span className="italic text-slate-400">
                          Unassigned
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      Renewal Date
                    </h4>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1">
                      {tenant.renewalDate ? (
                        new Date(tenant.renewalDate).toLocaleDateString()
                      ) : (
                        <span className="italic text-slate-400">N/A</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Internal Notes
                  </h4>
                  <div className="mt-1 min-h-[60px] rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300 whitespace-pre-wrap">
                    {tenant.notes || (
                      <span className="italic text-slate-400">
                        No notes available.
                      </span>
                    )}
                  </div>
                </div>

                {/* SPOCs */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      Points of Contact
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => setAddingContact(!addingContact)}
                      className="text-[10px]"
                    >
                      {addingContact ? 'Cancel' : '+ Add'}
                    </Button>
                  </div>

                  {addingContact && (
                    <form
                      onSubmit={handleAddContact}
                      className="mb-4 rounded border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/20"
                    >
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Input
                          className="text-sm"
                          placeholder="Name"
                          value={newContact.name}
                          onChange={(e) =>
                            setNewContact({
                              ...newContact,
                              name: e.target.value,
                            })
                          }
                          required
                        />
                        <Input
                          className="text-sm"
                          placeholder="Email"
                          type="email"
                          value={newContact.email}
                          onChange={(e) =>
                            setNewContact({
                              ...newContact,
                              email: e.target.value,
                            })
                          }
                          required
                        />
                        <Input
                          className="text-sm"
                          placeholder="Phone (optional)"
                          value={newContact.phone}
                          onChange={(e) =>
                            setNewContact({
                              ...newContact,
                              phone: e.target.value,
                            })
                          }
                        />
                        <Input
                          className="text-sm"
                          placeholder="Role (optional)"
                          value={newContact.role}
                          onChange={(e) =>
                            setNewContact({
                              ...newContact,
                              role: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          size="sm"
                          variant="primary"
                          className="text-[10px] px-2 py-1"
                        >
                          Save Contact
                        </Button>
                      </div>
                    </form>
                  )}

                  {tenant.contacts?.length ? (
                    <div className="flex flex-col gap-2">
                      {tenant.contacts.map((c) => (
                        <div
                          key={c.id}
                          className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {c.name}
                              </span>
                              {c.role && (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  {c.role}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteContact(c.id)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                          <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600 dark:text-slate-400">
                            <span>📧 {c.email}</span>
                            {c.phone && <span>📱 {c.phone}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400">
                      No contacts recorded.
                    </p>
                  )}
                </div>

                {/* Access Periods */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      Access Periods
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => setAddingPeriod(!addingPeriod)}
                      className="text-[10px]"
                    >
                      {addingPeriod ? 'Cancel' : '+ Add'}
                    </Button>
                  </div>

                  {addingPeriod && (
                    <form
                      onSubmit={handleAddPeriod}
                      className="mb-4 rounded border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/20"
                    >
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <select
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={newPeriod.type}
                          onChange={(e) =>
                            setNewPeriod({ ...newPeriod, type: e.target.value })
                          }
                          required
                        >
                          <option value="ONGOING">ONGOING</option>
                          <option value="EVENT">EVENT</option>
                          <option value="SEASONAL">SEASONAL</option>
                        </select>
                        <Input
                          className="text-sm"
                          placeholder="Notes (e.g. Summer Concert)"
                          value={newPeriod.notes}
                          onChange={(e) =>
                            setNewPeriod({
                              ...newPeriod,
                              notes: e.target.value,
                            })
                          }
                        />
                        <Input
                          className="text-sm"
                          type="date"
                          value={newPeriod.startDate}
                          onChange={(e) =>
                            setNewPeriod({
                              ...newPeriod,
                              startDate: e.target.value,
                            })
                          }
                          required
                        />
                        <Input
                          className="text-sm"
                          type="date"
                          value={newPeriod.endDate}
                          onChange={(e) =>
                            setNewPeriod({
                              ...newPeriod,
                              endDate: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          size="sm"
                          variant="primary"
                          className="text-[10px] px-2 py-1"
                        >
                          Save Period
                        </Button>
                      </div>
                    </form>
                  )}

                  {tenant.accessPeriods?.length ? (
                    <div className="flex flex-col gap-2">
                      {tenant.accessPeriods.map((p) => (
                        <div
                          key={p.id}
                          className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 flex justify-between items-start"
                        >
                          <div>
                            <div className="font-mono text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                              [{p.type}]
                            </div>
                            {p.notes && (
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                {p.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <button
                              onClick={() => handleDeletePeriod(p.id)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Delete
                            </button>
                            <div className="text-end mt-1">
                              <div className="text-xs text-slate-800 dark:text-slate-200">
                                {new Date(p.startDate).toLocaleDateString()}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                to {new Date(p.endDate).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400">
                      No access periods recorded.
                    </p>
                  )}
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
