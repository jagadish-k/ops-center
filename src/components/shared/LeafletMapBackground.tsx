import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Map } from 'leaflet';

export interface LeafletMapRef {
	updateBounds: (bounds: { lat1: number; lng1: number; lat2: number; lng2: number }) => void;
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

	useImperativeHandle(ref, () => ({
		updateBounds: (b) => {
			if (mapRef.current) {
				mapRef.current.fitBounds([
					[b.lat1, b.lng1],
					[b.lat2, b.lng2]
				], { animate: false });
			}
		}
	}));

	const initialBounds: [number, number][] = [
		[bounds.south, bounds.west],
		[bounds.north, bounds.east]
	];

	return (
		<div className="absolute inset-0 z-0 pointer-events-none opacity-80 mix-blend-luminosity dark:mix-blend-luminosity dark:invert dark:opacity-60">
			<MapContainer 
				bounds={initialBounds}
				zoomControl={false}
				dragging={false}
				scrollWheelZoom={false}
				doubleClickZoom={false}
				touchZoom={false}
				keyboard={false}
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
