/**
 * MapLayoutEditor — visual zone/POI/floor editor for tenant map layouts.
 *
 * Opens as a full-screen overlay from the Tenants tab. Provides:
 *   - SVG grid (0–1000 coordinate system) with grid lines + sector labels
 *   - Floor selector (tabs for Ground, Level 200, Suite, etc.)
 *   - Zone drawing (click-drag rectangles)
 *   - POI placement (click to add gates, restrooms, first aid, etc.)
 *   - Properties panel (edit selected item's name, color, notes)
 *   - Save → POST /api/admin/tenants action=update_map_layout
 *
 * The layout structure matches src/lib/map-layout.ts (MapLayout interface).
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import {
	adminUpdateMapLayout,
	ApiError,
} from '@/services/api';
import {
	type MapLayout,
	type MapFloor,
	type MapZone,
	type MapPOI,
	type POIType,
	POI_ICONS,
	POI_COLORS,
	METLIFE_MAP_LAYOUT,
} from '@/lib/map-layout';

// ─── Constants ───────────────────────────────────────────────────────────────

const SVG_SIZE = 500; // CSS pixels for the SVG canvas
const GRID_MAX = 1000;
const SCALE = SVG_SIZE / GRID_MAX; // 0.5

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

const ZONE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#eab308', '#ec4899', '#10b981', '#ef4444'];

type EditorMode = 'select' | 'zone' | 'poi';
type SelectedItem = { kind: 'zone'; floorId: string; zoneId: string } | { kind: 'poi'; floorId: string; poiId: string } | null;

// ─── Component ───────────────────────────────────────────────────────────────

interface MapLayoutEditorProps {
	tenantId: string;
	tenantName: string;
	initialLayout: MapLayout | null;
	onClose: () => void;
}

export function MapLayoutEditor({ tenantId, tenantName, initialLayout, onClose }: MapLayoutEditorProps) {
	const [layout, setLayout] = useState<MapLayout>(initialLayout ?? { floors: [], defaultFloorId: undefined });
	const [activeFloorId, setActiveFloorId] = useState<string>(layout.defaultFloorId ?? layout.floors[0]?.id ?? '');
	const [mode, setMode] = useState<EditorMode>('select');
	const [selectedPoiType, setSelectedPoiType] = useState<POIType>('entry');
	const [selected, setSelected] = useState<SelectedItem>(null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [savedMsg, setSavedMsg] = useState<string | null>(null);

	// Zone drawing state.
	const drawStartRef = useRef<{ x: number; y: number } | null>(null);
	const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

	const activeFloor = useMemo(
		() => layout.floors.find((f) => f.id === activeFloorId) ?? null,
		[layout, activeFloorId],
	);

	// ─── Helpers ──────────────────────────────────────────────────────────────

	const toGrid = useCallback((cssX: number, cssY: number, svgEl: SVGSVGElement): { x: number; y: number } => {
		const rect = svgEl.getBoundingClientRect();
		const x = Math.round(((cssX - rect.left) / rect.width) * GRID_MAX);
		const y = Math.round(((cssY - rect.top) / rect.height) * GRID_MAX);
		return {
			x: Math.max(0, Math.min(GRID_MAX, x)),
			y: Math.max(0, Math.min(GRID_MAX, y)),
		};
	}, []);

	const updateFloor = useCallback((floorId: string, updater: (floor: MapFloor) => MapFloor) => {
		setLayout((prev) => ({
			...prev,
			floors: prev.floors.map((f) => (f.id === floorId ? updater(f) : f)),
		}));
	}, []);

	// ─── SVG interaction ─────────────────────────────────────────────────────

	const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
		if (!activeFloor) return;
		const svg = e.currentTarget;
		const pos = toGrid(e.clientX, e.clientY, svg);

		if (mode === 'poi') {
			// Place a new POI at the clicked position.
			const newPoi: MapPOI = {
				id: `poi_${Date.now()}`,
				name: `${selectedPoiType}_${activeFloor.pois.length + 1}`,
				type: selectedPoiType,
				x: pos.x,
				y: pos.y,
			};
			updateFloor(activeFloor.id, (f) => ({ ...f, pois: [...f.pois, newPoi] }));
			setSelected({ kind: 'poi', floorId: activeFloor.id, poiId: newPoi.id });
		} else if (mode === 'zone') {
			if (!drawStartRef.current) {
				drawStartRef.current = pos;
			} else {
				// Complete the rectangle.
				const start = drawStartRef.current;
				const minX = Math.min(start.x, pos.x);
				const minY = Math.min(start.y, pos.y);
				const maxX = Math.max(start.x, pos.x);
				const maxY = Math.max(start.y, pos.y);
				const colorIdx = activeFloor.zones.length % ZONE_COLORS.length;
				const newZone: MapZone = {
					id: `zone_${Date.now()}`,
					name: `Zone ${activeFloor.zones.length + 1}`,
					polygon: [
						{ x: minX, y: minY },
						{ x: maxX, y: minY },
						{ x: maxX, y: maxY },
						{ x: minX, y: maxY },
					],
					color: ZONE_COLORS[colorIdx],
					anchor: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
				};
				updateFloor(activeFloor.id, (f) => ({ ...f, zones: [...f.zones, newZone] }));
				setSelected({ kind: 'zone', floorId: activeFloor.id, zoneId: newZone.id });
				drawStartRef.current = null;
				setDrawPreview(null);
				setMode('select');
			}
		}
	};

	const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
		if (mode !== 'zone' || !drawStartRef.current) return;
		const svg = e.currentTarget;
		const pos = toGrid(e.clientX, e.clientY, svg);
		const start = drawStartRef.current;
		setDrawPreview({
			x: Math.min(start.x, pos.x),
			y: Math.min(start.y, pos.y),
			w: Math.abs(pos.x - start.x),
			h: Math.abs(pos.y - start.y),
		});
	};

	// ─── CRUD operations ─────────────────────────────────────────────────────

	const updateZone = (floorId: string, zoneId: string, updates: Partial<MapZone>) => {
		updateFloor(floorId, (f) => ({
			...f,
			zones: f.zones.map((z) => (z.id === zoneId ? { ...z, ...updates } : z)),
		}));
	};

	const deleteZone = (floorId: string, zoneId: string) => {
		updateFloor(floorId, (f) => ({ ...f, zones: f.zones.filter((z) => z.id !== zoneId) }));
		setSelected(null);
	};

	const updatePoi = (floorId: string, poiId: string, updates: Partial<MapPOI>) => {
		updateFloor(floorId, (f) => ({
			...f,
			pois: f.pois.map((p) => (p.id === poiId ? { ...p, ...updates } : p)),
		}));
	};

	const deletePoi = (floorId: string, poiId: string) => {
		updateFloor(floorId, (f) => ({ ...f, pois: f.pois.filter((p) => p.id !== poiId) }));
		setSelected(null);
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

	// ─── Save ────────────────────────────────────────────────────────────────

	const handleSave = async () => {
		setSaving(true);
		setSaveError(null);
		setSavedMsg(null);
		try {
			await adminUpdateMapLayout(tenantId, layout);
			setSavedMsg('✓ Layout saved');
			setTimeout(() => setSavedMsg(null), 3000);
		} catch (err) {
			setSaveError(err instanceof ApiError ? err.message : 'Failed to save layout');
		} finally {
			setSaving(false);
		}
	};

	// ─── Selected item details ──────────────────────────────────────────────

	const selectedZone = selected?.kind === 'zone'
		? layout.floors.find((f) => f.id === selected.floorId)?.zones.find((z) => z.id === selected.zoneId)
		: null;
	const selectedPoi = selected?.kind === 'poi'
		? layout.floors.find((f) => f.id === selected.floorId)?.pois.find((p) => p.id === selected.poiId)
		: null;

	// ─── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
			{/* Header */}
			<header className="flex items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
				<h1 className="font-mono text-sm font-black uppercase tracking-widest text-slate-100">
					Map Layout Editor — {tenantName}
				</h1>
				<div className="ml-auto flex items-center gap-2">
					{savedMsg && <span className="text-xs text-emerald-400">{savedMsg}</span>}
					{saveError && <span className="text-xs text-red-400">{saveError}</span>}
					<Button size="sm" variant="primary" onPress={handleSave} disabled={saving}>
						{saving ? <Spinner size="sm" /> : 'Save Layout'}
					</Button>
					<Button size="sm" variant="ghost" onPress={onClose}>✕ Close</Button>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				{/* Left sidebar — floors + toolbar */}
				<aside className="w-52 shrink-0 overflow-auto border-r border-slate-800 bg-slate-900/40 p-3">
					<h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Floors</h3>
					<div className="space-y-1">
						{layout.floors.map((floor) => (
							<div
								key={floor.id}
								className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
									activeFloorId === floor.id ? 'bg-blue-900/40 text-blue-300' : 'text-slate-400 hover:bg-slate-800/40'
								}`}
							>
								<button
									className="flex-1 text-left"
									onClick={() => { setActiveFloorId(floor.id); setSelected(null); }}
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
						className="mt-2 w-full rounded border border-slate-700 py-1 text-[10px] uppercase text-slate-400 hover:bg-slate-800/40"
						onClick={addFloor}
					>
						+ Add Floor
					</button>

					{/* Toolbar */}
					<h3 className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-widest text-slate-500">Tools</h3>
					<div className="space-y-1">
						<button
							className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs ${mode === 'select' ? 'bg-blue-900/40 text-blue-300' : 'text-slate-400 hover:bg-slate-800/40'}`}
							onClick={() => setMode('select')}
						>
							🖱 Select / Move
						</button>
						<button
							className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs ${mode === 'zone' ? 'bg-blue-900/40 text-blue-300' : 'text-slate-400 hover:bg-slate-800/40'}`}
							onClick={() => { setMode('zone'); drawStartRef.current = null; setDrawPreview(null); }}
						>
							🔲 Draw Zone
							{mode === 'zone' && !drawStartRef.current && <span className="text-[9px] text-amber-400">click 1st corner</span>}
							{mode === 'zone' && drawStartRef.current && <span className="text-[9px] text-amber-400">click 2nd corner</span>}
						</button>
						<div className={`rounded px-2 py-1 ${mode === 'poi' ? 'bg-blue-900/40' : ''}`}>
							<button
								className={`flex w-full items-center gap-2 text-xs ${mode === 'poi' ? 'text-blue-300' : 'text-slate-400 hover:bg-slate-800/40'}`}
								onClick={() => setMode('poi')}
							>
								📍 Place POI
							</button>
							{mode === 'poi' && (
								<select
									className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-300"
									value={selectedPoiType}
									onChange={(e) => setSelectedPoiType(e.target.value as POIType)}
								>
									{POI_TYPES.map((pt) => (
										<option key={pt.value} value={pt.value}>{pt.label}</option>
									))}
								</select>
							)}
						</div>
					</div>

					{/* Floor properties */}
					{activeFloor && (
						<>
							<h3 className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-widest text-slate-500">Floor Details</h3>
							<div className="space-y-2">
								<div>
									<label className="text-[9px] uppercase text-slate-600">Name</label>
									<Input
										value={activeFloor.name}
										onValueChange={(v) => updateFloor(activeFloor.id, (f) => ({ ...f, name: v }))}
										className="text-xs"
									/>
								</div>
								<div>
									<label className="text-[9px] uppercase text-slate-600">Level</label>
									<Input
										type="number"
										value={String(activeFloor.level)}
										onValueChange={(v) => updateFloor(activeFloor.id, (f) => ({ ...f, level: Number(v) || 0 }))}
										className="text-xs"
									/>
								</div>
							</div>
						</>
					)}
				</aside>

				{/* Center — SVG grid */}
				<main className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
					{activeFloor ? (
						<svg
							width={SVG_SIZE}
							height={SVG_SIZE}
							onClick={handleSvgClick}
							onMouseMove={handleSvgMouseMove}
							className={`border border-slate-700 bg-slate-900 ${mode === 'zone' ? 'cursor-crosshair' : mode === 'poi' ? 'cursor-copy' : 'cursor-default'}`}
							style={{ maxWidth: '100%', maxHeight: '100%' }}
						>
							{/* Grid lines */}
							{Array.from({ length: 11 }).map((_, i) => (
								<g key={`grid-${i}`}>
									<line x1={i * 50} y1={0} x2={i * 50} y2={SVG_SIZE} stroke="rgba(51,65,85,0.3)" strokeWidth={0.5} />
									<line x1={0} y1={i * 50} x2={SVG_SIZE} y2={i * 50} stroke="rgba(51,65,85,0.3)" strokeWidth={0.5} />
								</g>
							))}

							{/* Grid labels */}
							{Array.from({ length: 11 }).map((_, i) => (
								<g key={`label-${i}`}>
									<text x={i * 50} y={8} fill="rgba(100,116,139,0.5)" fontSize={6}>{i * 100}</text>
									<text x={2} y={i * 50 + 4} fill="rgba(100,116,139,0.5)" fontSize={6}>{i * 100}</text>
								</g>
							))}

							{/* Zones */}
							{activeFloor.zones.map((zone) => {
								const xs = zone.polygon.map((p) => p.x * SCALE);
								const ys = zone.polygon.map((p) => p.y * SCALE);
								const minX = Math.min(...xs);
								const minY = Math.min(...ys);
								const maxX = Math.max(...xs);
								const maxY = Math.max(...ys);
								const isSelected = selected?.kind === 'zone' && selected.zoneId === zone.id;
								return (
									<g key={zone.id} onClick={(e) => { e.stopPropagation(); setSelected({ kind: 'zone', floorId: activeFloor.id, zoneId: zone.id }); }}>
										<rect
											x={minX} y={minY}
											width={maxX - minX} height={maxY - minY}
											fill={zone.color} fillOpacity={isSelected ? 0.4 : 0.2}
											stroke={zone.color} strokeWidth={isSelected ? 2 : 1}
											strokeDasharray={isSelected ? '4 2' : undefined}
										/>
										<text
											x={zone.anchor.x * SCALE} y={zone.anchor.y * SCALE}
											fill={zone.color} fontSize={7} fontWeight="bold" textAnchor="middle"
										>
											{zone.name}
										</text>
									</g>
								);
							})}

							{/* Draw preview */}
							{drawPreview && (
								<rect
									x={drawPreview.x * SCALE} y={drawPreview.y * SCALE}
									width={drawPreview.w * SCALE} height={drawPreview.h * SCALE}
									fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.6)" strokeWidth={1} strokeDasharray="3 3"
								/>
							)}

							{/* POIs */}
							{activeFloor.pois.map((poi) => {
								const isSelected = selected?.kind === 'poi' && selected.poiId === poi.id;
								return (
									<g key={poi.id} onClick={(e) => { e.stopPropagation(); setSelected({ kind: 'poi', floorId: activeFloor.id, poiId: poi.id }); }}>
										<circle
											cx={poi.x * SCALE} cy={poi.y * SCALE}
											r={isSelected ? 7 : 5}
											fill={POI_COLORS[poi.type]} fillOpacity={0.8}
											stroke={isSelected ? '#fff' : POI_COLORS[poi.type]} strokeWidth={isSelected ? 2 : 0.5}
										/>
										<text
											x={poi.x * SCALE} y={poi.y * SCALE + 2}
											fill="#fff" fontSize={7} textAnchor="middle"
										>
											{POI_ICONS[poi.type]}
										</text>
										{isSelected && (
											<text
												x={poi.x * SCALE} y={poi.y * SCALE - 10}
												fill="#fff" fontSize={6} textAnchor="middle"
											>
												{poi.name}
											</text>
										)}
									</g>
								);
							})}
						</svg>
					) : (
						<div className="text-slate-500">No floors. Add one from the left sidebar.</div>
					)}
				</main>

				{/* Right sidebar — properties of selected item */}
				<aside className="w-64 shrink-0 overflow-auto border-l border-slate-800 bg-slate-900/40 p-3">
					{selectedZone && (
						<div>
							<h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Zone Properties</h3>
							<div className="space-y-2">
								<div>
									<label className="text-[9px] uppercase text-slate-600">Name</label>
									<Input
										value={selectedZone.name}
										onValueChange={(v) => updateZone(selected!.floorId, selectedZone.id, { name: v, anchor: { ...selectedZone.anchor } })}
									/>
								</div>
								<div>
									<label className="text-[9px] uppercase text-slate-600">Color</label>
									<div className="flex flex-wrap gap-1">
										{ZONE_COLORS.map((c) => (
											<button
												key={c}
												className={`h-5 w-5 rounded border-2 ${selectedZone.color === c ? 'border-white' : 'border-transparent'}`}
												style={{ backgroundColor: c }}
												onClick={() => updateZone(selected!.floorId, selectedZone.id, { color: c })}
											/>
										))}
									</div>
								</div>
								<div className="text-[10px] text-slate-500">
									Anchor: ({selectedZone.anchor.x}, {selectedZone.anchor.y})
								</div>
								<Button size="sm" variant="ghost" className="text-red-400 w-full" onPress={() => deleteZone(selected!.floorId, selectedZone.id)}>
									Delete Zone
								</Button>
							</div>
						</div>
					)}

					{selectedPoi && (
						<div>
							<h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">POI Properties</h3>
							<div className="space-y-2">
								<div>
									<label className="text-[9px] uppercase text-slate-600">Name</label>
									<Input
										value={selectedPoi.name}
										onValueChange={(v) => updatePoi(selected!.floorId, selectedPoi.id, { name: v })}
									/>
								</div>
								<div>
									<label className="text-[9px] uppercase text-slate-600">Type</label>
									<select
										className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
										value={selectedPoi.type}
										onChange={(e) => updatePoi(selected!.floorId, selectedPoi.id, { type: e.target.value as POIType })}
									>
										{POI_TYPES.map((pt) => (
											<option key={pt.value} value={pt.value}>{pt.label}</option>
										))}
									</select>
								</div>
								<div>
									<label className="text-[9px] uppercase text-slate-600">Notes</label>
									<Input
										value={selectedPoi.notes ?? ''}
										onValueChange={(v) => updatePoi(selected!.floorId, selectedPoi.id, { notes: v })}
									/>
								</div>
								<div className="text-[10px] text-slate-500">
									Position: ({selectedPoi.x}, {selectedPoi.y})
								</div>
								<Button size="sm" variant="ghost" className="text-red-400 w-full" onPress={() => deletePoi(selected!.floorId, selectedPoi.id)}>
									Delete POI
								</Button>
							</div>
						</div>
					)}

					{!selected && activeFloor && (
						<div>
							<h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
								{activeFloor.name}
							</h3>
							<div className="space-y-1 text-[11px] text-slate-400">
								<p>Zones: {activeFloor.zones.length}</p>
								<p>POIs: {activeFloor.pois.length}</p>
								<div className="mt-2 border-t border-slate-700 pt-2">
									<p className="text-[9px] uppercase text-slate-600">POI Summary</p>
									{Object.entries(
										activeFloor.pois.reduce((acc, p) => {
											acc[p.type] = (acc[p.type] ?? 0) + 1;
											return acc;
										}, {} as Record<string, number>),
									).map(([type, count]) => (
										<div key={type} className="flex items-center gap-1">
											<span>{POI_ICONS[type as POIType]}</span>
											<span className="capitalize">{type}</span>
											<span className="ml-auto text-slate-600">{count}</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</aside>
			</div>

			{/* Status bar */}
			<footer className="border-t border-slate-800 bg-slate-900/60 px-4 py-1.5 text-[10px] text-slate-500">
				Floor: {activeFloor?.name ?? '—'} ·
				Zones: {activeFloor?.zones.length ?? 0} ·
				POIs: {activeFloor?.pois.length ?? 0} ·
				Total floors: {layout.floors.length} ·
				Mode: <span className="text-slate-300 capitalize">{mode}</span>
			</footer>
		</div>
	);
}
