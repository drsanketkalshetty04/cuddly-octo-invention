# World 3D

A 3D map of the whole Earth in a single HTML file: globe view, real terrain elevation,
3D buildings, every road and place from OpenStreetMap, satellite imagery, and a search bar.

## Use it

Open `index.html` in any modern browser (double-click it, keeping the `vendor` folder beside it, or host the folder on any static
host such as GitHub Pages). It needs an internet connection to load map data. No API key,
no build step, no install.

- **Search** – type any place, address, or `lat, lng`; press Enter or pick a suggestion. `/` focuses the box.
- **Move** – drag to pan, scroll/pinch to zoom, right-drag (or two-finger drag) to tilt and rotate.
- **Click the map** – drops a pin and names the spot.
- **Map / Satellite / Dark** – switch the look.
- **3D view / Terrain / Spin** – tilt the camera, turn real elevation on or off, rotate the globe.
- The page address updates as you move, so copying it shares the exact view.

## Data

| What | Source |
| --- | --- |
| Roads, places, buildings | [OpenFreeMap](https://openfreemap.org) vector tiles (OpenStreetMap data) |
| Elevation | Terrarium tiles (Tilezen / Mapzen) on AWS Open Data |
| Satellite imagery | Esri World Imagery |
| Search | [Photon](https://photon.komoot.io) (OpenStreetMap), falling back to Nominatim |
| Rendering | [MapLibre GL JS](https://maplibre.org) |

These are free public services meant for light use. For a high-traffic site, host your own
tiles and geocoder or use a paid provider.
