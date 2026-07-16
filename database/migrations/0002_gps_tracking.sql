-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002: GPS position tracking columns (B1 — PRD §7.1)
--
-- Adds raw GPS lat/lng to staff_roster for live position tracking, plus
-- bounding-box columns to tenants for GPS-to-grid projection.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Staff: raw GPS coordinates ───────────────────────────────────────────────

ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE staff_roster ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- ── Tenants: bounding box for GPS-to-grid projection ─────────────────────────
-- Each stadium has a different geographic footprint. The bounding box defines
-- the lat/lng corners that map to the 0-1000 grid.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bbox_min_lat DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bbox_max_lat DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bbox_min_lng DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bbox_max_lng DOUBLE PRECISION;

-- ── Seed: MetLife Stadium bounding box (approx 300m x 300m) ──────────────────
-- Center: 40.8128°N, 74.0742°W
-- The ~0.003° square covers the stadium bowl + immediate concourse.

UPDATE tenants SET
    bbox_min_lat = 40.8113,
    bbox_max_lat = 40.8143,
    bbox_min_lng = -74.0757,
    bbox_max_lng = -74.0727
WHERE id = 'tenant_metlife_ops';

-- SoFi and Hard Rock get placeholder boxes (centered on their coordinates).
-- These should be updated with real survey data per tenant.
UPDATE tenants SET
    bbox_min_lat = 33.9527,
    bbox_max_lat = 33.9557,
    bbox_min_lng = -118.3402,
    bbox_max_lng = -118.3372
WHERE id = 'tenant_sofi_ops';

UPDATE tenants SET
    bbox_min_lat = 25.9577,
    bbox_max_lat = 25.9607,
    bbox_min_lng = -80.2392,
    bbox_max_lng = -80.2362
WHERE id = 'tenant_hardrock_ops';
