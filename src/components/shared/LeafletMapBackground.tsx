import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Map } from 'leaflet';

export interface LeafletMapRef {
	updateBounds: (bounds: { lat1: number; lng1: number; lat2: number; lng2: number }) => void;
	applyTransform: (x: number, y: number, scale: number) => void;
}

interface LeafletMapBackgroundProps {
	bounds: { north: number; south: number; east: number; west: number };
}

function MapUpdater({ mapRef }: { mapRef: React.MutableRefObject<Map | null> }) {
	const map = useMap();
	useEffect(() => {
		mapRef.current = map;
	}, [map, mapRef]);
	return null;
}

export const LeafletMapBackground = forwardRef<LeafletMapRef, LeafletMapBackgroundProps>(({ bounds }, ref) => {
	const mapRef = useRef<Map | null>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useImperativeHandle(ref, () => ({
		updateBounds: (b) => {
			if (mapRef.current) {
				mapRef.current.fitBounds([
					[b.lat1, b.lng1],
					[b.lat2, b.lng2]
				], { animate: false, padding: [0, 0] });
			}
		},
		applyTransform: (x, y, scale) => {
			if (wrapperRef.current) {
				wrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
			}
		}
	}));

	const initialBounds: [number, number][] = [
		[bounds.south, bounds.west],
		[bounds.north, bounds.east]
	];

	return (
		<div 
			ref={wrapperRef}
			style={{ width: 1000, height: 1000, transformOrigin: '0 0' }}
			className="absolute left-0 top-0 z-0 pointer-events-none opacity-80 mix-blend-luminosity dark:mix-blend-luminosity dark:invert dark:opacity-60">
			<MapContainer 
				bounds={initialBounds}
				boundsOptions={{ padding: [0, 0] }}
				zoomControl={false}
				dragging={false}
				scrollWheelZoom={false}
				doubleClickZoom={false}
				touchZoom={false}
				keyboard={false}
				zoomSnap={0}
				className="h-full w-full bg-transparent"
			>
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>
				<MapUpdater mapRef={mapRef} />
			</MapContainer>
		</div>
	);
});
