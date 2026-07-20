import { describe, it, expect } from 'vitest';
import {
  gpsToGrid,
  haversineMeters,
  type BoundingBox,
} from '../../netlify/lib/geo';

/**
 * Tests for geographic utilities (netlify/lib/geo.ts).
 * Pure functions — no DB or API calls.
 */

const METLIFE_BBOX: BoundingBox = {
  minLat: 40.8113,
  maxLat: 40.8143,
  minLng: -74.0757,
  maxLng: -74.0727,
};

describe('gpsToGrid', () => {
  it('projects the center of the bounding box to grid center', () => {
    const centerLat = (METLIFE_BBOX.minLat + METLIFE_BBOX.maxLat) / 2;
    const centerLng = (METLIFE_BBOX.minLng + METLIFE_BBOX.maxLng) / 2;
    const result = gpsToGrid(centerLat, centerLng, METLIFE_BBOX);
    expect(result.x).toBe(500);
    expect(result.y).toBe(500);
  });

  it('projects the NW corner to (0, 0)', () => {
    const result = gpsToGrid(
      METLIFE_BBOX.maxLat,
      METLIFE_BBOX.minLng,
      METLIFE_BBOX,
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('projects the SE corner to (1000, 1000)', () => {
    const result = gpsToGrid(
      METLIFE_BBOX.minLat,
      METLIFE_BBOX.maxLng,
      METLIFE_BBOX,
    );
    expect(result.x).toBe(1000);
    expect(result.y).toBe(1000);
  });

  it('clamps coordinates outside the bounding box', () => {
    const result = gpsToGrid(41.0, -75.0, METLIFE_BBOX);
    expect(result.x).toBe(0); // far west → clamped to 0
    expect(result.y).toBe(0); // far north → clamped to 0
  });

  it('Y is inverted (north = top = low Y)', () => {
    const north = gpsToGrid(METLIFE_BBOX.maxLat, 0, METLIFE_BBOX);
    const south = gpsToGrid(METLIFE_BBOX.minLat, 0, METLIFE_BBOX);
    // North should have lower Y than south.
    expect(north.y).toBeLessThan(south.y);
  });
});

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(40.8128, -74.0742, 40.8128, -74.0742)).toBe(0);
  });

  it('measures ~111m for 0.001 degree latitude', () => {
    const dist = haversineMeters(40.8128, -74.0742, 40.8138, -74.0742);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });

  it('measures ~3m for a small GPS shift (the debounce threshold)', () => {
    // 3 meters ≈ 0.000027 degrees latitude at this latitude
    const shift = 0.000027;
    const dist = haversineMeters(40.8128, -74.0742, 40.8128 + shift, -74.0742);
    expect(dist).toBeGreaterThanOrEqual(2.8);
    expect(dist).toBeLessThanOrEqual(3.5);
  });

  it('handles antipodal points (max distance)', () => {
    const dist = haversineMeters(0, 0, 0, 180);
    // Half the Earth's circumference ≈ 20,015 km
    expect(dist).toBeGreaterThan(19_000_000);
    expect(dist).toBeLessThan(21_000_000);
  });
});
