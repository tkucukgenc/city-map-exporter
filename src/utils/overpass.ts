import osmtogeojson from 'osmtogeojson';
import { LngLatBounds } from 'maplibre-gl';

export interface OSMData {
    buildings: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
    roads: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString>;
}

export async function fetchOSMData(bounds: LngLatBounds): Promise<OSMData> {
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    const query = `
    [out:json][timeout:25];
    (
      way["building"](${south},${west},${north},${east});
      relation["building"](${south},${west},${north},${east});
      
      way["highway"](${south},${west},${north},${east});
      
      // Also get water/parks if we want?
      // relation["natural"="water"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

    const url = 'https://overpass-api.de/api/interpreter';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `data=${encodeURIComponent(query)}`
        });

        if (!response.ok) {
            throw new Error(`Overpass API Error: ${response.statusText}`);
        }

        const json = await response.json();
        const geojson = osmtogeojson(json);

        // Filter into buildings and roads
        const buildings: GeoJSON.FeatureCollection<any> = {
            type: 'FeatureCollection',
            features: geojson.features.filter((f: any) =>
                f.properties?.building && f.geometry.type !== 'Point'
            )
        };

        const roads: GeoJSON.FeatureCollection<any> = {
            type: 'FeatureCollection',
            features: geojson.features.filter((f: any) =>
                f.properties?.highway && f.geometry.type === 'LineString'
            )
        };

        return { buildings, roads };

    } catch (error) {
        console.error("Failed to fetch OSM data:", error);
        throw error;
    }
}
