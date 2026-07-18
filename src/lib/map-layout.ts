/**
 * Map layout types — the structure of the `tenants.map_layout` JSONB column.
 *
 * Defines floors, zones (with polygon shapes), and points of interest
 * (gates, restrooms, first aid, etc.) for the OptimizedStadiumMapCanvas.
 *
 * Superadmins edit this layout via the Tenants tab → "Map Layout" section.
 */

/** A point on the 0–1000 grid. */
export interface GridPoint {
  x: number;
  y: number;
}

/** Types of points of interest on the map. */
export type POIType =
  | 'entry' // Gate / entrance
  | 'exit' // Exit
  | 'restroom' // Restroom
  | 'first_aid' // First aid station
  | 'concession' // Food / merchandise
  | 'security_post' // Security checkpoint
  | 'elevator' // Elevator
  | 'stairs' // Stairwell
  | 'parking' // Parking area
  | 'vomitory' // Tunnel from concourse to seating
  | 'custom'; // Custom POI (user-defined)

/** A point of interest (gate, restroom, etc.). */
export interface MapPOI {
  id: string;
  name: string;
  type: POIType;
  x: number;
  y: number;
  /** Optional notes (e.g., "AED available", "Staffed during events"). */
  notes?: string;
}

/** A zone/sector of the stadium. Supports rect, circle, and freehand polygon. */
export type ZoneShape = 'rect' | 'circle' | 'polygon';

export interface MapZone {
  id: string;
  name: string;
  shape: ZoneShape;
  /** For rect: 4 corner points. For polygon: N points. For circle: unused (use circle field). */
  polygon: GridPoint[];
  /** For circle shape only: center + radius in grid units. */
  circle?: { center: GridPoint; radius: number };
  /** Fill color for the zone (hex). */
  color: string;
  /** Center point for label placement. */
  anchor: GridPoint;
}

/** A floor/level of the stadium. */
export interface MapFloor {
  id: string;
  name: string;
  /** Level number (0 = ground, 1 = second level, -1 = basement, etc.) */
  level: number;
  /** Zones on this floor. */
  zones: MapZone[];
  /** Points of interest on this floor. */
  pois: MapPOI[];
}

/** The complete map layout for a tenant. */
export interface MapLayout {
  floors: MapFloor[];
  /** Default floor ID to show when the map loads. */
  defaultFloorId?: string;
  /** Optional geographic bounds (Top-Left & Bottom-Right) to map the 0-1000 grid to real-world coordinates. */
  geoBounds?: {
    north: number; // Top Latitude
    south: number; // Bottom Latitude
    east: number; // Right Longitude
    west: number; // Left Longitude
  };
  /** Optional real map provider to render under the zones instead of the grid. */
  mapProvider?: 'openmaps' | 'google';
}

// ─── Default layout for MetLife Stadium (seeded) ──────────────────────────────

export const METLIFE_MAP_LAYOUT: MapLayout = {
  defaultFloorId: 'ground',
  mapProvider: 'openmaps',
  geoBounds: {
    north: 40.815,
    south: 40.812,
    east: -74.072,
    west: -74.076,
  },
  floors: [
    {
      id: 'ground',
      name: 'Ground Level (Concourse)',
      level: 0,
      zones: [
        {
          id: 'zone-a',
          name: 'ZONE-A (Gate A / West)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 100 },
            { x: 450, y: 100 },
            { x: 450, y: 450 },
            { x: 100, y: 450 },
          ],
          color: '#3b82f6',
          anchor: { x: 275, y: 275 },
        },
        {
          id: 'zone-b',
          name: 'ZONE-B (Gate B / South)',
          shape: 'rect',
          polygon: [
            { x: 450, y: 100 },
            { x: 800, y: 100 },
            { x: 800, y: 450 },
            { x: 450, y: 450 },
          ],
          color: '#22c55e',
          anchor: { x: 625, y: 275 },
        },
        {
          id: 'zone-c',
          name: 'ZONE-C (Gate C / East)',
          shape: 'rect',
          polygon: [
            { x: 800, y: 100 },
            { x: 950, y: 100 },
            { x: 950, y: 450 },
            { x: 800, y: 450 },
          ],
          color: '#f59e0b',
          anchor: { x: 875, y: 275 },
        },
        {
          id: 'zone-d',
          name: 'ZONE-D (South Stands)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 450 },
            { x: 700, y: 450 },
            { x: 700, y: 800 },
            { x: 100, y: 800 },
          ],
          color: '#a855f7',
          anchor: { x: 400, y: 625 },
        },
        {
          id: 'zone-e',
          name: 'ZONE-E (Facilities)',
          shape: 'rect',
          polygon: [
            { x: 700, y: 450 },
            { x: 950, y: 450 },
            { x: 950, y: 800 },
            { x: 700, y: 800 },
          ],
          color: '#eab308',
          anchor: { x: 825, y: 625 },
        },
        {
          id: 'zone-f',
          name: 'ZONE-F (VIP / Suites)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 800 },
            { x: 950, y: 800 },
            { x: 950, y: 950 },
            { x: 100, y: 950 },
          ],
          color: '#ec4899',
          anchor: { x: 525, y: 875 },
        },
      ],
      pois: [
        {
          id: 'gate-a',
          name: 'Gate A',
          type: 'entry',
          x: 150,
          y: 100,
          notes: 'Main west entrance',
        },
        {
          id: 'gate-b',
          name: 'Gate B',
          type: 'entry',
          x: 625,
          y: 100,
          notes: 'Main south entrance',
        },
        {
          id: 'gate-c',
          name: 'Gate C',
          type: 'entry',
          x: 875,
          y: 100,
          notes: 'Main east entrance',
        },
        { id: 'exit-1', name: 'Exit 1', type: 'exit', x: 150, y: 900 },
        { id: 'exit-2', name: 'Exit 2', type: 'exit', x: 875, y: 900 },
        {
          id: 'restroom-1w',
          name: 'Restroom W1',
          type: 'restroom',
          x: 200,
          y: 300,
        },
        {
          id: 'restroom-1e',
          name: 'Restroom E1',
          type: 'restroom',
          x: 850,
          y: 300,
        },
        {
          id: 'first-aid-1',
          name: 'First Aid Station',
          type: 'first_aid',
          x: 500,
          y: 250,
          notes: 'Staffed during events; AED available',
        },
        {
          id: 'first-aid-2',
          name: 'First Aid South',
          type: 'first_aid',
          x: 400,
          y: 650,
        },
        {
          id: 'concession-1',
          name: 'Concession 100',
          type: 'concession',
          x: 300,
          y: 200,
        },
        {
          id: 'concession-2',
          name: 'Concession 200',
          type: 'concession',
          x: 750,
          y: 200,
        },
        {
          id: 'concession-3',
          name: 'Concession 300',
          type: 'concession',
          x: 500,
          y: 550,
        },
        {
          id: 'security-post-1',
          name: 'Security Checkpoint A',
          type: 'security_post',
          x: 200,
          y: 150,
        },
        {
          id: 'security-post-2',
          name: 'Security Checkpoint C',
          type: 'security_post',
          x: 850,
          y: 150,
        },
        {
          id: 'elevator-1',
          name: 'Elevator Bank 1',
          type: 'elevator',
          x: 400,
          y: 400,
        },
        {
          id: 'elevator-2',
          name: 'Elevator Bank 2',
          type: 'elevator',
          x: 700,
          y: 400,
        },
        { id: 'stairs-1', name: 'Stairs NW', type: 'stairs', x: 150, y: 400 },
        { id: 'stairs-2', name: 'Stairs SE', type: 'stairs', x: 850, y: 400 },
      ],
    },
    {
      id: 'level-200',
      name: 'Level 200 (Upper Concourse)',
      level: 1,
      zones: [
        {
          id: 'zone-a-200',
          name: 'ZONE-A Upper (Sec 200-230)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 100 },
            { x: 500, y: 100 },
            { x: 500, y: 500 },
            { x: 100, y: 500 },
          ],
          color: '#3b82f6',
          anchor: { x: 300, y: 300 },
        },
        {
          id: 'zone-b-200',
          name: 'ZONE-B Upper (Sec 231-260)',
          shape: 'rect',
          polygon: [
            { x: 500, y: 100 },
            { x: 900, y: 100 },
            { x: 900, y: 500 },
            { x: 500, y: 500 },
          ],
          color: '#22c55e',
          anchor: { x: 700, y: 300 },
        },
        {
          id: 'zone-c-200',
          name: 'ZONE-C Upper (Sec 261-300)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 500 },
            { x: 900, y: 500 },
            { x: 900, y: 900 },
            { x: 100, y: 900 },
          ],
          color: '#f59e0b',
          anchor: { x: 500, y: 700 },
        },
      ],
      pois: [
        {
          id: 'restroom-2w',
          name: 'Restroom L2-W',
          type: 'restroom',
          x: 200,
          y: 350,
        },
        {
          id: 'restroom-2e',
          name: 'Restroom L2-E',
          type: 'restroom',
          x: 800,
          y: 350,
        },
        {
          id: 'first-aid-200',
          name: 'First Aid L2',
          type: 'first_aid',
          x: 500,
          y: 300,
        },
        {
          id: 'concession-200a',
          name: 'Concourse 200-A',
          type: 'concession',
          x: 300,
          y: 200,
        },
        {
          id: 'concession-200b',
          name: 'Concourse 200-B',
          type: 'concession',
          x: 700,
          y: 200,
        },
        {
          id: 'elevator-l2-1',
          name: 'Elevator L2-1',
          type: 'elevator',
          x: 400,
          y: 400,
        },
        {
          id: 'elevator-l2-2',
          name: 'Elevator L2-2',
          type: 'elevator',
          x: 700,
          y: 400,
        },
        {
          id: 'vomitory-201',
          name: 'Vomitory 201',
          type: 'vomitory',
          x: 250,
          y: 150,
        },
        {
          id: 'vomitory-250',
          name: 'Vomitory 250',
          type: 'vomitory',
          x: 750,
          y: 150,
        },
      ],
    },
    {
      id: 'suite-level',
      name: 'Suite Level (CLUB)',
      level: 2,
      zones: [
        {
          id: 'zone-suites-n',
          name: 'Suites North (1-20)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 100 },
            { x: 900, y: 100 },
            { x: 900, y: 400 },
            { x: 100, y: 400 },
          ],
          color: '#ec4899',
          anchor: { x: 500, y: 250 },
        },
        {
          id: 'zone-suites-s',
          name: 'Suites South (21-40)',
          shape: 'rect',
          polygon: [
            { x: 100, y: 400 },
            { x: 900, y: 400 },
            { x: 900, y: 900 },
            { x: 100, y: 900 },
          ],
          color: '#a855f7',
          anchor: { x: 500, y: 650 },
        },
      ],
      pois: [
        {
          id: 'suite-lounge',
          name: 'Suite Lounge',
          type: 'concession',
          x: 500,
          y: 300,
        },
        {
          id: 'elevator-suite',
          name: 'Elevator Suite',
          type: 'elevator',
          x: 500,
          y: 450,
        },
        {
          id: 'restroom-suite',
          name: 'Restroom Suite',
          type: 'restroom',
          x: 300,
          y: 350,
        },
      ],
    },
  ],
};

// ─── POI visual config ────────────────────────────────────────────────────────

export const POI_ICONS: Record<POIType, string> = {
  entry: '🚪',
  exit: '🚪',
  restroom: '🚻',
  first_aid: '✚',
  concession: '🍔',
  security_post: '🛡',
  elevator: '🛗',
  stairs: '🪜',
  parking: '🅿',
  vomitory: '🚷',
  custom: '📍',
};

export const POI_COLORS: Record<POIType, string> = {
  entry: '#22c55e',
  exit: '#ef4444',
  restroom: '#3b82f6',
  first_aid: '#dc2626',
  concession: '#eab308',
  security_post: '#8b5cf6',
  elevator: '#6b7280',
  stairs: '#6b7280',
  parking: '#10b981',
  vomitory: '#f59e0b',
  custom: '#64748b',
};
