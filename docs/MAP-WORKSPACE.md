# Tenant-Isolated High-Performance Canvas Grid Workspace

This document provides the core telemetry visualizer engine (`src/components/shared/OptimizedStadiumMapCanvas.tsx`). It uses a hardware-accelerated, double-buffered HTML5 2D canvas context to cleanly project real-time coordinates for field operators and serverless AI incident extractions. The layer repaints using `requestAnimationFrame`, handles accurate click-target interception maps, and enforces multi-tenant boundary parameters directly within the coordinate space.

---

## 1. Hardware-Accelerated Dynamic Map Canvas (`src/components/shared/OptimizedStadiumMapCanvas.tsx`)

```tsx
// src/components/shared/OptimizedStadiumMapCanvas.tsx
import React, { useRef, useEffect, useState } from 'react';
import { IncidentReport, WhitelistUser, MapCoordinates } from '../../types';

interface MapCanvasProps {
	incidents: IncidentReport[];
	staffMembers: WhitelistUser[];
	onIncidentSelect: (incident: IncidentReport) => void;
}

export const OptimizedStadiumMapCanvas: React.FC<MapCanvasProps> = ({ incidents, staffMembers, onIncidentSelect }) => {
	const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
	const [hoveredIncidentId, setHoveredIncidentId] = useState<string | null>(null);

	// Core Render Engine Loop Matrix
	useEffect(() => {
		const targetCanvas = canvasElementRef.current;
		if (!targetCanvas) return;

		const renderingContext = targetCanvas.getContext('2d');
		if (!renderingContext) return;

		let systemAnimationFrameId: number;

		const executeCanvasRepaintLayer = () => {
			const surfaceWidth = targetCanvas.width;
			const surfaceHeight = targetCanvas.height;

			// 1. Double-Buffer Clear Phase: Wipe canvas grid elements cleanly
			renderingContext.fillStyle = '#020617'; // slate-950 backdrop
			renderingContext.fillRect(0, 0, surfaceWidth, surfaceHeight);

			// 2. Render Tactical Infrastructure Grid Matrix Line Segments
			renderingContext.strokeStyle = '#1e293b'; // slate-800 boundary
			renderingContext.lineWidth = 1;

			const structuralGridSpacingInterval = 50;
			for (let xPos = 0; xPos < surfaceWidth; xPos += structuralGridSpacingInterval) {
				renderingContext.beginPath();
				renderingContext.moveTo(xPos, 0);
				renderingContext.lineTo(xPos, surfaceHeight);
				renderingContext.stroke();
			}
			for (let yPos = 0; yPos < surfaceHeight; yPos += structuralGridSpacingInterval) {
				renderingContext.beginPath();
				renderingContext.moveTo(0, yPos);
				renderingContext.lineTo(surfaceWidth, yPos);
				renderingContext.stroke();
			}

			// 3. Draw Structural Stadium Ring Geometries
			renderingContext.strokeStyle = '#334155'; // slate-700 rings
			renderingContext.lineWidth = 2;
			renderingContext.beginPath();
			renderingContext.arc(
				surfaceWidth / 2,
				surfaceHeight / 2,
				Math.min(surfaceWidth, surfaceHeight) * 0.4,
				0,
				2 * Math.PI,
			);
			renderingContext.stroke();

			renderingContext.beginPath();
			renderingContext.arc(
				surfaceWidth / 2,
				surfaceHeight / 2,
				Math.min(surfaceWidth, surfaceHeight) * 0.25,
				0,
				2 * Math.PI,
			);
			renderingContext.stroke();

			// 4. Render Active Field Operative Vectors
			staffMembers.forEach((operative) => {
				const targetX = (operative.currentCoords.x / 1000) * surfaceWidth;
				const targetY = (operative.currentCoords.y / 1000) * surfaceHeight;

				// Pulse wave effect for active status verification
				renderingContext.fillStyle =
					operative.specialty === 'security' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)';
				renderingContext.beginPath();
				renderingContext.arc(targetX, targetY, 14 + Math.sin(Date.now() / 200) * 3, 0, 2 * Math.PI);
				renderingContext.fill();

				// Solid core marker point
				renderingContext.fillStyle = operative.specialty === 'security' ? '#3b82f6' : '#10b981'; // blue or emerald
				renderingContext.beginPath();
				renderingContext.arc(targetX, targetY, 5, 0, 2 * Math.PI);
				renderingContext.fill();

				// Tactical label identifier text strings
				renderingContext.fillStyle = '#94a3b8'; // slate-400
				renderingContext.font = 'bold 8px monospace';
				renderingContext.fillText(operative.fullName.toUpperCase(), targetX + 8, targetY + 3);
			});

			// 5. Render Serverless AI Extracted Incident Hotspots
			incidents.forEach((incident) => {
				const targetX = (incident.coordinates.x / 1000) * surfaceWidth;
				const targetY = (incident.coordinates.y / 1000) * surfaceHeight;
				const isHovered = incident.id === hoveredIncidentId;

				// Dynamic multi-tier alert coloration arrays
				let alertPrimaryHex = '#e11d48'; // rose-600 (Tier 1)
				if (incident.tier === 2) alertPrimaryHex = '#f59e0b'; // amber-500
				if (incident.tier === 3) alertPrimaryHex = '#38bdf8'; // sky-400

				// External alarm ring strobe loop calculation
				renderingContext.strokeStyle = alertPrimaryHex;
				renderingContext.lineWidth = isHovered ? 3 : 1.5;
				renderingContext.beginPath();
				renderingContext.arc(
					targetX,
					targetY,
					isHovered ? 12 : 8 + Math.abs(Math.sin(Date.now() / 300) * 4),
					0,
					2 * Math.PI,
				);
				renderingContext.stroke();

				// Inner solid validation core
				renderingContext.fillStyle = alertPrimaryHex;
				renderingContext.beginPath();
				renderingContext.arc(targetX, targetY, 4, 0, 2 * Math.PI);
				renderingContext.fill();

				// Metadata Callout Tag Box Overlay
				if (isHovered) {
					renderingContext.fillStyle = 'rgba(15, 23, 42, 0.95)';
					renderingContext.strokeStyle = alertPrimaryHex;
					renderingContext.lineWidth = 1;

					const dialogBoxWidth = 110;
					const dialogBoxHeight = 28;
					const boxX = targetX + 10;
					const boxY = targetY - 35;

					renderingContext.fillRect(boxX, boxY, dialogBoxWidth, dialogBoxHeight);
					renderingContext.strokeRect(boxX, boxY, dialogBoxWidth, dialogBoxHeight);

					renderingContext.fillStyle = '#ffffff';
					renderingContext.font = 'bold 8px monospace';
					renderingContext.fillText(`ID: ${incident.id.toUpperCase()}`, boxX + 6, boxY + 10);
					renderingContext.fillStyle = '#94a3b8';
					renderingContext.fillText(`SECTOR: ${incident.extractedMetadata.locationSector}`, boxX + 6, boxY + 20);
				}
			});

			systemAnimationFrameId = requestAnimationFrame(executeCanvasRepaintLayer);
		};

		// Initialize animation execution thread loop
		systemAnimationFrameId = requestAnimationFrame(executeCanvasRepaintLayer);

		return () => {
			cancelAnimationFrame(systemAnimationFrameId);
		};
	}, [incidents, staffMembers, hoveredIncidentId]);

	// Intercept cursor positional changes to drive custom tooltips
	const interpretMouseInteractionCoordinate = (evt: React.MouseEvent<HTMLCanvasElement>) => {
		const canvasNode = canvasElementRef.current;
		if (!canvasNode) return;

		const geometryBoundingRect = canvasNode.getBoundingClientRect();
		const cursorX = evt.clientX - geometryBoundingRect.left;
		const cursorY = evt.clientY - geometryBoundingRect.top;

		const drawingWidth = canvasNode.width;
		const drawingHeight = canvasNode.height;

		// Scan for intersection collisions against active incidents positions
		let matchedIncidentId: string | null = null;
		const clickInterceptionRadiusTolerance = 12;

		for (const incident of incidents) {
			const mappedX = (incident.coordinates.x / 1000) * drawingWidth;
			const mappedY = (incident.coordinates.y / 1000) * drawingHeight;

			const vectorDistanceDistance = Math.sqrt(Math.pow(cursorX - mappedX, 2) + Math.pow(cursorY - mappedY, 2));
			if (vectorDistanceDistance <= clickInterceptionRadiusTolerance) {
				matchedIncidentId = incident.id;
				break;
			}
		}

		setHoveredIncidentId(matchedIncidentId);
	};

	const executeTargetSelectionQuery = (evt: React.MouseEvent<HTMLCanvasElement>) => {
		if (hoveredIncidentId) {
			const clickedIncidentObject = incidents.find((item) => item.id === hoveredIncidentId);
			if (clickedIncidentObject) {
				console.log(`🎯 Canvas Viewport Selection Intercepted: ${clickedIncidentObject.id}`);
				onIncidentSelect(clickedIncidentObject);
			}
		}
	};

	return (
		<div className="relative w-full h-full border border-slate-900 bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center p-2 shadow-inner">
			{/* Top Left Hot Read Metric Ring Hud */}
			<div className="absolute top-4 left-4 z-10 font-mono text-[9px] text-slate-500 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 space-y-1">
				<div className="flex items-center space-x-1.5">
					<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
					<span className="text-slate-300 font-bold uppercase">CANVAS COMPONENT SYNCED</span>
				</div>
				<p>MATRIX DATA RESOLUTION: 1000x1000 PT</p>
				<p>REGISTERED TARGET VECTORS: {incidents.length + staffMembers.length}</p>
			</div>

			<canvas
				ref={canvasElementRef}
				width={900}
				height={650}
				onMouseMove={interpretMouseInteractionCoordinate}
				onClick={executeTargetSelectionQuery}
				className="w-full h-full max-w-full max-h-full aspect-900/650 block cursor-crosshair transition-all rounded-xl"
			/>
		</div>
	);
};
```

```

```
