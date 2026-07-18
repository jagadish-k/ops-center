/**
 * MapLayoutEditor — visual zone/POI/floor editor for tenant map layouts.
 *
 * Features:
 *   - SVG grid (0–1000) with mouse wheel zoom + drag pan
 *   - Three zone shapes: rectangle, circle, freehand polygon
 *   - POI placement (11 types)
 *   - Shift+click multi-select + bulk delete
 *   - Delete key + confirmation dialog
 *   - Floor management (add/remove/rename)
 *   - Save → POST /api/admin/tenants action=update_map_layout
 */
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Button,
  Input,
  Spinner,
  Modal,
  Label,
  Select,
  ListBox,
} from '@heroui/react';
import { adminUpdateMapLayout, ApiError } from '@/services/api';
import {
  type MapLayout,
  type MapFloor,
  type MapZone,
  type MapPOI,
  type POIType,
  type GridPoint,
  POI_ICONS,
  POI_COLORS,
} from '@/lib/map-layout';
import { GeoBoundsSelector } from './GeoBoundsSelector';
import {
  LeafletMapBackground,
  type LeafletMapRef,
} from '../shared/LeafletMapBackground';

// ─── Constants ───────────────────────────────────────────────────────────────

const GRID_MAX = 1000;
const ZONE_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#eab308',
  '#ec4899',
  '#10b981',
  '#ef4444',
];

const POI_TYPES: { value: POIType; label: string }[] = [
  { value: 'entry', label: '🚪 Entry / Gate' },
  { value: 'exit', label: '🚪 Exit' },
  { value: 'restroom', label: '🚻 Restroom' },
  { value: 'first_aid', label: '✚ First Aid' },
  { value: 'concession', label: '🍔 Concession' },
  { value: 'security_post', label: '🛡 Security Post' },
  { value: 'elevator', label: '🛗 Elevator' },
  { value: 'stairs', label: '🪜 Stairs' },
  { value: 'parking', label: '🅿 Parking' },
  { value: 'vomitory', label: '🚷 Vomitory' },
  { value: 'custom', label: '📍 Custom' },
];

type EditorMode = 'select' | 'rect' | 'circle' | 'freehand' | 'poi' | 'pan';
type ItemKey = string; // `zone:${floorId}:${zoneId}` or `poi:${floorId}:${poiId}`

// ─── Component ───────────────────────────────────────────────────────────────

interface MapLayoutEditorProps {
  tenantId: string;
  tenantName: string;
  initialLayout: MapLayout | null;
  onClose: () => void;
}

export function MapLayoutEditor({
  tenantId,
  tenantName,
  initialLayout,
  onClose,
}: MapLayoutEditorProps) {
  const [layout, setLayout] = useState<MapLayout>(
    initialLayout ?? { floors: [], defaultFloorId: undefined },
  );
  const [activeFloorId, setActiveFloorId] = useState<string>(
    layout.defaultFloorId ?? layout.floors[0]?.id ?? '',
  );
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectedPoiType, setSelectedPoiType] = useState<POIType>('entry');
  const [selected, setSelected] = useState<Set<ItemKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [isSettingBounds, setIsSettingBounds] = useState(false);
  const leafletMapRef = useRef<LeafletMapRef>(null);

  // Delete confirmation modal.
  const [deleteConfirm, setDeleteConfirm] = useState<Set<ItemKey> | null>(null);

  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    w: GRID_MAX,
    h: GRID_MAX,
  });

  // Sync Leaflet map with viewBox when in geo mode
  useEffect(() => {
    if (layout.geoBounds && leafletMapRef.current && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const scale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
      const contentW = viewBox.w * scale;
      const contentH = viewBox.h * scale;
      const offsetX = (rect.width - contentW) / 2 - viewBox.x * scale;
      const offsetY = (rect.height - contentH) / 2 - viewBox.y * scale;

      leafletMapRef.current.applyTransform(offsetX, offsetY, scale);
    }
  }, [viewBox, layout.geoBounds]);

  // Drawing state (rect / circle / freehand).
  const drawRef = useRef<{
    isDrawing: boolean;
    start: GridPoint | null;
    points: GridPoint[]; // for freehand
  }>({ isDrawing: false, start: null, points: [] });
  const [drawPreview, setDrawPreview] = useState<{
    shape: 'rect' | 'circle' | 'polygon';
    start?: GridPoint;
    end?: GridPoint;
    points?: GridPoint[];
  } | null>(null);

  // Pan state.
  const panRef = useRef<{
    startX: number;
    startY: number;
    vbX: number;
    vbY: number;
  } | null>(null);

  // Drag-to-move state for items (zones + POIs).
  const dragRef = useRef<{
    keys: Set<ItemKey>;
    lastGrid: GridPoint;
    hasMoved: boolean;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const activeFloor = useMemo(
    () => layout.floors.find((f) => f.id === activeFloorId) ?? null,
    [layout, activeFloorId],
  );

  // ─── Coordinate helpers ──────────────────────────────────────────────────

  const toGrid = useCallback(
    (clientX: number, clientY: number): GridPoint => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w;
      const y = viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h;
      return {
        x: Math.max(0, Math.min(GRID_MAX, Math.round(x))),
        y: Math.max(0, Math.min(GRID_MAX, Math.round(y))),
      };
    },
    [viewBox],
  );

  const updateFloor = useCallback(
    (floorId: string, updater: (floor: MapFloor) => MapFloor) => {
      setLayout((prev) => ({
        ...prev,
        floors: prev.floors.map((f) => (f.id === floorId ? updater(f) : f)),
      }));
    },
    [],
  );

  // Move all selected items by (dx, dy) in grid coordinates. Single state update.
  const moveSelectedItems = useCallback(
    (keys: Set<ItemKey>, dx: number, dy: number) => {
      setLayout((prev) => ({
        ...prev,
        floors: prev.floors.map((floor) => ({
          ...floor,
          zones: floor.zones.map((zone) => {
            if (!keys.has(`zone:${floor.id}:${zone.id}`)) return zone;
            return {
              ...zone,
              polygon: zone.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              anchor: { x: zone.anchor.x + dx, y: zone.anchor.y + dy },
              circle: zone.circle
                ? {
                    center: {
                      x: zone.circle.center.x + dx,
                      y: zone.circle.center.y + dy,
                    },
                    radius: zone.circle.radius,
                  }
                : undefined,
            };
          }),
          pois: floor.pois.map((poi) => {
            if (!keys.has(`poi:${floor.id}:${poi.id}`)) return poi;
            return { ...poi, x: poi.x + dx, y: poi.y + dy };
          }),
        })),
      }));
    },
    [],
  );

  // ─── Zoom / Pan ──────────────────────────────────────────────────────────

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pos = toGrid(e.clientX, e.clientY);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const newW = Math.max(200, Math.min(GRID_MAX * 2, viewBox.w * factor));
    const newH = newW; // Keep aspect ratio square
    // Keep cursor point fixed in grid space.
    const newX = pos.x - ((pos.x - viewBox.x) * newW) / viewBox.w;
    const newY = pos.y - ((pos.y - viewBox.y) * newH) / viewBox.h;
    setViewBox({
      x: Math.max(-200, Math.min(GRID_MAX, newX)),
      y: Math.max(-200, Math.min(GRID_MAX, newY)),
      w: newW,
      h: newH,
    });
  };

  const resetZoom = () => setViewBox({ x: 0, y: 0, w: GRID_MAX, h: GRID_MAX });

  // ─── Mouse interaction ───────────────────────────────────────────────────

  // Called when the user mousedowns on a zone or POI element.
  const handleItemMouseDown = (e: React.MouseEvent, key: ItemKey) => {
    e.stopPropagation();

    // In drawing modes, clicking an item selects it (no drag).
    if (mode !== 'select') {
      toggleSelect(key, e.shiftKey);
      return;
    }

    // Shift+click = multi-select toggle (no drag).
    if (e.shiftKey) {
      toggleSelect(key, true);
      return;
    }

    // Regular click in select mode: select (if not already) + prepare drag.
    if (!selected.has(key)) {
      setSelected(new Set([key]));
    }

    const pos = toGrid(e.clientX, e.clientY);
    // Drag ALL currently selected items together.
    dragRef.current = {
      keys: selected.has(key) ? new Set(selected) : new Set([key]),
      lastGrid: pos,
      hasMoved: false,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!activeFloor) return;
    const pos = toGrid(e.clientX, e.clientY);

    // Pan mode or middle-click.
    if (mode === 'pan' || e.button === 1) {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        vbX: viewBox.x,
        vbY: viewBox.y,
      };
      return;
    }

    // Drawing modes.
    if (mode === 'rect' || mode === 'circle') {
      drawRef.current = { isDrawing: true, start: pos, points: [] };
      return;
    }

    if (mode === 'freehand') {
      drawRef.current = { isDrawing: true, start: pos, points: [pos] };
      return;
    }

    // POI placement.
    if (mode === 'poi') {
      const newPoi: MapPOI = {
        id: `poi_${Date.now()}`,
        name: `${selectedPoiType}_${activeFloor.pois.length + 1}`,
        type: selectedPoiType,
        x: pos.x,
        y: pos.y,
      };
      updateFloor(activeFloor.id, (f) => ({ ...f, pois: [...f.pois, newPoi] }));
      // Don't switch to select — let user place more.
      return;
    }

    // Select mode — clicking empty space deselects (unless shift).
    if (mode === 'select' && !e.shiftKey) {
      // Only deselect if we didn't click on an item (items stopPropagation).
      // This fires when clicking empty SVG area.
      setSelected(new Set());
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // Pan.
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (svgRect) {
        const gridDx = (dx / svgRect.width) * viewBox.w;
        const gridDy = (dy / svgRect.height) * viewBox.h;
        setViewBox((prev) => ({
          ...prev,
          x: panRef.current!.vbX - gridDx,
          y: panRef.current!.vbY - gridDy,
        }));
      }
      return;
    }

    // Drag-to-move items.
    if (dragRef.current && mode === 'select') {
      const pos = toGrid(e.clientX, e.clientY);
      const dx = pos.x - dragRef.current.lastGrid.x;
      const dy = pos.y - dragRef.current.lastGrid.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        dragRef.current.hasMoved = true;
        moveSelectedItems(dragRef.current.keys, dx, dy);
        dragRef.current.lastGrid = pos;
      }
      return;
    }

    if (!drawRef.current.isDrawing || !activeFloor) return;
    const pos = toGrid(e.clientX, e.clientY);
    const start = drawRef.current.start!;

    if (mode === 'rect') {
      setDrawPreview({ shape: 'rect', start, end: pos });
    } else if (mode === 'circle') {
      setDrawPreview({ shape: 'circle', start, end: pos });
    } else if (mode === 'freehand') {
      drawRef.current.points.push(pos);
      setDrawPreview({ shape: 'polygon', points: [...drawRef.current.points] });
    }
  };

  const handleMouseUp = () => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }

    // Finalize item drag — if no movement, it was just a click (selection
    // already handled in handleItemMouseDown).
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }

    if (!drawRef.current.isDrawing || !activeFloor) {
      drawRef.current = { isDrawing: false, start: null, points: [] };
      return;
    }

    const start = drawRef.current.start!;
    const colorIdx = activeFloor.zones.length % ZONE_COLORS.length;

    if (mode === 'rect') {
      const minX = Math.min(start.x, drawPreview?.end?.x ?? start.x);
      const minY = Math.min(start.y, drawPreview?.end?.y ?? start.y);
      const maxX = Math.max(start.x, drawPreview?.end?.x ?? start.x);
      const maxY = Math.max(start.y, drawPreview?.end?.y ?? start.y);
      if (maxX - minX < 20 || maxY - minY < 20) {
        drawRef.current = { isDrawing: false, start: null, points: [] };
        setDrawPreview(null);
        return;
      }
      const newZone: MapZone = {
        id: `zone_${Date.now()}`,
        name: `Zone ${activeFloor.zones.length + 1}`,
        shape: 'rect',
        polygon: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
        color: ZONE_COLORS[colorIdx],
        anchor: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      };
      updateFloor(activeFloor.id, (f) => ({
        ...f,
        zones: [...f.zones, newZone],
      }));
      setSelected(new Set([`zone:${activeFloor.id}:${newZone.id}`]));
      setMode('select');
    } else if (mode === 'circle') {
      const end = drawPreview?.end ?? start;
      const radius = Math.round(Math.hypot(end.x - start.x, end.y - start.y));
      if (radius < 20) {
        drawRef.current = { isDrawing: false, start: null, points: [] };
        setDrawPreview(null);
        return;
      }
      const newZone: MapZone = {
        id: `zone_${Date.now()}`,
        name: `Zone ${activeFloor.zones.length + 1}`,
        shape: 'circle',
        polygon: [],
        circle: { center: start, radius },
        color: ZONE_COLORS[colorIdx],
        anchor: start,
      };
      updateFloor(activeFloor.id, (f) => ({
        ...f,
        zones: [...f.zones, newZone],
      }));
      setSelected(new Set([`zone:${activeFloor.id}:${newZone.id}`]));
      setMode('select');
    } else if (mode === 'freehand') {
      const points = drawRef.current.points;
      if (points.length < 3) {
        drawRef.current = { isDrawing: false, start: null, points: [] };
        setDrawPreview(null);
        return;
      }
      const cx = Math.round(
        points.reduce((s, p) => s + p.x, 0) / points.length,
      );
      const cy = Math.round(
        points.reduce((s, p) => s + p.y, 0) / points.length,
      );
      const newZone: MapZone = {
        id: `zone_${Date.now()}`,
        name: `Zone ${activeFloor.zones.length + 1}`,
        shape: 'polygon',
        polygon: points,
        color: ZONE_COLORS[colorIdx],
        anchor: { x: cx, y: cy },
      };
      updateFloor(activeFloor.id, (f) => ({
        ...f,
        zones: [...f.zones, newZone],
      }));
      setSelected(new Set([`zone:${activeFloor.id}:${newZone.id}`]));
      setMode('select');
    }

    drawRef.current = { isDrawing: false, start: null, points: [] };
    setDrawPreview(null);
  };

  // ─── Selection helpers ──────────────────────────────────────────────────

  const toggleSelect = (key: ItemKey, shiftKey: boolean) => {
    setSelected((prev) => {
      if (shiftKey) {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }
      return new Set([key]);
    });
  };

  // ─── Keyboard delete ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selected.size > 0 &&
        !deleteConfirm
      ) {
        // Don't trigger if focus is in an input.
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT'
        )
          return;
        e.preventDefault();
        setDeleteConfirm(new Set(selected));
      }
      if (e.key === 'Escape') {
        setSelected(new Set());
        setMode('select');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, deleteConfirm]);

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    for (const key of deleteConfirm) {
      const [kind, floorId, itemId] = key.split(':');
      if (kind === 'zone') {
        updateFloor(floorId, (f) => ({
          ...f,
          zones: f.zones.filter((z) => z.id !== itemId),
        }));
      } else if (kind === 'poi') {
        updateFloor(floorId, (f) => ({
          ...f,
          pois: f.pois.filter((p) => p.id !== itemId),
        }));
      }
    }
    setSelected(new Set());
    setDeleteConfirm(null);
  };

  // ─── CRUD ───────────────────────────────────────────────────────────────

  const updateZone = (
    floorId: string,
    zoneId: string,
    updates: Partial<MapZone>,
  ) => {
    updateFloor(floorId, (f) => ({
      ...f,
      zones: f.zones.map((z) => (z.id === zoneId ? { ...z, ...updates } : z)),
    }));
  };
  const updatePoi = (
    floorId: string,
    poiId: string,
    updates: Partial<MapPOI>,
  ) => {
    updateFloor(floorId, (f) => ({
      ...f,
      pois: f.pois.map((p) => (p.id === poiId ? { ...p, ...updates } : p)),
    }));
  };
  const addFloor = () => {
    const newFloor: MapFloor = {
      id: `floor_${Date.now()}`,
      name: `New Floor ${layout.floors.length + 1}`,
      level: layout.floors.length,
      zones: [],
      pois: [],
    };
    setLayout((prev) => ({ ...prev, floors: [...prev.floors, newFloor] }));
    setActiveFloorId(newFloor.id);
  };
  const deleteFloor = (floorId: string) => {
    if (layout.floors.length <= 1) return;
    setLayout((prev) => ({
      ...prev,
      floors: prev.floors.filter((f) => f.id !== floorId),
    }));
    if (activeFloorId === floorId) {
      const remaining = layout.floors.filter((f) => f.id !== floorId);
      setActiveFloorId(remaining[0]?.id ?? '');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSavedMsg(null);
    try {
      await adminUpdateMapLayout(tenantId, layout);
      setSavedMsg('✓ Layout saved');
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : 'Failed to save layout',
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Selected item details for right panel ──────────────────────────────

  const selectedZones = useMemo(() => {
    const result: { floor: MapFloor; zone: MapZone }[] = [];
    for (const key of selected) {
      const [kind, floorId, zoneId] = key.split(':');
      if (kind === 'zone') {
        const floor = layout.floors.find((f) => f.id === floorId);
        const zone = floor?.zones.find((z) => z.id === zoneId);
        if (floor && zone) result.push({ floor, zone });
      }
    }
    return result;
  }, [selected, layout]);

  const selectedPois = useMemo(() => {
    const result: { floor: MapFloor; poi: MapPOI }[] = [];
    for (const key of selected) {
      const [kind, floorId, poiId] = key.split(':');
      if (kind === 'poi') {
        const floor = layout.floors.find((f) => f.id === floorId);
        const poi = floor?.pois.find((p) => p.id === poiId);
        if (floor && poi) result.push({ floor, poi });
      }
    }
    return result;
  }, [selected, layout]);

  const singleZone = selectedZones.length === 1 ? selectedZones[0] : null;
  const singlePoi = selectedPois.length === 1 ? selectedPois[0] : null;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950">
      {isSettingBounds && (
        <GeoBoundsSelector
          onSave={(bounds, mapProvider) => {
            setLayout((prev) => ({ ...prev, geoBounds: bounds, mapProvider }));
            setIsSettingBounds(false);
          }}
          onCancel={() => setIsSettingBounds(false)}
        />
      )}
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-2">
        <h1 className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">
          Map Layout Editor — {tenantName}
        </h1>
        <span className="font-mono text-[10px] text-slate-900 dark:text-slate-500">
          Zoom: {Math.round((GRID_MAX / viewBox.w) * 100)}%
        </span>
        <button
          onClick={resetZoom}
          className="rounded px-2 py-0.5 text-[10px] text-blue-400 hover:bg-slate-200 dark:bg-slate-800"
        >
          Reset Zoom
        </button>
        <div className="ml-auto flex items-center gap-2">
          {savedMsg && (
            <span className="text-xs text-emerald-400">{savedMsg}</span>
          )}
          {saveError && (
            <span className="text-xs text-red-400">{saveError}</span>
          )}
          <Button
            size="sm"
            variant="primary"
            onPress={handleSave}
            isDisabled={saving}
          >
            {saving ? <Spinner size="sm" /> : 'Save Layout'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={onClose}
          >
            ✕ Close
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <aside className="w-52 shrink-0 overflow-auto border-r border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40 p-3">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
            Floors
          </h3>
          <div className="space-y-1">
            {layout.floors.map((floor) => (
              <div
                key={floor.id}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${activeFloorId === floor.id ? 'bg-blue-900/40 text-blue-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-800/40'}`}
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    setActiveFloorId(floor.id);
                    setSelected(new Set());
                  }}
                >
                  {floor.name}
                  <span className="ml-1 text-[9px] text-slate-600">
                    ({floor.zones.length}z/{floor.pois.length}p)
                  </span>
                </button>
                {layout.floors.length > 1 && (
                  <button
                    className="text-slate-600 hover:text-red-400"
                    onClick={() => deleteFloor(floor.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="mt-2 w-full rounded border border-slate-300 dark:border-slate-700 py-1 text-[10px] uppercase text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-800/40"
            onClick={addFloor}
          >
            + Add Floor
          </button>

          {/* Tools */}
          <h3 className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
            Tools
          </h3>
          <div className="space-y-1">
            {(
              [
                ['select', '🖱 Select'],
                ['rect', '▭ Rect Zone'],
                ['circle', '⬭ Circle Zone'],
                ['freehand', '✏ Freehand Zone'],
                ['pan', '✋ Pan'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs ${mode === m ? 'bg-blue-900/40 text-blue-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-800/40'}`}
                onClick={() => {
                  setMode(m);
                  drawRef.current = {
                    isDrawing: false,
                    start: null,
                    points: [],
                  };
                  setDrawPreview(null);
                }}
              >
                {label}
                {mode === m && m !== 'select' && m !== 'pan' && (
                  <span className="ml-auto text-[8px] text-amber-400">
                    drag to draw
                  </span>
                )}
              </button>
            ))}
            <div
              className={`rounded px-2 py-1 ${mode === 'poi' ? 'bg-blue-900/40' : ''}`}
            >
              <button
                className={`flex w-full items-center gap-2 text-xs ${mode === 'poi' ? 'text-blue-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-800/40'}`}
                onClick={() => setMode('poi')}
              >
                📍 Place POI
              </button>
              {mode === 'poi' && (
                <Select
                  className="mt-1 w-full"
                  selectedKey={selectedPoiType}
                  onSelectionChange={(k) => setSelectedPoiType(k as POIType)}
                >
                  <Select.Trigger className="neu-pressed text-[10px]">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {POI_TYPES.map((pt) => (
                        <ListBox.Item
                          key={pt.value}
                          id={pt.value}
                          textValue={pt.label}
                        >
                          {pt.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              )}
            </div>
          </div>

          {/* Floor properties */}
          {activeFloor && (
            <>
              <h3 className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
                Floor Details
              </h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Name
                  </Label>
                  <Input
                    value={activeFloor.name}
                    onChange={(e) =>
                      updateFloor(activeFloor.id, (f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    className="text-xs neu-pressed"
                  />
                </div>
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Level
                  </Label>
                  <Input
                    type="number"
                    value={activeFloor.level}
                    onChange={(e) =>
                      updateFloor(activeFloor.id, (f) => ({
                        ...f,
                        level: Number(e.target.value) || 0,
                      }))
                    }
                    className="text-xs neu-pressed"
                  />
                </div>
              </div>
            </>
          )}

          {/* Help text */}
          <div className="mt-4 border-t border-slate-300 dark:border-slate-700 pt-2">
            <p className="text-[9px] text-slate-600">
              <b>Shift+Click</b> — multi-select
              <br />
              <b>Delete</b> — remove selected
              <br />
              <b>Scroll</b> — zoom in/out
              <br />
              <b>Pan tool</b> — drag to move view
            </p>
          </div>
        </aside>

        {/* Center — SVG grid */}
        <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950">
          {layout.geoBounds && (
            <LeafletMapBackground
              ref={leafletMapRef}
              bounds={layout.geoBounds}
              mapProvider={layout.mapProvider}
            />
          )}
          {activeFloor ? (
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              className="h-full w-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900"
              style={{
                cursor:
                  mode === 'pan'
                    ? 'grab'
                    : mode === 'select'
                      ? 'default'
                      : 'crosshair',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Grid lines */}
              {Array.from({ length: 11 }).map((_, i) => (
                <g key={`grid-${i}`}>
                  <line
                    x1={i * 100}
                    y1={0}
                    x2={i * 100}
                    y2={GRID_MAX}
                    stroke="rgba(51,65,85,0.3)"
                    strokeWidth={1}
                  />
                  <line
                    x1={0}
                    y1={i * 100}
                    x2={GRID_MAX}
                    y2={i * 100}
                    stroke="rgba(51,65,85,0.3)"
                    strokeWidth={1}
                  />
                </g>
              ))}
              <rect
                x={0}
                y={0}
                width={GRID_MAX}
                height={GRID_MAX}
                fill="none"
                stroke="rgba(51,65,85,0.5)"
                strokeWidth={2}
              />

              {/* Grid labels (only when zoomed in) */}
              {viewBox.w < 800 &&
                Array.from({ length: 11 }).map((_, i) => (
                  <g key={`label-${i}`}>
                    <text
                      x={i * 100 + 3}
                      y={15}
                      fill="rgba(100,116,139,0.6)"
                      fontSize={12}
                    >
                      {i * 100}
                    </text>
                    <text
                      x={3}
                      y={i * 100 + 15}
                      fill="rgba(100,116,139,0.6)"
                      fontSize={12}
                    >
                      {i * 100}
                    </text>
                  </g>
                ))}

              {/* Zones */}
              {activeFloor.zones.map((zone) => {
                const key = `zone:${activeFloor.id}:${zone.id}`;
                const isSelected = selected.has(key);
                const fillOp = isSelected ? 0.45 : 0.2;
                const strokeW = isSelected ? 3 : 1.5;

                if (zone.shape === 'circle' && zone.circle) {
                  return (
                    <g
                      key={zone.id}
                      onMouseDown={(e) => handleItemMouseDown(e, key)}
                    >
                      <circle
                        cx={zone.circle.center.x}
                        cy={zone.circle.center.y}
                        r={zone.circle.radius}
                        fill={zone.color}
                        fillOpacity={fillOp}
                        stroke={zone.color}
                        strokeWidth={strokeW}
                        strokeDasharray={isSelected ? '6 3' : undefined}
                      />
                      <text
                        x={zone.anchor.x}
                        y={zone.anchor.y}
                        fill={zone.color}
                        fontSize={16}
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {zone.name}
                      </text>
                    </g>
                  );
                }

                if (zone.shape === 'polygon' && zone.polygon.length >= 3) {
                  const pts = zone.polygon
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ');
                  return (
                    <g
                      key={zone.id}
                      onMouseDown={(e) => handleItemMouseDown(e, key)}
                    >
                      <polygon
                        points={pts}
                        fill={zone.color}
                        fillOpacity={fillOp}
                        stroke={zone.color}
                        strokeWidth={strokeW}
                        strokeDasharray={isSelected ? '6 3' : undefined}
                      />
                      <text
                        x={zone.anchor.x}
                        y={zone.anchor.y}
                        fill={zone.color}
                        fontSize={16}
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {zone.name}
                      </text>
                    </g>
                  );
                }

                // Default: rect (use bounding box of polygon)
                const xs = zone.polygon.map((p) => p.x);
                const ys = zone.polygon.map((p) => p.y);
                const minX = Math.min(...xs),
                  maxX = Math.max(...xs);
                const minY = Math.min(...ys),
                  maxY = Math.max(...ys);
                return (
                  <g
                    key={zone.id}
                    onMouseDown={(e) => handleItemMouseDown(e, key)}
                  >
                    <rect
                      x={minX}
                      y={minY}
                      width={maxX - minX}
                      height={maxY - minY}
                      fill={zone.color}
                      fillOpacity={fillOp}
                      stroke={zone.color}
                      strokeWidth={strokeW}
                      strokeDasharray={isSelected ? '6 3' : undefined}
                    />
                    <text
                      x={zone.anchor.x}
                      y={zone.anchor.y}
                      fill={zone.color}
                      fontSize={16}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {zone.name}
                    </text>
                  </g>
                );
              })}

              {/* Draw preview */}
              {drawPreview?.shape === 'rect' &&
                drawPreview.start &&
                drawPreview.end && (
                  <rect
                    x={Math.min(drawPreview.start.x, drawPreview.end.x)}
                    y={Math.min(drawPreview.start.y, drawPreview.end.y)}
                    width={Math.abs(drawPreview.end.x - drawPreview.start.x)}
                    height={Math.abs(drawPreview.end.y - drawPreview.start.y)}
                    fill="rgba(59,130,246,0.15)"
                    stroke="rgba(59,130,246,0.6)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                )}
              {drawPreview?.shape === 'circle' &&
                drawPreview.start &&
                drawPreview.end && (
                  <circle
                    cx={drawPreview.start.x}
                    cy={drawPreview.start.y}
                    r={Math.hypot(
                      drawPreview.end.x - drawPreview.start.x,
                      drawPreview.end.y - drawPreview.start.y,
                    )}
                    fill="rgba(59,130,246,0.15)"
                    stroke="rgba(59,130,246,0.6)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                )}
              {drawPreview?.shape === 'polygon' &&
                drawPreview.points &&
                drawPreview.points.length >= 2 && (
                  <polyline
                    points={drawPreview.points
                      .map((p) => `${p.x},${p.y}`)
                      .join(' ')}
                    fill="rgba(59,130,246,0.1)"
                    stroke="rgba(59,130,246,0.6)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                )}

              {/* POIs */}
              {activeFloor.pois.map((poi) => {
                const key = `poi:${activeFloor.id}:${poi.id}`;
                const isSelected = selected.has(key);
                return (
                  <g
                    key={poi.id}
                    onMouseDown={(e) => handleItemMouseDown(e, key)}
                  >
                    <circle
                      cx={poi.x}
                      cy={poi.y}
                      r={isSelected ? 18 : 12}
                      fill={POI_COLORS[poi.type]}
                      fillOpacity={0.85}
                      stroke={isSelected ? '#fff' : POI_COLORS[poi.type]}
                      strokeWidth={isSelected ? 3 : 1}
                    />
                    <text
                      x={poi.x}
                      y={poi.y + 5}
                      fill="#fff"
                      fontSize={14}
                      textAnchor="middle"
                    >
                      {POI_ICONS[poi.type]}
                    </text>
                    {isSelected && (
                      <text
                        x={poi.x}
                        y={poi.y - 22}
                        fill="#fff"
                        fontSize={12}
                        textAnchor="middle"
                      >
                        {poi.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="text-slate-900 dark:text-slate-500">
              No floors. Add one from the left sidebar.
            </div>
          )}
        </main>

        {/* Right sidebar — properties */}
        <aside className="w-64 shrink-0 overflow-auto border-l border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40 p-3">
          {/* Base Map / Geo Mode */}
          <h3 className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
            Geographic Base
          </h3>
          <div className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onPress={() => setIsSettingBounds(true)}
            >
              {layout.geoBounds ? 'Edit Geo Bounds' : 'Set Geographic Base'}
            </Button>
            {layout.geoBounds && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-red-500"
                onPress={() =>
                  setLayout((prev) => {
                    const next = { ...prev };
                    delete next.geoBounds;
                    return next;
                  })
                }
              >
                Remove Geo Base
              </Button>
            )}
          </div>

          {/* Bulk selection */}
          {selected.size > 1 && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
                {selected.size} items selected
              </h3>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 w-full"
                onPress={() => setDeleteConfirm(new Set(selected))}
              >
                Delete {selected.size} items
              </Button>
            </div>
          )}

          {/* Single zone */}
          {singleZone && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
                Zone Properties
              </h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Name
                  </Label>
                  <Input
                    value={singleZone.zone.name}
                    onChange={(e) =>
                      updateZone(singleZone.floor.id, singleZone.zone.id, {
                        name: e.target.value,
                      })
                    }
                    className="neu-pressed"
                  />
                </div>
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Shape
                  </Label>
                  <p className="text-xs text-slate-700 dark:text-slate-300 capitalize">
                    {singleZone.zone.shape}
                  </p>
                </div>
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Color
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {ZONE_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`h-6 w-6 rounded border-2 ${singleZone.zone.color === c ? 'border-slate-300 dark:border-slate-800 dark:border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                        onClick={() =>
                          updateZone(singleZone.floor.id, singleZone.zone.id, {
                            color: c,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 w-full neu-raised-sm neu-hover neu-active dark:text-red-400"
                  onPress={() =>
                    setDeleteConfirm(
                      new Set([
                        `zone:${singleZone.floor.id}:${singleZone.zone.id}`,
                      ]),
                    )
                  }
                >
                  Delete Zone
                </Button>
              </div>
            </div>
          )}

          {/* Single POI */}
          {singlePoi && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
                POI Properties
              </h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Name
                  </Label>
                  <Input
                    value={singlePoi.poi.name}
                    onChange={(e) =>
                      updatePoi(singlePoi.floor.id, singlePoi.poi.id, {
                        name: e.target.value,
                      })
                    }
                    className="neu-pressed"
                  />
                </div>
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Type
                  </Label>
                  <Select
                    className="mt-1 w-full"
                    selectedKey={singlePoi.poi.type}
                    onSelectionChange={(k) =>
                      updatePoi(singlePoi.floor.id, singlePoi.poi.id, {
                        type: k as POIType,
                      })
                    }
                  >
                    <Select.Trigger className="neu-pressed text-xs">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {POI_TYPES.map((pt) => (
                          <ListBox.Item
                            key={pt.value}
                            id={pt.value}
                            textValue={pt.label}
                          >
                            {pt.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
                <div>
                  <Label className="text-[9px] uppercase text-slate-600 dark:text-slate-500">
                    Notes
                  </Label>
                  <Input
                    value={singlePoi.poi.notes ?? ''}
                    onChange={(e) =>
                      updatePoi(singlePoi.floor.id, singlePoi.poi.id, {
                        notes: e.target.value,
                      })
                    }
                    className="neu-pressed"
                  />
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-500">
                  Position: ({singlePoi.poi.x}, {singlePoi.poi.y})
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 w-full neu-raised-sm neu-hover neu-active dark:text-red-400"
                  onPress={() =>
                    setDeleteConfirm(
                      new Set([
                        `poi:${singlePoi.floor.id}:${singlePoi.poi.id}`,
                      ]),
                    )
                  }
                >
                  Delete POI
                </Button>
              </div>
            </div>
          )}

          {/* Nothing selected — show floor summary */}
          {selected.size === 0 && activeFloor && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500">
                {activeFloor.name}
              </h3>
              <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <p>Zones: {activeFloor.zones.length}</p>
                <p>POIs: {activeFloor.pois.length}</p>
                {activeFloor.pois.length > 0 && (
                  <div className="mt-2 border-t border-slate-300 dark:border-slate-700 pt-2">
                    <p className="text-[9px] uppercase text-slate-600">
                      POI Summary
                    </p>
                    {Object.entries(
                      activeFloor.pois.reduce(
                        (acc, p) => {
                          acc[p.type] = (acc[p.type] ?? 0) + 1;
                          return acc;
                        },
                        {} as Record<string, number>,
                      ),
                    ).map(([type, count]) => (
                      <div
                        key={type}
                        className="flex items-center gap-1"
                      >
                        <span>{POI_ICONS[type as POIType]}</span>
                        <span className="capitalize">{type}</span>
                        <span className="ml-auto text-slate-600">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Status bar */}
      <footer className="border-t border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-4 py-1.5 text-[10px] text-slate-900 dark:text-slate-500">
        Floor: {activeFloor?.name ?? '—'} · Zones:{' '}
        {activeFloor?.zones.length ?? 0} · POIs: {activeFloor?.pois.length ?? 0}{' '}
        · Floors: {layout.floors.length} · Mode:{' '}
        <span className="text-slate-600 dark:text-slate-300 capitalize">
          {mode}
        </span>
        {selected.size > 0 && (
          <>
            {' '}
            · Selected: <span className="text-blue-400">{selected.size}</span>
          </>
        )}
      </footer>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <Modal>
          <Modal.Backdrop
            isOpen={true}
            onOpenChange={() => setDeleteConfirm(null)}
          >
            <Modal.Container>
              <Modal.Dialog className="sm:max-w-sm">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading className="font-mono text-sm uppercase tracking-widest">
                    Delete {deleteConfirm.size} item
                    {deleteConfirm.size === 1 ? '' : 's'}?
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This will remove {deleteConfirm.size} zone/POI
                    {deleteConfirm.size === 1 ? '' : 's'} from the layout. Click
                    Save to persist the change.
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setDeleteConfirm(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="bg-red-600!"
                    onPress={confirmDelete}
                  >
                    Delete
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </div>
  );
}
