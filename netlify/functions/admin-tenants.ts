/**
 * POST /api/admin/tenants
 *
 * Superadmin-only tenant management. Actions:
 *
 *   { action: 'list' }                                   // tenant:switch
 *   { action: 'create', tenantId, orgName, bbox? }       // tenant:manage
 *
 * - `list` is available to anyone with `tenant:switch` (superadmin).
 * - `create` requires `tenant:manage` (superadmin only per ADR-0011).
 *
 * bbox is optional — GPS-to-grid projection falls back to a small box around
 * the caller's coordinates if absent (see staff-location.ts).
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import {
  authorizeAdminOp,
  AdminHttpError,
  adminErrorResponse,
  auditWrite,
} from '../lib/admin-helpers.ts';
import { db } from '../lib/db.ts';
import {
  tenantsTable,
  tenantAccessPeriodsTable,
  tenantContactsTable,
} from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import {
  jsonResponse,
  handlePreflight,
  badRequest,
  serverError,
} from '../lib/http.ts';

// ─── Update map layout ───────────────────────────────────────────────────────

async function updateMapLayout(
  claims: JwtClaimsLike,
  body: { tenantId: string; mapLayout: unknown },
): Promise<Response> {
  authorizeAdminOp(claims, 'tenant:manage');

  if (!body.tenantId || !body.mapLayout) {
    throw new AdminHttpError(
      400,
      'bad_request',
      'tenantId and mapLayout are required.',
    );
  }

  const layoutObj = body.mapLayout as {
    geoBounds?: { south: number; north: number; west: number; east: number };
  };
  const geo = layoutObj?.geoBounds;

  await db
    .update(tenantsTable)
    .set({
      mapLayout: body.mapLayout as never,
      ...(geo
        ? {
            bboxMinLat: geo.south,
            bboxMaxLat: geo.north,
            bboxMinLng: geo.west,
            bboxMaxLng: geo.east,
          }
        : {}),
    })
    .where(eq(tenantsTable.id, body.tenantId))
    .execute();

  await auditWrite({
    claims,
    tenantId: body.tenantId,
    action: 'TENANT_MAP_LAYOUT_UPDATE',
    targetResourceId: body.tenantId,
    stateDelta: {
      before: null,
      after: {
        layoutKeys: Object.keys(body.mapLayout as Record<string, unknown>),
      },
    },
  });

  return jsonResponse({ tenantId: body.tenantId, updated: true });
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function listTenants(claims: JwtClaims) {
  authorizeAdminOp(claims, 'tenant:switch');

  const tenants = await db.query.tenantsTable.findMany({
    with: {
      accessPeriods: true,
      contacts: true,
    },
  });

  return jsonResponse({ tenants });
}

interface CreateTenantBody {
  tenantId: string;
  orgName: string;
  bbox?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  tier?: string;
  healthScore?: number;
  renewalDate?: string | null;
  accountManagerId?: string | null;
  notes?: string | null;
}

async function createTenant(claims: JwtClaims, body: CreateTenantBody) {
  authorizeAdminOp(claims, 'tenant:manage');

  if (!body.tenantId || !body.orgName) {
    throw new AdminHttpError(
      400,
      'bad_request',
      'tenantId and orgName are required.',
    );
  }
  // Convention: tenant IDs are lower-snake (e.g., tenant_metlife_ops).
  if (!/^tenant_[a-z0-9_]+$/.test(body.tenantId)) {
    throw new AdminHttpError(
      400,
      'bad_request',
      'tenantId must match /^tenant_[a-z0-9_]+$/.',
    );
  }

  const existing = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, body.tenantId))
    .execute();
  if (existing.length > 0) {
    throw new AdminHttpError(
      409,
      'conflict',
      `Tenant already exists: ${body.tenantId}`,
    );
  }

  await db
    .insert(tenantsTable)
    .values({
      id: body.tenantId,
      orgName: body.orgName,
      bboxMinLat: body.bbox?.minLat,
      bboxMaxLat: body.bbox?.maxLat,
      bboxMinLng: body.bbox?.minLng,
      bboxMaxLng: body.bbox?.maxLng,
      tier: body.tier ?? 'BASIC',
      healthScore: body.healthScore ?? 100,
      renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
      accountManagerId: body.accountManagerId ?? null,
      notes: body.notes ?? null,
    })
    .execute();

  await auditWrite({
    claims,
    tenantId: body.tenantId,
    action: 'TENANT_CREATE',
    targetResourceId: body.tenantId,
    stateDelta: {
      before: null,
      after: { orgName: body.orgName, bbox: body.bbox ?? null },
    },
  });

  return jsonResponse({ tenantId: body.tenantId, created: true });
}

// ─── Update tenant status ───────────────────────────────────────────────────

async function updateTenantStatus(
  claims: JwtClaims,
  body: { tenantId: string; status: string },
) {
  authorizeAdminOp(claims, 'tenant:manage');

  if (!body.tenantId || !body.status) {
    throw new AdminHttpError(
      400,
      'bad_request',
      'tenantId and status are required.',
    );
  }

  const validStatuses = [
    'ACTIVE',
    'SUSPENDED',
    'PAUSED',
    'DEACTIVATED',
    'ARCHIVED',
  ];
  if (!validStatuses.includes(body.status)) {
    throw new AdminHttpError(
      400,
      'bad_request',
      `Invalid status. Must be one of ${validStatuses.join(', ')}`,
    );
  }

  await db
    .update(tenantsTable)
    .set({ status: body.status })
    .where(eq(tenantsTable.id, body.tenantId))
    .execute();

  await auditWrite({
    claims,
    tenantId: body.tenantId,
    action: 'TENANT_STATUS_UPDATE',
    targetResourceId: body.tenantId,
    stateDelta: { before: null, after: { status: body.status } },
  });

  return jsonResponse({
    tenantId: body.tenantId,
    status: body.status,
    updated: true,
  });
}

// ─── Update core details ────────────────────────────────────────────────────

async function updateTenantDetails(
  claims: JwtClaims,
  body: {
    tenantId?: string;
    orgName?: string;
    tier?: string;
    healthScore?: number;
    renewalDate?: string;
    accountManagerId?: string;
    notes?: string;
    bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  },
) {
  authorizeAdminOp(claims, 'tenant:manage');

  if (!body.tenantId)
    throw new AdminHttpError(400, 'bad_request', 'tenantId is required.');

  await db
    .update(tenantsTable)
    .set({
      orgName: body.orgName,
      tier: body.tier,
      healthScore: body.healthScore,
      renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
      accountManagerId: body.accountManagerId,
      notes: body.notes,
      ...(body.bbox
        ? {
            bboxMinLat: body.bbox.minLat,
            bboxMaxLat: body.bbox.maxLat,
            bboxMinLng: body.bbox.minLng,
            bboxMaxLng: body.bbox.maxLng,
          }
        : {}),
    })
    .where(eq(tenantsTable.id, body.tenantId))
    .execute();

  await auditWrite({
    claims,
    tenantId: body.tenantId,
    action: 'TENANT_UPDATE',
    targetResourceId: body.tenantId,
    stateDelta: { before: null, after: body },
  });

  return jsonResponse({ tenantId: body.tenantId, updated: true });
}

// ─── Contacts ───────────────────────────────────────────────────────────────

async function createContact(
  claims: JwtClaims,
  body: {
    tenantId?: string;
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  },
) {
  authorizeAdminOp(claims, 'tenant:manage');
  if (!body.tenantId || !body.name || !body.email) {
    throw new AdminHttpError(
      400,
      'bad_request',
      'tenantId, name, email are required.',
    );
  }

  const [result] = await db
    .insert(tenantContactsTable)
    .values({
      tenantId: body.tenantId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      role: body.role,
    })
    .returning();

  return jsonResponse({ contact: result });
}

async function deleteContact(claims: JwtClaims, body: { id?: string }) {
  authorizeAdminOp(claims, 'tenant:manage');
  if (!body.id) throw new AdminHttpError(400, 'bad_request', 'id is required.');
  await db
    .delete(tenantContactsTable)
    .where(eq(tenantContactsTable.id, body.id))
    .execute();
  return jsonResponse({ deleted: true });
}

// ─── Access Periods ──────────────────────────────────────────────────────────

async function createAccessPeriod(
  claims: JwtClaims,
  body: {
    tenantId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    notes?: string;
  },
) {
  authorizeAdminOp(claims, 'tenant:manage');
  if (!body.tenantId || !body.type || !body.startDate || !body.endDate) {
    throw new AdminHttpError(400, 'bad_request', 'Missing required fields.');
  }

  const [result] = await db
    .insert(tenantAccessPeriodsTable)
    .values({
      tenantId: body.tenantId,
      type: body.type,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      notes: body.notes,
    })
    .returning();

  return jsonResponse({ accessPeriod: result });
}

async function deleteAccessPeriod(claims: JwtClaims, body: { id?: string }) {
  authorizeAdminOp(claims, 'tenant:manage');
  if (!body.id) throw new AdminHttpError(400, 'bad_request', 'id is required.');
  await db
    .delete(tenantAccessPeriodsTable)
    .where(eq(tenantAccessPeriodsTable.id, body.id))
    .execute();
  return jsonResponse({ deleted: true });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async (request: Request): Promise<Response> => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const auth = await authorizeRequest(request);
  const notOk = authResponse(auth);
  if (notOk) return notOk;
  const claims = auth.claims;

  try {
    const body = (await request.json()) as {
      action: string;
      tenantId?: string;
      orgName?: string;
      bbox?: CreateTenantBody['bbox'];
      mapLayout?: unknown;
      status?: string;
      tier?: string;
      healthScore?: number;
      renewalDate?: string;
      accountManagerId?: string;
      notes?: string;
      id?: string; // used for deleting
      name?: string; // contact
      email?: string;
      phone?: string;
      role?: string;
      type?: string; // access period
      startDate?: string;
      endDate?: string;
    };

    switch (body.action) {
      case 'list':
        return await listTenants(claims);
      case 'create':
        return await createTenant(claims, {
          tenantId: body.tenantId ?? '',
          orgName: body.orgName ?? '',
          bbox: body.bbox,
          tier: body.tier,
          healthScore: body.healthScore,
          renewalDate: body.renewalDate,
          accountManagerId: body.accountManagerId,
          notes: body.notes,
        });
      case 'update':
        return await updateTenantDetails(claims, body);
      case 'create_contact':
        return await createContact(claims, body);
      case 'delete_contact':
        return await deleteContact(claims, body);
      case 'create_access_period':
        return await createAccessPeriod(claims, body);
      case 'delete_access_period':
        return await deleteAccessPeriod(claims, body);
      case 'update_map_layout':
        return await updateMapLayout(claims, {
          tenantId: body.tenantId ?? '',
          mapLayout: body.mapLayout,
        });
      case 'update_status':
        return await updateTenantStatus(claims, {
          tenantId: body.tenantId ?? '',
          status: body.status ?? '',
        });
      default:
        return badRequest(`Unknown action: ${body.action}`);
    }
  } catch (err) {
    if (err instanceof AdminHttpError) {
      return adminErrorResponse(err);
    }
    console.error('admin-tenants error:', err);
    return serverError('Admin operation failed.');
  }
};

export const config: Config = {
  path: '/api/admin/tenants',
};
