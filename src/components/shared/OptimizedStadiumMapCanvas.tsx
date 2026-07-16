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

	// HUD DOM text nodes (written imperatively each frame).
	const hudZoomRef = useRef<HTMLSpanElement | null>(null);
	const hudCoordRef = useRef<HTMLSpanElement | null>(null);
	const hudCountRef = useRef<HTMLSpanElement | null>(null);

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

			// Staff nodes.
			for (const member of staff) {
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
		const hit = pickIncident(p.x, p.y);
		if (hit) {
			setSelectedId(hit.id);
			propsRef.current.onIncidentSelect(hit);
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
				onWheel={handleWheel}
			/>

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
			</div>
		</div>
	);
}

// Clamp zoom to a sensible tactical range.
function clampZoom(z: number): number {
	return Math.max(0.5, Math.min(z, 4));
}
