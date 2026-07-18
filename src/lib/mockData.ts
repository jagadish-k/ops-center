/**
 * Mock data layer — stands in for the /api/state-poll endpoint (ADR-0004) while
 * the diff-based polling backend is under construction (M2–M5).
 *
 * The polling hook (usePollingState) falls back to these fixtures whenever the
 * real endpoint is unreachable, so the full UI is reviewable end-to-end.
 *
 * Phone numbers mirror the seed data in database/migrations/0001_init.sql.
 */
import type {
  IncidentReport,
  WhitelistUser,
  DispatchDirective,
  InfoTier,
} from '@/types';

const TENANT_ID = 'tenant_metlife';

// ─── Field Staff ──────────────────────────────────────────────────────────────

export const mockStaff: WhitelistUser[] = [
  {
    id: '+14155552026',
    tenantId: TENANT_ID,
    fullName: 'Marcus Reyes',
    roles: ['staff'],
    specialty: 'security',
    assignedZone: 'ZONE-A',
    status: 'AVAILABLE',
    phoneNumber: '+14155552026',
    currentCoords: { x: 320, y: 280 },
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '+14155550001',
    tenantId: TENANT_ID,
    fullName: 'Priya Shah',
    roles: ['staff'],
    specialty: 'medical',
    assignedZone: 'ZONE-C',
    status: 'DISPATCHED',
    phoneNumber: '+14155550001',
    currentCoords: { x: 610, y: 420 },
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '+14155550002',
    tenantId: TENANT_ID,
    fullName: 'Diego Alvarez',
    roles: ['staff'],
    specialty: 'cleaning',
    assignedZone: 'ZONE-B',
    status: 'AVAILABLE',
    phoneNumber: '+14155550002',
    currentCoords: { x: 470, y: 350 },
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '+14155550003',
    tenantId: TENANT_ID,
    fullName: 'Hannah Okonkwo',
    roles: ['staff'],
    specialty: 'supervisor',
    assignedZone: 'ZONE-D',
    status: 'AVAILABLE',
    phoneNumber: '+14155550003',
    currentCoords: { x: 540, y: 640 },
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '+14155550004',
    tenantId: TENANT_ID,
    fullName: 'Tomas Lindqvist',
    roles: ['staff'],
    specialty: 'security',
    assignedZone: 'ZONE-E',
    status: 'AVAILABLE',
    phoneNumber: '+14155550004',
    currentCoords: { x: 720, y: 300 },
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '+14155550005',
    tenantId: TENANT_ID,
    fullName: 'Mei Chen',
    roles: ['staff'],
    specialty: 'medical',
    assignedZone: 'ZONE-F',
    status: 'OFF_DUTY',
    phoneNumber: '+14155550005',
    currentCoords: { x: 800, y: 700 },
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '+14155550006',
    tenantId: TENANT_ID,
    fullName: 'Omar Haddad',
    roles: ['staff'],
    specialty: 'cleaning',
    assignedZone: 'ZONE-A',
    status: 'DISPATCHED',
    phoneNumber: '+14155550006',
    currentCoords: { x: 280, y: 540 },
    createdAt: Date.now() - 86_400_000,
  },
];

// ─── Incidents ────────────────────────────────────────────────────────────────

const now = Date.now();

export const mockIncidents: IncidentReport[] = [
  {
    id: 'inc_001',
    tenantId: TENANT_ID,
    source: 'field_staff',
    tier: 1 as InfoTier,
    status: 'OPEN',
    rawText:
      'Section 112 — crowd surge against the perimeter railing. Multiple patrons at risk of crush injury. Request immediate security and medical.',
    timestamp: now - 42_000,
    coordinates: { x: 330, y: 270 },
    extractedMetadata: {
      category: 'CROWD',
      severity: 'CRITICAL',
      locationSector: 'SEC-112',
      actionRequired: 'Deploy riot line + triage team to SEC-112 immediately.',
    },
  },
  {
    id: 'inc_002',
    tenantId: TENANT_ID,
    source: 'field_staff',
    tier: 2 as InfoTier,
    status: 'ACKNOWLEDGED',
    rawText:
      'Concourse Level 1, near Gate C — unresponsive male, approximately 50s, possible cardiac event. AED en route.',
    timestamp: now - 180_000,
    coordinates: { x: 610, y: 410 },
    extractedMetadata: {
      category: 'MEDICAL',
      severity: 'CRITICAL',
      locationSector: 'CONC-1C',
      actionRequired: 'AED + paramedic to Gate C concourse.',
    },
  },
  {
    id: 'inc_003',
    tenantId: TENANT_ID,
    source: 'social_media',
    tier: 3 as InfoTier,
    status: 'OPEN',
    rawText:
      'Reports of a physical altercation in the upper deck, Section 308. Two individuals, no weapons observed.',
    timestamp: now - 360_000,
    coordinates: { x: 540, y: 630 },
    extractedMetadata: {
      category: 'SECURITY',
      severity: 'HIGH',
      locationSector: 'SEC-308',
      actionRequired: 'Security team to SEC-308 to de-escalate.',
    },
  },
  {
    id: 'inc_004',
    tenantId: TENANT_ID,
    source: 'field_staff',
    tier: 3 as InfoTier,
    status: 'ON_SCENE',
    rawText:
      'Restroom block on Level 2 — overflowing fixture causing standing water in the corridor. Slip hazard.',
    timestamp: now - 600_000,
    coordinates: { x: 470, y: 360 },
    extractedMetadata: {
      category: 'FACILITIES',
      severity: 'MEDIUM',
      locationSector: 'L2-RR-W',
      actionRequired:
        'Facilities crew + wet-floor signage to Level 2 west restroom.',
    },
  },
  {
    id: 'inc_005',
    tenantId: TENANT_ID,
    source: 'social_media',
    tier: 5 as InfoTier,
    status: 'OPEN',
    rawText:
      'Long concession queues at Section 200 causing congestion in the vomitory. No safety risk, advisory only.',
    timestamp: now - 900_000,
    coordinates: { x: 720, y: 300 },
    extractedMetadata: {
      category: 'ADVISORY',
      severity: 'LOW',
      locationSector: 'CONC-200',
      actionRequired:
        'Monitor queue length; open auxiliary point if congestion worsens.',
    },
  },
  {
    id: 'inc_006',
    tenantId: TENANT_ID,
    source: 'field_staff',
    tier: 4 as InfoTier,
    status: 'RESOLVED',
    rawText:
      'Spilled beverage on main concourse near Section 105 — cleaned, area dried, signage removed.',
    timestamp: now - 1_800_000,
    coordinates: { x: 280, y: 540 },
    extractedMetadata: {
      category: 'FACILITIES',
      severity: 'LOW',
      locationSector: 'CONC-105',
      actionRequired: 'Resolved.',
    },
  },
];

// ─── Dispatch Directives ──────────────────────────────────────────────────────

export const mockDispatches: DispatchDirective[] = [
  {
    id: 'dsp_001',
    tenantId: TENANT_ID,
    incidentId: 'inc_002',
    targetStaffPhone: '+14155550001',
    directiveText:
      'Medical emergency — unresponsive patron, Gate C concourse (CONC-1C). Bring AED. Report on arrival.',
    status: 'ACKNOWLEDGED',
    sentTimestamp: now - 175_000,
    ackTimestamp: now - 160_000,
  },
  {
    id: 'dsp_002',
    tenantId: TENANT_ID,
    incidentId: 'inc_004',
    targetStaffPhone: '+14155550006',
    directiveText:
      'Facilities spill — Level 2 west restroom (L2-RR-W). Wet-floor signage + extraction. Report status.',
    status: 'SENT',
    sentTimestamp: now - 595_000,
  },
];

// ─── Tenant Roster ────────────────────────────────────────────────────────────

export interface TenantOption {
  tenantId: string;
  orgName: string;
}

/** Tenants available to a superadmin switcher. */
export const mockTenants: TenantOption[] = [
  { tenantId: 'tenant_metlife_ops', orgName: 'MetLife Stadium' },
  { tenantId: 'tenant_sofi_ops', orgName: 'SoFi Stadium' },
  { tenantId: 'tenant_hardrock_ops', orgName: 'Hard Rock Stadium' },
];
