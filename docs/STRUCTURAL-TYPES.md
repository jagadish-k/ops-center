# SaaS Multi-Tenant Type Specifications

This document defines the core type contracts for the multi-tenant SaaS architecture. Every dynamic operational asset, incident tracking vector, and system user is explicitly bound to a `tenantId` token to guarantee rigorous data isolation across independent stadium properties.

---

## 1. Unified TypeScript Manifest (`src/types/index.ts`)

```typescript
// src/types/index.ts

export type OperationalRole = 'superadmin' | 'admin' | 'staff';
export type IncidentCategory = 'SECURITY' | 'MEDICAL' | 'CROWD' | 'FACILITIES';
export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'RESOLVED';

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
	id: string;
	tenantId: string; // SaaS Isolation Boundary Token
	fullName: string;
	role: OperationalRole;
	specialty: 'security' | 'medical' | 'logistics' | 'command';
	assignedZone: string;
	status: 'ACTIVE' | 'OFF_DUTY';
	phone_number: string;
	currentCoords: MapCoordinates;
}

// Tenant-Isolated Central Incident Telemetry Report
export interface IncidentReport {
	id: string;
	tenantId: string; // SaaS Isolation Boundary Token
	tier: 1 | 2 | 3;
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
		before: Record<string, any> | null;
		after: Record<string, any> | null;
	};
	cryptographicHash: string; // SHA-256 block chain linkage hash
}
```
