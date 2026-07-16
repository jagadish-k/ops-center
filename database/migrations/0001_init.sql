-- ─────────────────────────────────────────────────────────────────────────────
-- Stadium Ops Grid Matrix — Initial Schema Migration
--
-- Target: Netlify Postgres (ADR-0002)
-- Types:  See src/types/index.ts (canonical) and docs/STRUCTURAL-TYPES.md
-- Run:    npm run db:migrate
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tenants ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    org_name    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Field Staff Roster ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_roster (
    id              TEXT PRIMARY KEY,                          -- E.164 phone number
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'staff')),
    specialty       TEXT NOT NULL CHECK (specialty IN ('security', 'medical', 'cleaning', 'supervisor')),
    assigned_zone   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'AVAILABLE'
                    CHECK (status IN ('AVAILABLE', 'DISPATCHED', 'OFF_DUTY')),
    phone_number    TEXT NOT NULL,
    coord_x         INTEGER CHECK (coord_x BETWEEN 0 AND 1000),
    coord_y         INTEGER CHECK (coord_y BETWEEN 0 AND 1000),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Incidents ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incidents (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    source          TEXT NOT NULL DEFAULT 'field_staff'
                    CHECK (source IN ('field_staff', 'social_media')),
    tier            SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 5),
    status          TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED')),
    raw_text        TEXT NOT NULL,
    category        TEXT CHECK (category IN ('SECURITY', 'MEDICAL', 'CROWD', 'FACILITIES', 'ADVISORY')),
    severity        TEXT CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    location_sector TEXT,
    action_required TEXT,
    coord_x         INTEGER CHECK (coord_x BETWEEN 0 AND 1000),
    coord_y         INTEGER CHECK (coord_y BETWEEN 0 AND 1000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Dispatches ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dispatches (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id),
    incident_id         TEXT NOT NULL REFERENCES incidents(id),
    target_staff_phone  TEXT NOT NULL,
    directive_text      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'SENT'
                        CHECK (status IN ('SENT', 'ACKNOWLEDGED', 'ON_SCENE', 'RESOLVED')),
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    ack_at              TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ
);

-- ── OTP Sessions (raw Twilio SMS — ADR-0003) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_sessions (
    phone       TEXT PRIMARY KEY,                          -- E.164 phone number
    code        TEXT NOT NULL,                             -- 6-digit code
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Operational Switch (temporal window enforcement) ─────────────────────────

CREATE TABLE IF NOT EXISTS config (
    id              TEXT PRIMARY KEY DEFAULT 'switch',
    window_start    TIMESTAMPTZ,
    window_end      TIMESTAMPTZ,
    operational     BOOLEAN NOT NULL DEFAULT false
);

-- ── Indexes (poll performance — ADR-0004) ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inc_tenant_updated  ON incidents (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_staff_tenant        ON staff_roster (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_staff      ON dispatches (target_staff_phone, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_tenant     ON dispatches (tenant_id, status);

-- ── updated_at auto-touch trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incidents_touch ON incidents;
CREATE TRIGGER trg_incidents_touch BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_staff_touch ON staff_roster;
CREATE TRIGGER trg_staff_touch BEFORE UPDATE ON staff_roster
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Seed Data ────────────────────────────────────────────────────────────────

INSERT INTO tenants (id, org_name) VALUES
    ('tenant_metlife_ops', 'MetLife Stadium Ops Core'),
    ('tenant_sofi_ops', 'SoFi Stadium Command Center'),
    ('tenant_hardrock_ops', 'Hard Rock Tournament Hub')
ON CONFLICT (id) DO NOTHING;

INSERT INTO config (id, window_start, window_end, operational) VALUES
    ('switch', now() - INTERVAL '1 day', now() + INTERVAL '30 days', true)
ON CONFLICT (id) DO NOTHING;

-- Seed one admin + two staff per the first tenant (for local dev only).
-- These phone numbers are used in auth-bootstrap tests.
INSERT INTO staff_roster (id, tenant_id, full_name, role, specialty, assigned_zone, phone_number) VALUES
    ('+14155552026', 'tenant_metlife_ops', 'Command Coordinator', 'admin', 'supervisor', 'ZONE-A', '+14155552026'),
    ('+14155550001', 'tenant_metlife_ops', 'Alpha Security Lead', 'staff', 'security', 'ZONE-A', '+14155550001'),
    ('+14155550002', 'tenant_metlife_ops', 'Beta Medical Triage', 'staff', 'medical', 'ZONE-B', '+14155550002')
ON CONFLICT (id) DO NOTHING;
