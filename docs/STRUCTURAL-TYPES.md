# SaaS Multi-Tenant Type Specifications

> **Authoritative types.** This document is the canonical type reference for
> the platform. It resolves all prior contradictions across `CODE-DESIGN.md`,
> `MULTI-TENANT-CONTEXT.md`, and the reference implementation docs. See
> [ADR-0007](adr/0007-five-tier-information-system.md) for the 5-tier decision.
> These types must match `src/types/index.ts` exactly.

Every dynamic operational asset, incident tracking vector, and system user is explicitly bound to a `tenantId` token to guarantee rigorous data isolation across independent stadium properties.

---

## 1. Unified TypeScript Manifest (`src/types/index.ts`)

```typescript
// src/types/index.ts — CANONICAL

export type OperationalRole = 'superadmin' | 'admin' | 'staff';

export type StaffSpecialty = 'security' | 'medical' | 'cleaning' | 'supervisor';

export type IncidentCategory = 'SECURITY' | 'MEDICAL' | 'CROWD' | 'FACILITIES' | 'ADVISORY';

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';

export type DispatchStatus = 'SENT' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';

export type StaffStatus = 'AVAILABLE' | 'DISPATCHED' | 'OFF_DUTY';

export type InfoTier = 1 | 2 | 3 | 4 | 5; // 5-tier system per ADR-0007

export interface MapCoordinates {
	x: number; // Normalized 0 to 1000 coordinate plane
	y: number; // Normalized 0 to 1000 coordinate plane
}

// Global Tenant Definition Frame
export interface TenantConfig {
	tenantId: string; // Unique ID for the stadium authority or tournament cluster
	orgName: string; // e.g., "MetLife Stadium Ops Core"
	createdAt: number;
	status: 'ACTIVE' | 'SUSPENDED';
}

// Tenant-Isolated Field Operator Contract Structure
export interface WhitelistUser {
	id: string; // E.164 phone number
	tenantId: string; // SaaS Isolation Boundary Token
	fullName: string;
	role: OperationalRole;
	specialty: StaffSpecialty;
	assignedZone: string;
	status: StaffStatus;
	phoneNumber: string;
	currentCoords?: MapCoordinates;
	createdAt: number;
}

// Tenant-Isolated Central Incident Telemetry Report
export interface IncidentReport {
	id: string;
	tenantId: string; // SaaS Isolation Boundary Token
	source: 'field_staff' | 'social_media';
	tier: InfoTier;
	status: IncidentStatus;
	rawText: string;
	timestamp: number;
	coordinates: MapCoordinates;
	extractedMetadata: {
		category: IncidentCategory;
		severity: IncidentSeverity;
		locationSector: string;
		actionRequired?: string;
	};
}

// Tenant-Isolated Dispatch Directive
export interface DispatchDirective {
	id: string;
	tenantId: string;
	incidentId: string;
	targetStaffPhone: string;
	directiveText: string;
	status: DispatchStatus;
	sentTimestamp: number;
	ackTimestamp?: number;
	resolvedTimestamp?: number;
}

// Immutable Event Logging Contract (Audit Forensic Trail)
export interface AuditLogEntry {
	eventId: string;
	tenantId: string; // Tenant partition validation link
	timestamp: number;
	actor: {
		uid: string;
		role: OperationalRole;
		phoneOrEmail: string;
		deviceFingerprint: string;
		ipAddress: string;
	};
	action: string; // e.g., "INCIDENT_STATUS_MUTATION", "PHONE_AUTH_BOOTSTRAP"
	targetResourceId: string;
	stateDelta: {
		before: Record<string, unknown> | null;
		after: Record<string, unknown> | null;
	};
	cryptographicHash: string; // SHA-256 block chain linkage hash
}
```

### Resolution Notes

The following contradictions in earlier docs are resolved here:

| Field | Old (contradicting) values | Resolved value |
| --- | --- | --- |
| Staff name | `name` vs `fullName` | **`fullName`** |
| Staff status | `AVAILABLE\|DISPATCHED\|OFF_DUTY` vs `ACTIVE\|OFF_DUTY` | **`StaffStatus`** (AVAILABLE/DISPATCHED/OFF_DUTY) |
| Incident status | `...\|DISPATCHED\|CLOSED` vs `...\|ON_SCENE\|RESOLVED` | **`IncidentStatus`** (OPEN/ACKNOWLEDGED/ON_SCENE/RESOLVED) |
| Tiers | `1\|2\|3` vs `1\|2\|3\|4\|5` | **`InfoTier`** = 1–5 (ADR-0007) |
| Specialty | `cleaning\|supervisor` vs `logistics\|command` | **`StaffSpecialty`** (security/medical/cleaning/supervisor) |
