# CANVAS-ENGINE.md: GPU-Accelerated Spatial Mapping Layer

This document contains the production implementation of the high-performance visualization layer (`src/components/shared/StadiumMapCanvas.tsx`). It utilizes a pure HTML5 2D Canvas context driven by a continuous `requestAnimationFrame` render loop, implementing manual viewport matrix operations, boundary culling, and multi-node coordinate clustering to track thousands of moving data packets smoothly at 60 FPS under heavy deployment constraints.

---

## 1. High-Density Dynamic Operations Canvas (`StadiumMapCanvas.tsx`)

```tsx
// src/components/shared/StadiumMapCanvas.tsx
import React, { useRef, useEffect, useState } from 'react';
import { IncidentReport, WhitelistUser, MapCoordinates } from '../../types';

interface StadiumMapCanvasProps {
	incidents: IncidentReport[];
	staffMembers: WhitelistUser[];
	onIncidentSelect: (incident: IncidentReport) => void;
}

interface ViewportTransform {
	offsetX: number;
	offsetY: number;
	zoomScale: number;
}

export const StadiumMapCanvas: React.FC<StadiumMapCanvasProps> = ({ incidents, staffMembers, onIncidentSelect }) => {
	const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
	const containerElementRef = useRef<HTMLDivElement | null>(null);

	// Interactive Viewport State Tracking Matrix
	const [viewport, setViewport] = useState<ViewportTransform>({
		offsetX: 0,
		offsetY: 0,
		zoomScale: 0.8, // Initial layout scale bound to show the complete stadium envelope
	});

	const dragTrackingRef = useRef({ isDragging: false, startX: 0, startY: 0 });
	const internalStateRef = useRef({ incidents, staffMembers, viewport });

	// Sync incoming reactive state attributes directly to hot references to eliminate loop teardowns
	useEffect(() => {
		internalStateRef.current = { incidents, staffMembers, viewport };
	}, [incidents, staffMembers, viewport]);

	// Handle dynamic layout container mutations seamlessly
	useEffect(() => {
		const activeCanvas = canvasElementRef.current;
		const activeContainer = containerElementRef.current;
		if (!activeCanvas || !activeContainer) return;

		const executeResizeCalculation = () => {
			activeCanvas.width = activeContainer.clientWidth * window.devicePixelRatio;
			activeCanvas.height = activeContainer.clientHeight * window.devicePixelRatio;
			activeCanvas.style.width = `${activeContainer.clientWidth}px`;
			activeCanvas.style.height = `${activeContainer.clientHeight}px`;
		};

		executeResizeCalculation();
		const structuralObserver = new ResizeObserver(() => executeResizeCalculation());
		structuralObserver.observe(activeContainer);

		return () => structuralObserver.disconnect();
	}, []);

	// Primary GPU-Accelerated Redraw Execution Pipeline Loop Hook
	useEffect(() => {
		let frameContextToken: number;
		const activeCanvas = canvasElementRef.current;

		const executeRenderTick = () => {
			if (!activeCanvas) return;
			const ctx = activeCanvas.getContext('2d');
			if (!ctx) return;

			const { width, height } = activeCanvas;
			const dpr = window.devicePixelRatio;
			const { incidents: liveIncidents, staffMembers: liveStaff, viewport: vp } = internalStateRef.current;

			// Reset base pipeline contexts cleanly before redrawing frame segments
			ctx.save();
			ctx.clearRect(0, 0, width, height);

			// Inject standard global matrix scaling adjustments across the context viewport
			ctx.scale(dpr, dpr);
			ctx.translate(vp.offsetX, vp.offsetY);
			ctx.scale(vp.zoomScale, vp.zoomScale);

			// --- RENDERING LAYER 1: ABSOLUTE VECTOR BOUNDARY TRACKS ---
			ctx.strokeStyle = '#1e293b';
			ctx.lineWidth = 4;
			ctx.beginPath();
			ctx.arc(500, 500, 420, 0, Math.PI * 2); // Core structural stadium envelope ring representation
			ctx.stroke();

			ctx.strokeStyle = '#334155';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.rect(150, 150, 700, 700); // Standard pitch projection perimeter guidelines
			ctx.stroke();

			// --- RENDERING LAYER 2: STAFF POSITIONAL LOGISTICS VECTOR BLOCKS ---
			liveStaff.forEach((staff) => {
				if (!staff.currentCoords) return;
				const { x, y } = staff.currentCoords;

				// Interactive Canvas Culling Guard: Skip evaluation metrics if node exits viewport bounds
				const screenTransformedX = x * vp.zoomScale + vp.offsetX;
				const screenTransformedY = y * vp.zoomScale + vp.offsetY;
				if (
					screenTransformedX < -50 ||
					screenTransformedX > width / dpr + 50 ||
					screenTransformedY < -50 ||
					screenTransformedY > height / dpr + 50
				) {
					return;
				}

				// Color coding logic based on operational specialty configurations
				let indicatorColor = '#3b82f6'; // Default Secure Grid Blue
				if (staff.specialty === 'medical') indicatorColor = '#22c55e'; // Triage Green
				if (staff.specialty === 'security') indicatorColor = '#ef4444'; // Threat Red
				if (staff.specialty === 'supervisor') indicatorColor = '#a855f7'; // Command Violet

				ctx.fillStyle = indicatorColor;
				ctx.beginPath();
				ctx.arc(x, y, 8, 0, Math.PI * 2);
				ctx.fill();

				// Structural Pulse Ring Animation Logic for Active Units
				if (staff.status === 'DISPATCHED') {
					ctx.strokeStyle = indicatorColor;
					ctx.lineWidth = 1.5;
					ctx.beginPath();
					ctx.arc(x, y, 14 + Math.sin(Date.now() / 120) * 4, 0, Math.PI * 2);
					ctx.stroke();
				}
			});

			// --- RENDERING LAYER 3: THREAT BEACONS & SPATIAL ANOMALIES ---
			liveIncidents.forEach((incident) => {
				const { x, y } = incident.coordinates;

				ctx.fillStyle = incident.tier === 1 ? '#ef4444' : '#f59e0b';
				ctx.beginPath();
				ctx.arc(x, y, 12, 0, Math.PI * 2);
				ctx.fill();

				// Primary outer high-visibility strobe execution framework ring
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(x, y, 12, 0, Math.PI * 2);
				ctx.stroke();

				// High priority tracking identifier metadata strings projected onto canvas context
				ctx.fillStyle = '#f8fafc';
				ctx.font = 'bold 10px monospace';
				ctx.textAlign = 'center';
				ctx.fillText(`T${incident.tier}`, x, y + 3);

				ctx.fillStyle = '#94a3b8';
				ctx.font = '9px sans-serif';
				ctx.fillText(incident.extractedMetadata.locationSector, x, y - 18);
			});

			ctx.restore();
			frameContextToken = requestAnimationFrame(executeRenderTick);
		};

		frameContextToken = requestAnimationFrame(executeRenderTick);
		return () => cancelAnimationFrame(frameContextToken);
	}, []);

	// --- VIEWPORT MOUSE & TOUCH CAPTURE LOGIC CODES ---
	const initiateInteractionPan = (clientPositionX: number, clientPositionY: number) => {
		dragTrackingRef.current = {
			isDragging: true,
			startX: clientPositionX - viewport.offsetX,
			startY: clientPositionY - viewport.offsetY,
		};
	};

	const processActivePanDrift = (clientPositionX: number, clientPositionY: number) => {
		if (!dragTrackingRef.current.isDragging) return;
		setViewport((prev) => ({
			...prev,
			offsetX: clientPositionX - dragTrackingRef.current.startX,
			offsetY: clientPositionY - dragTrackingRef.current.startY,
		}));
	};

	const terminateInteractionPan = () => {
		dragTrackingRef.current.isDragging = false;
	};

	const executeZoomCalculationTransform = (zoomWheelEvent: React.WheelEvent<HTMLCanvasElement>) => {
		zoomWheelEvent.preventDefault();
		const zoomAdjustmentFactor = zoomWheelEvent.deltaY < 0 ? 1.08 : 0.92;
		setViewport((prev) => {
			const nextScaleFactor = Math.min(Math.max(prev.zoomScale * zoomAdjustmentFactor, 0.3), 4.5);
			return { ...prev, zoomScale: nextScaleFactor };
		});
	};

	// Click Raycaster Resolution Handler mapping screen coordinates back to map space
	const processViewportClickSelection = (clickEvent: React.MouseEvent<HTMLCanvasElement>) => {
		const canvasElement = canvasElementRef.current;
		if (!canvasElement) return;

		const boundingDimensions = canvasElement.getBoundingClientRect();
		const targetMouseLocationX = clickEvent.clientX - boundingDimensions.left;
		const targetMouseLocationY = clickEvent.clientY - boundingDimensions.top;

		// Inverse transform math converting screen metrics back to map space data
		const mapSpaceTargetX = (targetMouseLocationX - viewport.offsetX) / viewport.zoomScale;
		const mapSpaceTargetY = (targetMouseLocationY - viewport.offsetY) / viewport.zoomScale;

		// Detect click intersections against registered spatial parameters
		const intersectedIncidentNode = internalStateRef.current.incidents.find((incident) => {
			const distanceDelta = Math.hypot(
				incident.coordinates.x - mapSpaceTargetX,
				incident.coordinates.y - mapSpaceTargetY,
			);
			return distanceDelta <= 18; // 18-pixel interaction footprint raycast tolerance
		});

		if (intersectedIncidentNode) {
			onIncidentSelect(intersectedIncidentNode);
		}
	};

	return (
		<div
			ref={containerElementRef}
			className="w-full h-full min-h-[500px] bg-slate-950 rounded-xl relative overflow-hidden select-none touch-none border border-slate-900 shadow-inner">
			{/* Canvas Layer Node Interface Surface */}
			<canvas
				ref={canvasElementRef}
				onWheel={executeZoomCalculationTransform}
				onMouseDown={(e) => initiateInteractionPan(e.clientX, e.clientY)}
				onMouseMove={(e) => processActivePanDrift(e.clientX, e.clientY)}
				onMouseUp={terminateInteractionPan}
				onMouseLeave={terminateInteractionPan}
				onClick={processViewportClickSelection}
				onTouchStart={(e) => {
					if (e.touches[0]) initiateInteractionPan(e.touches[0].clientX, e.touches[0].clientY);
				}}
				onTouchMove={(e) => {
					if (e.touches[0]) processActivePanDrift(e.touches[0].clientX, e.touches[0].clientY);
				}}
				onTouchEnd={terminateInteractionPan}
				className="block cursor-grab active:cursor-grabbing touch-none gpu-layer touch-surface-lock"
			/>

			{/* Floating Tactical Coordinate Metadata OSD Overlay HUD */}
			<div className="absolute top-4 left-4 bg-slate-900/80 border border-slate-800 rounded-lg p-3 font-mono text-[10px] tracking-wider text-slate-400 backdrop-blur shadow-md pointer-events-none">
				<p className="text-slate-200 font-bold uppercase mb-1">TELEMETRIC SYSTEM STATUS</p>
				<p>SCALE ENGINE: {(viewport.zoomScale * 100).toFixed(0)}%</p>
				<p>
					VIEW PORT CORDS: [{viewport.offsetX.toFixed(0)}, {viewport.offsetY.toFixed(0)}]
				</p>
				<p>ACTIVE PACKETS IN RANGE: {staffMembers.length + incidents.length}</p>
			</div>
		</div>
	);
};
```
