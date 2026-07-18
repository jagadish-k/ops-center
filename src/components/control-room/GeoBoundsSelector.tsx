import { useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { Button } from '@heroui/react';
import 'leaflet/dist/leaflet.css';
import type { Map } from 'leaflet';

interface GeoBoundsSelectorProps {
	onSave: (bounds: { north: number; south: number; east: number; west: number }) => void;
	onCancel: () => void;
}

export function GeoBoundsSelector({ onSave, onCancel }: GeoBoundsSelectorProps) {
	const mapRef = useRef<Map | null>(null);

	const handleSave = () => {
		if (!mapRef.current) return;
		const map = mapRef.current;
		const size = map.getSize();
		const cx = size.x / 2;
		const cy = size.y / 2;
		
		// The target square is 300x300 pixels
		const halfSize = 150;
		const tl = map.containerPointToLatLng([cx - halfSize, cy - halfSize]);
		const br = map.containerPointToLatLng([cx + halfSize, cy + halfSize]);
		
		onSave({
			north: tl.lat,
			west: tl.lng,
			south: br.lat,
			east: br.lng
		});
	};

	return (
		<div className="absolute inset-0 z-50 flex flex-col bg-slate-900">
			<header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
				<div>
					<h2 className="font-mono text-sm font-bold uppercase tracking-widest text-slate-100">Locate Venue Base Map</h2>
					<p className="text-xs text-slate-400">Pan and zoom so the entire venue fits precisely within the highlighted square.</p>
				</div>
				<div className="flex gap-2">
					<Button variant="ghost" className="text-slate-300" onPress={onCancel}>Cancel</Button>
					<Button variant="solid" color="primary" onPress={handleSave}>Set Map Area</Button>
				</div>
			</header>

			<div className="relative flex-1 bg-slate-800">
				<MapContainer
					center={[40.8128, -74.0742]} // Default to MetLife Stadium area
					zoom={16}
					ref={mapRef}
					className="h-full w-full"
				>
					<TileLayer
						attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
						url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
					/>
				</MapContainer>

				{/* The target square overlay */}
				<div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 border-2 border-blue-500 bg-blue-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.6)]">
					<div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500"></div>
				</div>
			</div>
		</div>
	);
}
