/**
 * Zod schemas for admin forms (M9.5).
 *
 * Used with react-hook-form via @hookform/resolvers/zod. Schemas serve as
 * both the form-validation layer and the source of truth for TypeScript
 * types via z.infer.
 */
import { z } from 'zod';

// ─── Staff / Users ───────────────────────────────────────────────────────────

export const STAFF_SPECIALTIES = ['security', 'medical', 'cleaning', 'supervisor'] as const;
export const STAFF_ZONES = ['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'] as const;

export const createStaffSchema = z.object({
	phone: z
		.string()
		.min(1, 'Phone is required')
		.regex(/^\+\d{6,15}$/, 'Must be E.164 format: + and 6-15 digits'),
	fullName: z
		.string()
		.min(1, 'Full name is required')
		.max(100, 'Maximum 100 characters'),
	specialty: z.enum(['security', 'medical', 'cleaning', 'supervisor'], {
		invalid_type_error: 'Select a specialty',
		required_error: 'Select a specialty',
	}),
	assignedZone: z.enum(['ZONE-A', 'ZONE-B', 'ZONE-C', 'ZONE-D', 'ZONE-E', 'ZONE-F'], {
		invalid_type_error: 'Select a zone',
		required_error: 'Select a zone',
	}),
	roles: z.array(z.string()).min(1, 'At least one role is required'),
});
export type CreateStaffForm = z.infer<typeof createStaffSchema>;

export const updateUserSchema = z.object({
	fullName: z.string().min(1).max(100),
	status: z.enum(['active', 'disabled']),
});
export type UpdateUserForm = z.infer<typeof updateUserSchema>;

// ─── Roles ───────────────────────────────────────────────────────────────────

export const createRoleSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(40)
		.regex(/^[a-z][a-z0-9_-]*$/i, 'Letters, digits, underscore, hyphen only; must start with a letter'),
	description: z
		.string()
		.min(1, 'Description is required')
		.max(200),
	permissions: z.array(z.string()).min(1, 'Pick at least one permission'),
});
export type CreateRoleForm = z.infer<typeof createRoleSchema>;

// ─── Tenants ─────────────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
	tenantId: z
		.string()
		.min(1, 'Tenant ID is required')
		.regex(/^tenant_[a-z0-9_]+$/, 'Must start with "tenant_" and use lowercase + underscore'),
	orgName: z
		.string()
		.min(1, 'Organization name is required')
		.max(120),
	// Bounding box is optional — defaults to a small box if omitted.
	bboxMinLat: z.number().optional(),
	bboxMaxLat: z.number().optional(),
	bboxMinLng: z.number().optional(),
	bboxMaxLng: z.number().optional(),
});
export type CreateTenantForm = z.infer<typeof createTenantSchema>;

// ─── Cascade revoke ──────────────────────────────────────────────────────────

export const cascadeRevokeSchema = z.object({
	permission: z.string().min(1),
	userIds: z.array(z.string()).min(1, 'Select at least one user').max(100, 'Maximum 100 users per batch'),
});
export type CascadeRevokeForm = z.infer<typeof cascadeRevokeSchema>;
