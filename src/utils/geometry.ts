import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';

// Center reference to keep numbers small for Three.js
let centerReference: [number, number] | null = null;
const SCALE = 100000; // Scale factor

export function setCenterReference(lon: number, lat: number) {
    centerReference = [lon, lat];
}

export function geoToVector3(lon: number, lat: number): THREE.Vector3 {
    if (!centerReference) throw new Error("Center reference not set");

    const [centerLon, centerLat] = centerReference;
    const x = (lon - centerLon) * SCALE * Math.cos((centerLat * Math.PI) / 180);
    const z = (lat - centerLat) * SCALE;
    return new THREE.Vector3(x, 0, z);
}

// Ensure mask polygon has correct winding order for turf operations
function prepareMask(mask: any): any {
    try {
        return turf.rewind(mask, { reverse: false });
    } catch {
        return mask;
    }
}

export function createBasePlate(bounds: number[], mask?: any) {
    if (mask) {
        try {
            const safeMask = prepareMask(mask);
            const coordinates = safeMask.geometry.coordinates;
            const outerRing = coordinates[0];
            if (!outerRing || outerRing.length < 4) throw new Error('Invalid mask');

            const shape = new THREE.Shape();
            outerRing.forEach((coord: any, index: number) => {
                const vec = geoToVector3(coord[0], coord[1]);
                if (index === 0) shape.moveTo(vec.x, vec.z);
                else shape.lineTo(vec.x, vec.z);
            });

            const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: 1,
                bevelEnabled: false
            });
            geometry.rotateX(-Math.PI / 2);
            return geometry;
        } catch {
            // Fall through to rectangle base plate
        }
    }

    const [west, south, east, north] = bounds;

    const p1 = geoToVector3(west, north);
    const p2 = geoToVector3(east, south);

    // Width (X) and Depth (Z)
    const width = Math.abs(p2.x - p1.x);
    const depth = Math.abs(p2.z - p1.z);

    // Center is average of corners
    const centerX = (p1.x + p2.x) / 2;
    const centerZ = (p1.z + p2.z) / 2;

    const geometry = new THREE.BoxGeometry(width, 1, depth);
    geometry.translate(centerX, 0.5, centerZ); // Shift UP so bottom is at 0 (Range 0 to 1)
    return geometry;
}


export function processBuildings(buildings: FeatureCollection, boundsArray: number[], mask?: any) {
    const geometries: THREE.BufferGeometry[] = [];
    const bbox = boundsArray as [number, number, number, number];

    buildings.features.forEach((feature) => {
        if (!feature.geometry) return;

        let clippedFeature: Feature<Polygon | MultiPolygon> | null = null;

        try {
            if (mask) {
                const safeMask = prepareMask(mask);
                const fc = turf.featureCollection([feature as any, safeMask as any]) as any;
                const clipped = turf.intersect(fc);
                if (clipped) {
                    clippedFeature = clipped as Feature<Polygon | MultiPolygon>;
                    clippedFeature.properties = feature.properties;
                }
            } else {
                // Use bboxClip
                const clipped = turf.bboxClip(feature as any, bbox);
                if (clipped && clipped.geometry && (clipped.geometry.type === 'Polygon' || clipped.geometry.type === 'MultiPolygon')) {
                    clippedFeature = clipped as Feature<Polygon | MultiPolygon>;
                    clippedFeature.properties = feature.properties;
                }
            }
        } catch (e) {
            // console.warn("Clip failed", e);
        }

        if (!clippedFeature) return;

        const polygons = clippedFeature.geometry.type === 'Polygon'
            ? [clippedFeature.geometry.coordinates]
            : clippedFeature.geometry.type === 'MultiPolygon'
                ? clippedFeature.geometry.coordinates
                : [];

        polygons.forEach(coords => {
            if (coords.length === 0) return;

            const outerRing = coords[0];
            const shape = new THREE.Shape();

            outerRing.forEach((coord, index) => {
                const vec = geoToVector3(coord[0], coord[1]);
                if (index === 0) shape.moveTo(vec.x, vec.z);
                else shape.lineTo(vec.x, vec.z);
            });

            // Holes
            for (let i = 1; i < coords.length; i++) {
                const holePath = new THREE.Path();
                coords[i].forEach((coord, index) => {
                    const vec = geoToVector3(coord[0], coord[1]);
                    if (index === 0) holePath.moveTo(vec.x, vec.z);
                    else holePath.lineTo(vec.x, vec.z);
                });
                shape.holes.push(holePath);
            }

            const props = clippedFeature?.properties || {};
            let levels = 1;
            if (props['building:levels']) levels = parseFloat(props['building:levels']);
            else if (props.height) levels = parseFloat(props.height) / 3;
            else levels = Math.floor(Math.random() * 2) + 1;

            const height = Math.max(levels * 3, 3);

            const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: height,
                bevelEnabled: false
            });

            geometry.rotateX(-Math.PI / 2);
            geometries.push(geometry);
        });
    });

    return geometries;
}

export function processRoads(roads: FeatureCollection, boundsArray: number[], mask?: any) {
    const geometries: THREE.BufferGeometry[] = [];
    const bbox = boundsArray as [number, number, number, number];

    roads.features.forEach((feature) => {
        if (!feature.geometry) return;

        // Buffer FIRST (on full geometry), THEN subtract/intersect 
        // We do NOT pre-clip the line to bbox, because that creates endpoints at the edge
        // which buffer() turns into rounded caps.
        // By buffering the longer line first, the buffer extends past the edge.
        // Then intersect() cuts it flush.

        try {
            // Buffer the road (width 6m approx)
            const buffered = turf.buffer(feature as any, 0.006, { units: 'kilometers' });

            if (buffered && (buffered.geometry.type === 'Polygon' || buffered.geometry.type === 'MultiPolygon')) {

                let finalPoly = buffered;

                if (mask) {
                    const safeMask = prepareMask(mask);
                    const fc = turf.featureCollection([buffered as any, safeMask as any]) as any;
                    const intersected = turf.intersect(fc);
                    if (intersected) finalPoly = intersected as any;
                    else return; // Completely outside mask
                } else {
                    // Box Mode: simple bboxClip on the BUFFERED POLYGON
                    // bboxClip on a Polygon will slice it cleanly at the box edges.
                    const clipped = turf.bboxClip(buffered as any, bbox);
                    if (clipped && clipped.geometry && (clipped.geometry.type === 'Polygon' || clipped.geometry.type === 'MultiPolygon')) {
                        finalPoly = clipped as any;
                    } else {
                        return; // Completely outside
                    }
                }

                const polyGeom = finalPoly.geometry;
                const polygons = polyGeom.type === 'Polygon' ? [polyGeom.coordinates] : polyGeom.coordinates;
                // ... (rest of processing)

                polygons.forEach((coords: any[]) => {
                    const outerRing = coords[0];
                    const shape = new THREE.Shape();

                    outerRing.forEach((coord: number[], index: number) => {
                        const vec = geoToVector3(coord[0], coord[1]);
                        if (index === 0) shape.moveTo(vec.x, vec.z);
                        else shape.lineTo(vec.x, vec.z);
                    });

                    const geometry = new THREE.ExtrudeGeometry(shape, {
                        depth: 0.8,
                        bevelEnabled: false
                    });
                    geometry.rotateX(-Math.PI / 2);
                    geometries.push(geometry);
                });
            }
        } catch (e) {
            // Skip
        }
    });

    return geometries;
}

export function processWater(water: FeatureCollection, boundsArray: number[], mask?: any) {
    const geometries: THREE.BufferGeometry[] = [];
    const bbox = boundsArray as [number, number, number, number];

    water.features.forEach((feature) => {
        if (!feature.geometry) return;

        try {
            let finalPoly: any = null;

            // Handle LineString waterways (rivers/streams) — buffer them to ~15m width
            if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
                const buffered = turf.buffer(feature as any, 0.015, { units: 'kilometers' });
                if (!buffered || (buffered.geometry.type !== 'Polygon' && buffered.geometry.type !== 'MultiPolygon')) return;
                finalPoly = buffered;
            } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                finalPoly = feature;
            } else {
                return;
            }

            // Clip to mask or bbox
            if (mask) {
                const safeMask = prepareMask(mask);
                const fc = turf.featureCollection([finalPoly as any, safeMask as any]) as any;
                const intersected = turf.intersect(fc);
                if (intersected) finalPoly = intersected;
                else return;
            } else {
                const clipped = turf.bboxClip(finalPoly as any, bbox);
                if (clipped && clipped.geometry && (clipped.geometry.type === 'Polygon' || clipped.geometry.type === 'MultiPolygon')) {
                    finalPoly = clipped;
                } else {
                    return;
                }
            }

            const polyGeom = finalPoly.geometry;
            const polygons = polyGeom.type === 'Polygon' ? [polyGeom.coordinates] : polyGeom.coordinates;

            polygons.forEach((coords: any[]) => {
                if (!coords || coords.length === 0) return;
                const outerRing = coords[0];
                if (!outerRing || outerRing.length < 4) return;

                const shape = new THREE.Shape();
                outerRing.forEach((coord: number[], index: number) => {
                    const vec = geoToVector3(coord[0], coord[1]);
                    if (index === 0) shape.moveTo(vec.x, vec.z);
                    else shape.lineTo(vec.x, vec.z);
                });

                // Add holes
                for (let i = 1; i < coords.length; i++) {
                    if (!coords[i] || coords[i].length < 4) continue;
                    const holePath = new THREE.Path();
                    coords[i].forEach((coord: number[], index: number) => {
                        const vec = geoToVector3(coord[0], coord[1]);
                        if (index === 0) holePath.moveTo(vec.x, vec.z);
                        else holePath.lineTo(vec.x, vec.z);
                    });
                    shape.holes.push(holePath);
                }

                const geometry = new THREE.ExtrudeGeometry(shape, {
                    depth: 1,
                    bevelEnabled: false,
                });
                geometry.rotateX(-Math.PI / 2);
                geometries.push(geometry);
            });
        } catch (e) {
            // Skip problematic features
        }
    });

    return geometries;
}
