/**
 * OperationalDashboard — the Control Room command shell.
 *
 * Tabbed layout (M9.5): Operations / Team / Roles / Tenants. The Operations
 * tab is the original 2-column dashboard (map + queue + inspector). The other
 * tabs are admin surfaces gated by permission:
 *   - Team:        staff:manage (admin + superadmin)
 *   - Roles:       tenant:manage (superadmin only)
 *   - Tenants:     tenant:switch (superadmin only)
 *
 * Live operational state is consumed from the ActiveOps context (diff-polling).
 */
import { useMemo, useState, useEffect } from 'react';
import { Button, Tabs } from '@heroui/react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveOps } from '@/context/ActiveOpsContext';
import type { IncidentReport, IncidentCategory } from '@/types';
import { adminListTenants } from '@/services/api';

import { IncidentQueue } from './IncidentQueue';
import { IncidentInspector } from './IncidentInspector';
import { TenantSwitcher } from './TenantSwitcher';
import { AuditTimelineInspector } from './AuditTimelineInspector';
import { TeamTab } from './TeamTab';
import { RolesTab } from './RolesTab';
import { TenantsTab } from './TenantsTab';
import { PoliciesTab } from './PoliciesTab';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useTabTourBanner, startTabTour } from '@/components/shared/GuideTour';
import { OptimizedStadiumMapCanvas } from '@/components/shared/OptimizedStadiumMapCanvas';

type TabId = 'operations' | 'team' | 'roles' | 'tenants' | 'policies';

interface OperationalDashboardProps {
  onTenantChange: (tenantId: string) => Promise<void>;
}

export function OperationalDashboard({
  onTenantChange,
}: OperationalDashboardProps) {
  const { signOut } = useAuth();
  const { can, phone, fullName } = usePermissions();
  const { incidents, staff, activeTenantId, mapLayout } = useActiveOps();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('operations');

  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<
    Set<IncidentCategory>
  >(new Set(['SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY']));

  // Fetch real tenant list from the API for the TenantSwitcher.
  const [tenants, setTenants] = useState<
    { tenantId: string; orgName: string }[]
  >([]);
  useEffect(() => {
    if (!can('tenant:switch')) return;
    adminListTenants()
      .then((list) => {
        setTenants(list.map((t) => ({ tenantId: t.id, orgName: t.orgName })));
      })
      .catch(() => {
        // Fall back to mock data if the API call fails.
        setTenants([
          { tenantId: 'tenant_metlife_ops', orgName: 'MetLife Stadium' },
          { tenantId: 'tenant_sofi_ops', orgName: 'SoFi Stadium' },
          { tenantId: 'tenant_hardrock_ops', orgName: 'Hard Rock Stadium' },
        ]);
      });
  }, [can]);

  // Per-tab tour banner: shows "Take a quick tour?" on first visit.
  const tour = useTabTourBanner(activeTab);

  // Derive the freshest selected incident from the polled list.
  const selected = useMemo(
    () => incidents.find((i) => i.id === selectedId) ?? null,
    [incidents, selectedId],
  );

  const handleSelect = (incident: IncidentReport): void => {
    setSelectedId(incident.id);
    if (incident.floorId) {
      setSelectedFloorId(incident.floorId);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-6 py-3 backdrop-blur-xl z-50">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <div className="absolute inset-0 rounded-lg bg-cyan-400 blur-md opacity-20"></div>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-cyan-400 relative z-10"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="flex items-center">
            <span
              className="font-mono text-lg font-black tracking-widest uppercase text-transparent"
              style={{ WebkitTextStroke: '1px #22d3ee' }}
            >
              Ops
            </span>
            <span className="font-mono text-lg font-black tracking-[0.2em] uppercase text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
              Center
            </span>
          </div>
        </div>

        {/* ── Center Navigation (Tabs) ────────────────────────────────────────── */}
        <nav
          data-tour="tab-nav"
          className="flex flex-1 items-center justify-center"
        >
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(k) => setActiveTab(k as TabId)}
            className="w-full"
            variant="secondary"
          >
            <Tabs.ListContainer>
              <Tabs.List
                aria-label="Operations Navigation"
                className="gap-8 w-full relative rounded-none p-0 border-b-0 justify-center"
              >
                <Tabs.Tab
                  id="operations"
                  className="max-w-fit px-0 h-12 data-[selected=true]:text-cyan-400 group-data-[selected=true]:text-cyan-400 text-slate-400 font-mono text-xs font-bold tracking-widest uppercase hover:text-white transition-colors"
                >
                  Operations
                  <Tabs.Indicator className="w-full bg-cyan-400 h-[2px] shadow-[0_-2px_10px_rgba(34,211,238,0.5)]" />
                </Tabs.Tab>
                {can('staff:manage') && (
                  <Tabs.Tab
                    id="team"
                    className="max-w-fit px-0 h-12 data-[selected=true]:text-cyan-400 group-data-[selected=true]:text-cyan-400 text-slate-400 font-mono text-xs font-bold tracking-widest uppercase hover:text-white transition-colors"
                  >
                    Team
                    <Tabs.Indicator className="w-full bg-cyan-400 h-[2px] shadow-[0_-2px_10px_rgba(34,211,238,0.5)]" />
                  </Tabs.Tab>
                )}
                {can('tenant:manage') && (
                  <Tabs.Tab
                    id="roles"
                    className="max-w-fit px-0 h-12 data-[selected=true]:text-cyan-400 group-data-[selected=true]:text-cyan-400 text-slate-400 font-mono text-xs font-bold tracking-widest uppercase hover:text-white transition-colors"
                  >
                    Roles
                    <Tabs.Indicator className="w-full bg-cyan-400 h-[2px] shadow-[0_-2px_10px_rgba(34,211,238,0.5)]" />
                  </Tabs.Tab>
                )}
                {can('tenant:switch') && (
                  <Tabs.Tab
                    id="tenants"
                    className="max-w-fit px-0 h-12 data-[selected=true]:text-cyan-400 group-data-[selected=true]:text-cyan-400 text-slate-400 font-mono text-xs font-bold tracking-widest uppercase hover:text-white transition-colors"
                  >
                    Tenants
                    <Tabs.Indicator className="w-full bg-cyan-400 h-[2px] shadow-[0_-2px_10px_rgba(34,211,238,0.5)]" />
                  </Tabs.Tab>
                )}
                {can('tenant:manage') && (
                  <Tabs.Tab
                    id="policies"
                    className="max-w-fit px-0 h-12 data-[selected=true]:text-cyan-400 group-data-[selected=true]:text-cyan-400 text-slate-400 font-mono text-xs font-bold tracking-widest uppercase hover:text-white transition-colors"
                  >
                    Policies
                    <Tabs.Indicator className="w-full bg-cyan-400 h-[2px] shadow-[0_-2px_10px_rgba(34,211,238,0.5)]" />
                  </Tabs.Tab>
                )}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-4">
          {can('tenant:switch') && tenants.length > 0 && (
            <div data-tour="tenant-switcher">
              <TenantSwitcher
                tenants={tenants}
                activeTenantId={activeTenantId}
                onTenantChange={(tid) => void onTenantChange(tid)}
              />
            </div>
          )}
          {can('audit:view') && (
            <Button
              data-tour="compliance-log"
              size="sm"
              variant="tertiary"
              onPress={() => setAuditOpen(true)}
              className="bg-white/5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/10"
            >
              Log
            </Button>
          )}
          <Button
            data-tour="help-button"
            size="sm"
            variant="ghost"
            onPress={() => startTabTour(activeTab)}
            className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white"
          >
            ?
          </Button>

          <div className="flex items-center gap-3 pl-4 border-l border-white/10">
            <div className="flex items-center gap-2">
              <div
                className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center border border-white/10 cursor-help"
                title={`Logged in as: ${fullName ?? phone}`}
              >
                <span className="text-[10px]">👤</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onPress={signOut}
              className="border-white/10 font-mono text-[10px] uppercase tracking-widest text-slate-400 hover:bg-white/5 hover:text-white"
            >
              Out
            </Button>
          </div>
        </div>
      </header>

      {/* ── Tab content (each wrapped in its own ErrorBoundary) ──── */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {/* Tour prompt banner — shown once per tab until dismissed */}
        {tour.showBanner && (
          <div className="flex items-center gap-3 border-b border-blue-300 bg-blue-50 px-4 py-2 dark:border-blue-800/40 dark:bg-blue-950/30">
            <span className="text-xs text-blue-700 dark:text-blue-300">
              First time on the{' '}
              <strong className="capitalize">{activeTab}</strong> tab?
            </span>
            <button
              onClick={tour.startTour}
              className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-blue-500"
            >
              Start Tour
            </button>
            <button
              onClick={tour.dismissBanner}
              className="ml-auto text-[10px] text-slate-900 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-600 dark:text-slate-300"
            >
              ✕ Dismiss
            </button>
          </div>
        )}
        {activeTab === 'operations' && (
          <ErrorBoundary name="Operations tab">
            <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-4">
              <section
                data-tour="map-canvas"
                className="relative min-h-[320px] lg:col-span-3 lg:min-h-0 rounded-2xl overflow-hidden border border-white/10 bg-slate-950 shadow-2xl"
              >
                {/* ── Top Status Overlay ── */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 hidden items-center gap-4 rounded-full bg-slate-950/90 border border-white/10 px-6 py-2 backdrop-blur-md shadow-2xl md:flex">
                  <span className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
                    Active Units:{' '}
                    <span className="text-cyan-400 font-bold ml-1">
                      {staff.length}
                    </span>
                  </span>
                  <div className="w-px h-3 bg-white/20" />
                  <span className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
                    Incidents:{' '}
                    <span className="text-orange-400 font-bold ml-1">
                      {incidents.filter((i) => i.status !== 'RESOLVED').length}
                    </span>
                  </span>
                  <div className="w-px h-3 bg-white/20" />
                  <span className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
                    System Health:{' '}
                    <span className="text-emerald-400 font-bold ml-1">
                      Stable
                    </span>
                  </span>
                </div>

                <OptimizedStadiumMapCanvas
                  incidents={incidents}
                  staffMembers={staff}
                  mapLayout={mapLayout}
                  onIncidentSelect={handleSelect}
                  selectedFloorId={selectedFloorId}
                  onFloorChange={setSelectedFloorId}
                  selectedCategories={selectedCategories}
                />
              </section>
              <aside className="flex min-h-0 flex-col gap-4 lg:col-span-1">
                <div
                  data-tour="incident-queue"
                  className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-2xl backdrop-blur-md"
                >
                  <IncidentQueue
                    incidents={incidents}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    selectedFloorId={selectedFloorId}
                    onFloorChange={setSelectedFloorId}
                    selectedCategories={selectedCategories}
                    onCategoryToggle={(cat) => {
                      setSelectedCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat)) {
                          next.delete(cat);
                        } else {
                          next.add(cat);
                        }
                        return next;
                      });
                    }}
                    floors={mapLayout?.floors ?? []}
                  />
                </div>
                <div
                  data-tour="incident-inspector"
                  className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-2xl backdrop-blur-md"
                >
                  <IncidentInspector
                    key={selected?.id ?? 'empty'}
                    incident={selected}
                    floors={mapLayout?.floors ?? []}
                  />
                </div>
              </aside>
            </div>
          </ErrorBoundary>
        )}
        {activeTab === 'team' && can('staff:manage') && (
          <ErrorBoundary name="Team tab">
            <TeamTab />
          </ErrorBoundary>
        )}
        {activeTab === 'roles' && can('tenant:manage') && (
          <ErrorBoundary name="Roles tab">
            <RolesTab />
          </ErrorBoundary>
        )}
        {activeTab === 'tenants' && can('tenant:switch') && (
          <ErrorBoundary name="Tenants tab">
            <TenantsTab />
          </ErrorBoundary>
        )}
        {activeTab === 'policies' && can('tenant:manage') && (
          <ErrorBoundary name="Policies tab">
            <PoliciesTab />
          </ErrorBoundary>
        )}
      </main>

      {/* ── Compliance slide-out ──────────────────────────────────── */}
      <AuditTimelineInspector
        isOpen={auditOpen}
        onClose={() => setAuditOpen(false)}
      />
    </div>
  );
}
