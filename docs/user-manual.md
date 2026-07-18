# StadOps User Manual

Welcome to the **StadOps** user manual. StadOps is a cutting-edge, tactical venue management and incident tracking platform built for high-scale environments. It features a custom 60fps hardware-accelerated canvas engine, real-time tracking, and a powerful geographic map layout editor.

---

## 1. The Control Room (Tactical Radar)

The **Control Room** is the primary dashboard for active incident tracking and staff management.

### Navigating the Radar
- **Pan**: Click and drag anywhere on the map to pan around the venue.
- **Zoom**: Scroll your mouse wheel or use trackpad pinch-to-zoom to zoom in and out. The top right corner displays the current zoom level and your grid coordinates.
- **Geographic Mode**: If the venue has been bound to a real-world geographic location, the radar will display a native OpenStreetMap tile layer underneath the tactical grid, which scales and pans dynamically at 60fps.

### Incident and Staff Tracking
- **Incidents (Red Pulses)**: Active incidents are displayed with expanding red pulses to alert operators to critical areas.
- **Staff (Teal Markers)**: Active staff members are tracked as teal dots.
- **Hover/Click**: Hovering over an incident displays its ID, priority, and location on the Heads-Up Display (HUD). Clicking an incident brings up its detailed payload in the incident list on the left.

### HUD and Tools
- **Live Event Logs**: The left sidebar shows a feed of incoming incident reports. Click any report to instantly jump to its location on the radar.
- **HUD Data**: The bottom-left displays the total incident count and active staff count.
- **FPS Monitor**: The top right shows the application's render speed. StadOps is optimized to stay at 60FPS even with thousands of concurrent entities.

---

## 2. Map Layout Editor

The **Map Layout Editor** (accessible via `/admin`) allows you to define the structure of the stadium, drawing security zones, concession areas, and defining the real-world location of the venue.

### Setting the Geographic Base Map (OpenStreetMap)
You can optionally bind your venue's 1000x1000 tactical grid to a real-world location.
1. In the Map Layout Editor, look at the right sidebar under **Geographic Base**.
2. Click **Set Geographic Base**.
3. A native map window will appear. Pan and zoom until the entire venue fits precisely within the highlighted blue square in the center of the screen.
4. Click **Set Map Area**. 
5. The background of the editor will switch to the live map, allowing you to draw zones precisely over the real-world satellite or street view imagery.

### Floors and Navigation
- Use the **Floors** panel on the left to add, remove, or rename floors (e.g., "Ground Floor", "Upper Concourse").
- You can mark a specific floor as the default starting view.

### Drawing Zones
Select a drawing tool from the top toolbar:
- **Rectangle Tool**: Click and drag to create rectangular zones.
- **Circle Tool**: Click and drag outward from the center to create circular zones.
- **Polygon (Freehand) Tool**: Click points to create a custom polygon. Click near the starting point to close the shape.
- **Select Tool (Pointer)**: Click existing zones to modify their color, labels, or delete them.

### Adding Points of Interest (POIs)
Points of interest (Medical stations, Security outposts, Entry/Exit gates) can be placed to aid staff in navigation.
1. Select the **POI** tool.
2. Choose the type of POI from the dropdown.
3. Click anywhere on the map to place the marker.

---

## 3. Theming and Customization

StadOps features an advanced dynamic UI styling system that affects both the DOM and the WebGL/Canvas rendering pipeline.

- **Theme Toggle**: Located in the top right header (Sun/Moon icon).
- **Available Themes**: 
  - **Flat Dark**: A deep slate design for low-light environments.
  - **Flat Light**: A high-contrast bright theme.
  - **Neu Dark**: A highly stylized, premium Neumorphic dark theme using soft shadows to create depth.
- The canvas will automatically switch its color palette, grid lines, and incident highlights to match your selected theme seamlessly without dropping frames.
