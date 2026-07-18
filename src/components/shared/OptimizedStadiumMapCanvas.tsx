/**
 * OptimizedStadiumMapCanvas — offscreen-double-buffered tactical map (ADR-canvas).
 *
 * This is the central visual of the Control Room: a pan/zoomable projection of the
 * 0–1000 stadium grid with live incident beacons and staff nodes.
 *
 * ── Performance contract (see docs/CANVAS-ENGINE.md, docs/MAP-OPTIMIZATION.md) ──
 *   1. The requestAnimationFrame loop is started ONCE on mount (empty deps `[]`).
 *      It is NEVER torn down/restarted on data change — doing so would stutter on
 *      every 2s poll tick.
 *   2. Incoming `incidents` / `staffMembers` props are mirrored into a ref in a
 *      SEPARATE effect. The rAF loop reads that ref, so fresh data renders without
 *      restarting the loop.
 *   3. The static background (rings, grid, pitch, sector labels) is rendered once
 *      into an in-memory offscreen canvas and blitted each frame. It is only
 *      re-rendered when the device dimensions change.
 *   4. DPR scaling is applied so the drawing math works in CSS pixels.
 *   5. The HUD text is written directly to DOM text nodes (not React state) to
 *      avoid a re-render storm at 60fps.
 */
import { useEffect, useRef, useState } from 'react';
import type {
	IncidentReport,
	WhitelistUser,
	InfoTier,
	StaffSpecialty,
	MapCoordinates,
} from '@/types';

interface OptimizedStadiumMapCanvasProps {
	incidents: IncidentReport[];
	staffMembers: WhitelistUser[];
	onIncidentSelect: (incident: IncidentReport) => void;
}

// ── Color mapping ─────────────────────────────────────────────────────────────

function tierColor(tier: InfoTier): string {
	switch (tier) {
		case 1: return '#ef4444'; // life safety — red
		case 2: return '#f97316'; // tactical — orange
		case 3: return '#f59e0b'; // crowd/logistics — amber
		case 4: return '#3b82f6'; // facilities — blue
		case 5: return '#64748b'; // advisory — slate
	}
}

function specialtyColor(specialty: StaffSpecialty): string {
	switch (specialty) {
		case 'security':
			return '#3b82f6'; // blue
		case 'medical':
			return '#22c55e'; // green
		case 'cleaning':
			return '#eab308'; // yellow
		case 'supervisor':
			return '#a855f7'; // purple
	}
}

// ── Viewport model ────────────────────────────────────────────────────────────

interface Viewport {
	zoom: number;
	offsetX: number; // CSS px, includes centering
	offsetY: number;
}

interface Dimensions {
	cssWidth: number;
	cssHeight: number;
	dpr: number;
}

interface PointerSample {
	x: number;
	y: number;
}

export function OptimizedStadiumMapCanvas({
	incidents,
	staffMembers,
	onIncidentSelect,
}: OptimizedStadiumMapCanvasProps): React.JSX.Element {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	// ── Imperative refs (read by the rAF loop WITHOUT restarting it) ────────────
	const propsRef = useRef({ incidents, staffMembers, onIncidentSelect });
	const viewportRef = useRef<Viewport>({ zoom: 1, offsetX: 0, offsetY: 0 });
	const dimsRef = useRef<Dimensions>({ cssWidth: 0, cssHeight: 0, dpr: 1 });
	const bgDirtyRef = useRef(true); // forces a background re-render
	const selectedIdRef = useRef<string | null>(null);

	// Filter state: which specialties + statuses are visible on the map.
	const [filters, setFilters] = useState<{
		specialties: Set<StaffSpecialty>;
		statuses: Set<string>;
	}>({
		specialties: new Set(['security', 'medical', 'cleaning', 'supervisor']),
		statuses: new Set(['AVAILABLE', 'DISPATCHED', 'OFF_DUTY']),
	});
	const filtersRef = useRef(filters);
	filtersRef.current = filters;

	// Tooltip state (DOM element, positioned via style).
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const [tooltipData, setTooltipData] = useState<{
		visible: boolean;
		x: number;
		y: number;
		name: string;
		specialty: string;
		zone: string;
		status: string;
		phone: string;
	} | null>(null);

	// Staff click → info panel
	const [selectedStaff, setSelectedStaff] = useState<WhitelistUser | null>(null);

	// Pointer tracking for pan + pinch (unified across mouse/touch).
	const pointersRef = useRef<Map<number, PointerSample>>(new Map());
	const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
	const dragRef = useRef<{ lastX: number; lastY: number; active: boolean }>({
		lastX: 0,
		lastY: 0,
		active: false,
	});

	// Offscreen background buffer.
	const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

	// Whether the latest pointer gesture moved enough to count as a drag (vs. a tap).
	const dragMovedRef = useRef(false);

	// FPS tracking (updated ~every 500ms in the rAF loop).
	const fpsFrames = useRef(0);
	const fpsLastUpdate = useRef(0);

	// HUD DOM text nodes (written imperatively each frame).
	const hudZoomRef = useRef<HTMLSpanElement | null>(null);
	const hudCoordRef = useRef<HTMLSpanElement | null>(null);
	const hudCountRef = useRef<HTMLSpanElement | null>(null);
	const hudFpsRef = useRef<HTMLSpanElement | null>(null);

	// Track the selected incident id so the beacon ring renders (kept in state
	// only so parent-driven selection re-renders the component — not the loop).
	const [selectedId, setSelectedId] = useState<string | null>(null);
	selectedIdRef.current = selectedId;

	// ── Sync props into the ref WITHOUT touching the rAF loop deps ──────────────
	useEffect(() => {
		propsRef.current = { incidents, staffMembers, onIncidentSelect };
	}, [incidents, staffMembers, onIncidentSelect]);

	// ── Forward / inverse transforms (grid ↔ CSS pixel) ─────────────────────────
	const baseScale = (cssMin: number): number => (cssMin * 0.92) / 1000;

	const gridToScreen = (coord: MapCoordinates): { x: number; y: number } => {
		const { cssWidth, cssHeight } = dimsRef.current;
		const vp = viewportRef.current;
		const s = baseScale(Math.min(cssWidth, cssHeight)) * vp.zoom;
		return {
			x: coord.x * s + vp.offsetX,
			y: coord.y * s + vp.offsetY,
		};
	};

	// ── Background rendering (offscreen) ────────────────────────────────────────
	const renderBackground = (dims: Dimensions): void => {
		let bg = bgCanvasRef.current;
		if (!bg) {
			bg = document.createElement('canvas');
			bgCanvasRef.current = bg;
		}
		const { cssWidth, cssHeight, dpr } = dims;
		bg.width = Math.max(1, Math.round(cssWidth * dpr));
		bg.height = Math.max(1, Math.round(cssHeight * dpr));
		const ctx = bg.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// Backdrop.
		ctx.fillStyle = '#020617'; // slate-950
		ctx.fillRect(0, 0, cssWidth, cssHeight);

		const vp = viewportRef.current;
		const s = baseScale(Math.min(cssWidth, cssHeight)) * vp.zoom;
		const ox = vp.offsetX;
		const oy = vp.offsetY;

		const gridToBg = (coord: MapCoordinates): { x: number; y: number } => ({
			x: coord.x * s + ox,
			y: coord.y * s + oy,
		});

		// Grid lines (every 100 grid units).
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)'; // slate-700
		ctx.beginPath();
		for (let g = 0; g <= 1000; g += 100) {
			const top = gridToBg({ x: g, y: 0 });
			const bottom = gridToBg({ x: g, y: 1000 });
			ctx.moveTo(top.x, top.y);
			ctx.lineTo(bottom.x, bottom.y);
			const left = gridToBg({ x: 0, y: g });
			const right = gridToBg({ x: 1000, y: g });
			ctx.moveTo(left.x, left.y);
			ctx.lineTo(right.x, right.y);
		}
		ctx.stroke();

		// Stadium bowl rings (concentric, centered on grid center 500,500).
		const center = gridToBg({ x: 500, y: 500 });
		const ringBase = s * 200; // outer ring radius in px at zoom 1
		for (let i = 0; i < 4; i++) {
			const r = ringBase * (1 - i * 0.18);
			ctx.beginPath();
			ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
			ctx.strokeStyle = i === 0 ? 'rgba(71, 85, 105, 0.55)' : 'rgba(71, 85, 105, 0.28)';
			ctx.lineWidth = i === 0 ? 2 : 1;
			ctx.stroke();
		}

		// Pitch boundary (the field of play).
		const pitchTL = gridToBg({ x: 360, y: 360 });
		const pitchBR = gridToBg({ x: 640, y: 640 });
		ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)'; // emerald
		ctx.lineWidth = 2;
		ctx.strokeRect(pitchTL.x, pitchTL.y, pitchBR.x - pitchTL.x, pitchBR.y - pitchTL.y);
		// Center circle + halfway line.
		ctx.beginPath();
		ctx.arc(center.x, center.y, (pitchBR.x - pitchTL.x) * 0.12, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(pitchTL.x, center.y);
		ctx.lineTo(pitchBR.x, center.y);
		ctx.stroke();

		// Sector labels around the bowl.
		ctx.fillStyle = 'rgba(148, 163, 184, 0.55)'; // slate-400
		ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const sectors: { label: string; coord: MapCoordinates }[] = [
			{ label: 'SEC-112', coord: { x: 330, y: 230 } },
			{ label: 'SEC-308', coord: { x: 540, y: 730 } },
			{ label: 'CONC-1C', coord: { x: 640, y: 430 } },
			{ label: 'GATE-A', coord: { x: 210, y: 500 } },
			{ label: 'GATE-D', coord: { x: 790, y: 500 } },
		];
		for (const sec of sectors) {
			const p = gridToBg(sec.coord);
			ctx.fillText(sec.label, p.x, p.y);
		}

		bgDirtyRef.current = false;
	};

	// ── rAF render loop (started ONCE) ──────────────────────────────────────────
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let rafId = 0;

		// Observe container size — when it changes, resize the canvas + flag bg dirty.
		const resize = (): void => {
			const rect = container.getBoundingClientRect();
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const cssWidth = Math.max(1, Math.floor(rect.width));
			const cssHeight = Math.max(1, Math.floor(rect.height));
			const prev = dimsRef.current;
			const changed =
				prev.cssWidth !== cssWidth || prev.cssHeight !== cssHeight || prev.dpr !== dpr;
			if (changed) {
				canvas.width = Math.round(cssWidth * dpr);
				canvas.height = Math.round(cssHeight * dpr);
				canvas.style.width = `${cssWidth}px`;
				canvas.style.height = `${cssHeight}px`;
				dimsRef.current = { cssWidth, cssHeight, dpr };

				// Recenter the viewport on resize so the grid stays framed.
				const s = baseScale(Math.min(cssWidth, cssHeight));
				viewportRef.current.offsetX = (cssWidth - 1000 * s) / 2;
				viewportRef.current.offsetY = (cssHeight - 1000 * s) / 2;
				bgDirtyRef.current = true;
			}
		};

		const ro = new ResizeObserver(resize);
		ro.observe(container);
		resize();

		const render = (): void => {
			const dims = dimsRef.current;
			const { cssWidth, cssHeight, dpr } = dims;
			if (cssWidth === 0 || cssHeight === 0) {
				rafId = requestAnimationFrame(render);
				return;
			}

			// (Re)render the static background when dirty.
			if (bgDirtyRef.current) renderBackground(dims);

			// Clear + blit the offscreen background.
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, cssWidth, cssHeight);
			const bg = bgCanvasRef.current;
			if (bg) ctx.drawImage(bg, 0, 0, cssWidth, cssHeight);

			// Dynamic layer — drawn in screen space for consistent marker sizing.
			const { incidents: inc, staffMembers: staff } = propsRef.current;
			const pulse = (Math.sin(Date.now() / 150) + 1) / 2; // 0..1

			// Staff nodes (filtered by legend toggles).
			const f = filtersRef.current;
			for (const member of staff) {
				// Skip if this specialty or status is toggled off in the legend.
				if (!f.specialties.has(member.specialty)) continue;
				if (!f.statuses.has(member.status)) continue;

				const pos = gridToScreen(member.currentCoords ?? { x: 500, y: 500 });
				const color = specialtyColor(member.specialty);
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.fill();
				if (member.status === 'DISPATCHED') {
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
					ctx.strokeStyle = '#f8fafc';
					ctx.lineWidth = 2;
					ctx.stroke();
				}
			}

			// Incident beacons (pulsing, tier-colored).
			for (const incident of inc) {
				const pos = gridToScreen(incident.coordinates);
				const color = tierColor(incident.tier);
				const baseRadius = incident.tier <= 2 ? 9 : incident.tier === 3 ? 7 : 6;
				// Outer pulse halo.
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, baseRadius + pulse * 8, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.globalAlpha = 0.18;
				ctx.fill();
				ctx.globalAlpha = 1;
				// Solid core.
				ctx.beginPath();
				ctx.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.fill();
				ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
				ctx.lineWidth = 1.5;
				ctx.stroke();

				// Selection ring.
				if (selectedIdRef.current === incident.id) {
					ctx.beginPath();
					ctx.arc(pos.x, pos.y, baseRadius + 6, 0, Math.PI * 2);
					ctx.strokeStyle = '#f8fafc';
					ctx.lineWidth = 2;
					ctx.setLineDash([4, 3]);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}

			// HUD (written imperatively to avoid re-renders).
			const vp = viewportRef.current;
			const zoomPct = Math.round(vp.zoom * 100);
			if (hudZoomRef.current) hudZoomRef.current.textContent = `${zoomPct}%`;
			const centerGrid: MapCoordinates = {
				x: Math.round((cssWidth / 2 - vp.offsetX) / (baseScale(Math.min(cssWidth, cssHeight)) * vp.zoom)),
				y: Math.round((cssHeight / 2 - vp.offsetY) / (baseScale(Math.min(cssWidth, cssHeight)) * vp.zoom)),
			};
			if (hudCoordRef.current) {
				hudCoordRef.current.textContent = `${centerGrid.x}, ${centerGrid.y}`;
			}
			if (hudCountRef.current) {
				hudCountRef.current.textContent = `${inc.length} INC / ${staff.length} STAFF`;
			}

			// FPS counter (updated ~every 500ms).
			const nowMs = performance.now();
			fpsFrames.current++;
			if (nowMs - fpsLastUpdate.current >= 500) {
				const fps = Math.round((fpsFrames.current * 1000) / (nowMs - fpsLastUpdate.current));
				if (hudFpsRef.current) {
					hudFpsRef.current.textContent = `${fps}`;
					hudFpsRef.current.className = `font-bold ${fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400'}`;
				}
				fpsFrames.current = 0;
				fpsLastUpdate.current = nowMs;
			}

			rafId = requestAnimationFrame(render);
		};

		rafId = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(rafId);
			ro.disconnect();
		};
		// Deliberately empty deps — the loop runs for the component's lifetime.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Raycast: click → nearest incident ───────────────────────────────────────
	const pickIncident = (cssX: number, cssY: number): IncidentReport | null => {
		const { incidents } = propsRef.current;
		const tolerance = 18; // CSS px
		let best: IncidentReport | null = null;
		let bestDist = tolerance;
		for (const incident of incidents) {
			const pos = gridToScreen(incident.coordinates);
			const dist = Math.hypot(pos.x - cssX, pos.y - cssY);
			if (dist <= bestDist) {
				bestDist = dist;
				best = incident;
			}
		}
		return best;
	};

	// ── Raycast: click → nearest staff dot ──────────────────────────────────────
	const pickStaff = (cssX: number, cssY: number): WhitelistUser | null => {
		const { staffMembers } = propsRef.current;
		const f = filtersRef.current;
		const tolerance = 14; // CSS px
		let best: WhitelistUser | null = null;
		let bestDist = tolerance;
		for (const staff of staffMembers) {
			if (!staff.currentCoords) continue;
			if (!f.statuses.has(staff.status)) continue;
			const pos = gridToScreen(staff.currentCoords);
			const dist = Math.hypot(pos.x - cssX, pos.y - cssY);
			if (dist <= bestDist) {
				bestDist = dist;
				best = staff;
			}
		}
		return best;
	};

	// ── Pointer interaction (pan + pinch-zoom) ──────────────────────────────────
	const toCss = (clientX: number, clientY: number): { x: number; y: number } => {
		const canvas = canvasRef.current;
		if (!canvas) return { x: 0, y: 0 };
		const rect = canvas.getBoundingClientRect();
		return { x: clientX - rect.left, y: clientY - rect.top };
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
		const canvas = canvasRef.current;
		if (canvas) canvas.setPointerCapture(e.pointerId);
		const p = toCss(e.clientX, e.clientY);
		pointersRef.current.set(e.pointerId, p);

		if (pointersRef.current.size === 1) {
			dragRef.current = { lastX: p.x, lastY: p.y, active: true };
		} else if (pointersRef.current.size === 2) {
			const pts = [...pointersRef.current.values()];
			pinchRef.current = {
				startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
				startZoom: viewportRef.current.zoom,
			};
			dragRef.current.active = false;
		}
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
		if (!pointersRef.current.has(e.pointerId)) return;
		const p = toCss(e.clientX, e.clientY);
		pointersRef.current.set(e.pointerId, p);

		// Pinch zoom.
		if (pointersRef.current.size >= 2 && pinchRef.current) {
			const pts = [...pointersRef.current.values()];
			const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
			const factor = dist / (pinchRef.current.startDist || 1);
			viewportRef.current.zoom = clampZoom(pinchRef.current.startZoom * factor);
			return;
		}

		// Pan.
		if (dragRef.current.active) {
			const dx = p.x - dragRef.current.lastX;
			const dy = p.y - dragRef.current.lastY;
			viewportRef.current.offsetX += dx;
			viewportRef.current.offsetY += dy;
			dragRef.current.lastX = p.x;
			dragRef.current.lastY = p.y;
			// Re-render the background grid so it pans WITH the dots.
			// Without this, the grid stays static while dots shift — making it
			// look like the personnel are changing position.
			bgDirtyRef.current = true;
		}
	};

	const endPointer = (e: React.PointerEvent<HTMLCanvasElement>): void => {
		const wasDragging = dragRef.current.active;
		const moved = pointersRef.current.has(e.pointerId);
		pointersRef.current.delete(e.pointerId);
		const canvas = canvasRef.current;
		if (canvas && canvas.hasPointerCapture(e.pointerId)) {
			canvas.releasePointerCapture(e.pointerId);
		}

		// Treat as a click only if a single pointer tapped without panning.
		if (pointersRef.current.size === 0 && pinchRef.current === null) {
			if (wasDragging && moved) {
				// Determine if this was a tap (negligible movement) vs. a drag.
				// pickIncident is only invoked from handleCanvasClick.
			}
		}

		if (pointersRef.current.size < 2) pinchRef.current = null;
		if (pointersRef.current.size === 1) {
			const remaining = [...pointersRef.current.values()][0];
			dragRef.current = { lastX: remaining.x, lastY: remaining.y, active: true };
		} else if (pointersRef.current.size === 0) {
			dragRef.current.active = false;
		}
	};

	const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
		// Suppress click selection after a drag.
		if (dragMovedRef.current) {
			dragMovedRef.current = false;
			return;
		}
		const p = toCss(e.clientX, e.clientY);

		// Try incident first (higher priority — incidents are more important).
		const hitInc = pickIncident(p.x, p.y);
		if (hitInc) {
			setSelectedId(hitInc.id);
			setSelectedStaff(null);
			propsRef.current.onIncidentSelect(hitInc);
			return;
		}

		// Then try staff.
		const hitStaff = pickStaff(p.x, p.y);
		if (hitStaff) {
			setSelectedStaff(hitStaff);
			setSelectedId(null);
			return;
		}

		// Clicked empty space — deselect.
		setSelectedStaff(null);
		setSelectedId(null);
	};

	// Hover detection for staff tooltips (only when NOT dragging).
	const handleCanvasHover = (e: React.MouseEvent<HTMLCanvasElement>): void => {
		if (dragRef.current.active) {
			setTooltipData(null);
			return;
		}
		const p = toCss(e.clientX, e.clientY);
		const hit = pickStaff(p.x, p.y);
		if (hit) {
			setTooltipData({
				visible: true,
				x: p.x,
				y: p.y,
				name: hit.fullName,
				specialty: hit.specialty,
				zone: hit.assignedZone,
				status: hit.status,
				phone: hit.phoneNumber,
			});
		} else {
			setTooltipData(null);
		}
	};

	// Track whether the latest gesture moved enough to be a drag (not a tap).
	const trackDrag = (e: React.PointerEvent<HTMLCanvasElement>): void => {
		if (dragRef.current.active && pointersRef.current.has(e.pointerId)) {
			const p = toCss(e.clientX, e.clientY);
			if (Math.hypot(p.x - dragRef.current.lastX, p.y - dragRef.current.lastY) > 4) {
				dragMovedRef.current = true;
			}
		}
	};

	// Wheel zoom (anchored at cursor).
	const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
		e.preventDefault();
		const p = toCss(e.clientX, e.clientY);
		const vp = viewportRef.current;
		const dims = dimsRef.current;
		const s = baseScale(Math.min(dims.cssWidth, dims.cssHeight));
		// World point under the cursor before zoom.
		const wx = (p.x - vp.offsetX) / (s * vp.zoom);
		const wy = (p.y - vp.offsetY) / (s * vp.zoom);
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		vp.zoom = clampZoom(vp.zoom * factor);
		// Keep the cursor world point fixed.
		vp.offsetX = p.x - wx * s * vp.zoom;
		vp.offsetY = p.y - wy * s * vp.zoom;
		bgDirtyRef.current = true;
	};

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
			<canvas
				ref={canvasRef}
				className="block touch-none cursor-grab active:cursor-grabbing"
				onPointerDown={handlePointerDown}
				onPointerMove={(e) => {
					trackDrag(e);
					handlePointerMove(e);
				}}
				onPointerUp={endPointer}
				onPointerCancel={endPointer}
				onClick={handleCanvasClick}
				onMouseMove={handleCanvasHover}
				onWheel={handleWheel}
			/>

			{/* Hover tooltip for staff dots */}
			{tooltipData?.visible && (
				<div
					ref={tooltipRef}
					className="pointer-events-none absolute z-20 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
					style={{
						left: tooltipData.x + 16,
						top: tooltipData.y - 10,
					}}
				>
					<p className="font-bold text-slate-100">{tooltipData.name}</p>
					<p className="text-slate-400">
						{tooltipData.specialty} · {tooltipData.zone}
					</p>
					<p className={
						tooltipData.status === 'AVAILABLE' ? 'text-emerald-400' :
						tooltipData.status === 'DISPATCHED' ? 'text-amber-400' : 'text-slate-500'
					}>
						● {tooltipData.status}
					</p>
					<p className="font-mono text-[10px] text-slate-600">{tooltipData.phone}</p>
				</div>
			)}

			{/* Staff info panel (shown on click) */}
			{selectedStaff && (() => {
				// Filter incidents reported by this staff member.
				const staffIncidents = incidents.filter(
					(inc) => inc.reportedBy === selectedStaff.userId || inc.reportedBy === selectedStaff.id,
				);
				return (
				<div className="absolute bottom-3 right-3 z-20 w-72 rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-xs shadow-xl backdrop-blur">
					<div className="flex items-center justify-between">
						<h4 className="font-bold text-slate-100">{selectedStaff.fullName}</h4>
						<button
							onClick={() => setSelectedStaff(null)}
							className="text-slate-500 hover:text-slate-300"
						>
							✕
						</button>
					</div>
					<div className="mt-2 space-y-1 text-slate-400">
						<p>Phone: <span className="font-mono text-slate-300">{selectedStaff.phoneNumber}</span></p>
						<p>Specialty: <span className="capitalize text-slate-300">{selectedStaff.specialty}</span></p>
						<p>Zone: <span className="text-slate-300">{selectedStaff.assignedZone}</span></p>
						<p>Status: <span className={
							selectedStaff.status === 'AVAILABLE' ? 'text-emerald-400' :
							selectedStaff.status === 'DISPATCHED' ? 'text-amber-400' : 'text-slate-500'
						}>{selectedStaff.status}</span></p>
						{selectedStaff.roles.length > 0 && (
							<p>Roles: <span className="text-slate-300">{selectedStaff.roles.join(', ')}</span></p>
						)}
					</div>

					{/* Reports filed by this person */}
					{staffIncidents.length > 0 && (
						<div className="mt-3 border-t border-slate-700 pt-2">
							<p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">
								Reports filed ({staffIncidents.length})
							</p>
							<div className="max-h-32 space-y-1 overflow-auto">
								{staffIncidents.map((inc) => (
									<button
										key={inc.id}
										onClick={() => {
											onIncidentSelect(inc);
											setSelectedStaff(null);
										}}
										className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800"
									>
										<div className="flex items-center gap-1.5">
											<span
												className="inline-block h-1.5 w-1.5 rounded-full"
												style={{
													backgroundColor:
														inc.tier === 1 ? '#ef4444' :
														inc.tier === 2 ? '#f97316' :
														inc.tier === 3 ? '#f59e0b' :
														inc.tier === 4 ? '#3b82f6' : '#64748b',
												}}
											/>
											<span className="text-[10px] text-slate-300">
												T{inc.tier} · {inc.extractedMetadata.category}
											</span>
											<span className="ml-auto text-[9px] text-slate-600">
												{inc.status}
											</span>
										</div>
										<p className="mt-0.5 truncate text-[10px] text-slate-500">
											{inc.rawText}
										</p>
									</button>
								))}
							</div>
						</div>
					)}

					{staffIncidents.length === 0 && (
						<div className="mt-3 border-t border-slate-700 pt-2">
							<p className="text-[10px] text-slate-600">No reports filed by this person.</p>
						</div>
					)}
				</div>
				);
			})()}

			{/* Legend with toggles */}
			<div className="absolute bottom-3 left-3 z-20 rounded-xl border border-slate-800 bg-slate-950/90 p-3 backdrop-blur">
				<p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">Legend</p>

				{/* Specialty filters */}
				<div className="space-y-1">
					<p className="text-[9px] uppercase text-slate-600">Specialty</p>
					{([
						['security', '#3b82f6'],
						['medical', '#22c55e'],
						['cleaning', '#eab308'],
						['supervisor', '#a855f7'],
					] as const).map(([spec, color]) => (
						<label key={spec} className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-300">
							<input
								type="checkbox"
								checked={filters.specialties.has(spec)}
								onChange={() => {
									setFilters((prev) => {
										const next = new Set(prev.specialties);
										if (next.has(spec)) next.delete(spec);
										else next.add(spec);
										return { ...prev, specialties: next };
									});
								}}
								className="h-3 w-3"
							/>
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: color }}
							/>
							<span className="capitalize">{spec}</span>
						</label>
					))}
				</div>

				{/* Status filters */}
				<div className="mt-2 space-y-1">
					<p className="text-[9px] uppercase text-slate-600">Status</p>
					{([
						['AVAILABLE', '#22c55e'],
						['DISPATCHED', '#f59e0b'],
						['OFF_DUTY', '#64748b'],
					] as const).map(([status, color]) => (
						<label key={status} className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-300">
							<input
								type="checkbox"
								checked={filters.statuses.has(status)}
								onChange={() => {
									setFilters((prev) => {
										const next = new Set(prev.statuses);
										if (next.has(status)) next.delete(status);
										else next.add(status);
										return { ...prev, statuses: next };
									});
								}}
								className="h-3 w-3"
							/>
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: color }}
							/>
							<span>{status.replace('_', ' ')}</span>
						</label>
					))}
				</div>

				{/* Incident tier legend (informational, not toggleable) */}
				<div className="mt-2 space-y-1">
					<p className="text-[9px] uppercase text-slate-600">Incidents</p>
					{([
						['T1 Life', '#ef4444'],
						['T2 Urgent', '#f97316'],
						['T3 Priority', '#f59e0b'],
						['T4 Advisory', '#3b82f6'],
						['T5 Info', '#64748b'],
					] as const).map(([label, color]) => (
						<div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-400">
							<span
								className="inline-block h-2 w-2 rounded-full ring-1 ring-slate-600"
								style={{ backgroundColor: color }}
							/>
							<span>{label}</span>
						</div>
					))}
				</div>
			</div>

			{/* HUD overlay (imperatively updated, never re-renders React) */}
			<div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 backdrop-blur">
				<div className="flex items-center gap-2">
					<span className="text-slate-600">ZOOM</span>
					<span ref={hudZoomRef} className="font-bold text-emerald-400">
						100%
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-slate-600">CTR</span>
					<span ref={hudCoordRef} className="font-bold text-slate-300">
						500, 500
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span ref={hudCountRef} className="font-bold text-blue-400">
						0 INC / 0 STAFF
					</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-slate-600">FPS</span>
					<span ref={hudFpsRef} className="font-bold text-emerald-400">--</span>
				</div>
			</div>
		</div>
	);
}

// Clamp zoom to a sensible tactical range.
function clampZoom(z: number): number {
	return Math.max(0.5, Math.min(z, 4));
}
