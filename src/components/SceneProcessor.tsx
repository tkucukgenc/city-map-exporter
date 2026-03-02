import { useEffect, useState, useRef } from 'react';
import { LngLatBounds } from 'maplibre-gl';
import * as THREE from 'three';
import { processBuildings, processRoads, createBasePlate, setCenterReference } from '../utils/geometry';
import PreviewCanvas from './PreviewCanvas';
import { Download, ArrowLeft, Settings } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import osmtogeojson from 'osmtogeojson';

type ExportFormat = 'stl' | 'obj' | 'glb' | 'ply';

interface SceneProcessorProps {
    bounds: LngLatBounds;
    mask?: any;
    onBack: () => void;
}

export default function SceneProcessor({ bounds, mask, onBack }: SceneProcessorProps) {
    const [buildingGeos, setBuildingGeos] = useState<THREE.BufferGeometry[]>([]);
    const [roadGeos, setRoadGeos] = useState<THREE.BufferGeometry[]>([]);
    const [baseGeo, setBaseGeo] = useState<THREE.BufferGeometry | null>(null);

    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("initializing");
    const [error, setError] = useState<string | null>(null);
    const [exportFormat, setExportFormat] = useState<ExportFormat>('stl');

    const [baseHeight, setBaseHeight] = useState(2);
    const [groundThickness, setGroundThickness] = useState(1);
    const [heightScale, setHeightScale] = useState(1);

    const exportGroupRef = useRef<THREE.Group>(null);
    const [osmData, setOsmData] = useState<{ buildings: any, roads: any } | null>(null);

    const { t } = useLanguage();
    const { isDark } = useTheme();

    // Fetch Data
    useEffect(() => {
        let active = true;
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                setStatus("fetchingData");

                const pad = 0.002;
                const south = bounds.getSouth() - pad;
                const west = bounds.getWest() - pad;
                const north = bounds.getNorth() + pad;
                const east = bounds.getEast() + pad;

                const query = `
                    [out:json][timeout:60];
                    (
                      way["building"](${south},${west},${north},${east});
                      relation["building"](${south},${west},${north},${east});
                      way["highway"](${south},${west},${north},${east});
                    );
                    out body;
                    >;
                    out skel qt;
                `;

                const servers = [
                    "https://overpass-api.de/api/interpreter",
                    "https://overpass.kumi.systems/api/interpreter",
                ];

                let lastError: Error | null = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    if (!active) return;
                    const server = servers[attempt % servers.length];
                    try {
                        const response = await fetch(server, {
                            method: "POST",
                            body: query,
                        });

                        if (!response.ok) {
                            throw new Error(`Overpass API Error: ${response.status} ${response.statusText}`);
                        }

                        const data = await response.json();
                        if (active) {
                            setStatus("processingData");
                            const geojson = osmtogeojson(data) as any;

                            const buildings = {
                                type: "FeatureCollection",
                                features: geojson.features.filter((f: any) =>
                                    f.properties.building && f.geometry.type !== 'Point'
                                )
                            };

                            const roads = {
                                type: "FeatureCollection",
                                features: geojson.features.filter((f: any) =>
                                    f.properties.highway && f.geometry.type === 'LineString'
                                )
                            };

                            setOsmData({ buildings: buildings as any, roads: roads as any });
                        }
                        return; // Success, exit retry loop
                    } catch (err: any) {
                        lastError = err;
                        console.warn(`Attempt ${attempt + 1} failed (${server}):`, err.message);
                        if (attempt < 2) {
                            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                        }
                    }
                }

                // All retries exhausted
                if (active && lastError) {
                    setError(lastError.message || "Failed to fetch map data");
                    setLoading(false);
                }
            } catch (err: any) {
                if (active) {
                    setError(err.message || "Failed to fetch map data");
                    setLoading(false);
                }
            }
        };

        fetchData();
        return () => { active = false; };
    }, [bounds]);

    // Process Geometry
    useEffect(() => {
        if (!osmData) return;
        let active = true;

        const process = async () => {
            try {
                if (!active) return;
                setLoading(true);
                setStatus("generating3D");

                await new Promise(r => setTimeout(r, 100));

                const center = bounds.getCenter();
                setCenterReference(center.lng, center.lat);

                const turfBounds = [
                    bounds.getWest(),
                    bounds.getSouth(),
                    bounds.getEast(),
                    bounds.getNorth()
                ];

                const bGeos = processBuildings(osmData.buildings, turfBounds, mask);
                const rGeos = processRoads(osmData.roads, turfBounds, mask);
                const bPlate = createBasePlate(turfBounds, mask);

                if (active) {
                    setBuildingGeos(bGeos);
                    setRoadGeos(rGeos);
                    setBaseGeo(bPlate);
                    setLoading(false);
                }
            } catch (err: any) {
                if (active) {
                    setError("Error generating 3D models: " + err.message);
                    setLoading(false);
                }
            }
        };

        process();
        return () => { active = false; };
    }, [osmData, baseHeight, bounds, mask]);

    if (loading || error) {
        return (
            <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
                style={{ backgroundColor: 'var(--color-overlay-bg)', color: 'var(--color-text)' }}>
                <div className="text-center max-w-md px-6">
                    {loading ? (
                        <>
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
                                style={{ borderColor: 'var(--color-primary)' }}></div>
                            <h3 className="text-xl font-semibold mb-2">{t(status)}</h3>
                            <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">{t('largeAreaHint')}</p>
                        </>
                    ) : (
                        <>
                            <div className="mb-4 text-4xl" style={{ color: 'var(--color-error)' }}>⚠️</div>
                            <h3 className="text-xl font-semibold mb-2">{t('errorOccurred')}</h3>
                            <p className="mb-6 p-3 rounded border font-mono text-sm break-words"
                                style={{
                                    backgroundColor: 'var(--color-error-bg)',
                                    borderColor: 'var(--color-error-border)',
                                    color: 'var(--color-error)'
                                }}>
                                {error}
                            </p>
                            <button
                                onClick={onBack}
                                className="px-4 py-2 rounded transition"
                                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                            >
                                {t('goBack')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    const handleDownload = async () => {
        if (!exportGroupRef.current) return;

        try {
            const timestamp = new Date().getTime();

            switch (exportFormat) {
                case 'stl': {
                    const { STLExporter } = await import('three-stdlib');
                    const exporter = new STLExporter();
                    const result = exporter.parse(exportGroupRef.current, { binary: true });
                    downloadBlob(new Blob([result as BlobPart], { type: 'application/octet-stream' }), `city-export-${timestamp}.stl`);
                    break;
                }
                case 'obj': {
                    const { OBJExporter } = await import('three-stdlib');
                    const exporter = new OBJExporter();
                    const result = exporter.parse(exportGroupRef.current);
                    downloadBlob(new Blob([result], { type: 'text/plain' }), `city-export-${timestamp}.obj`);
                    break;
                }
                case 'glb': {
                    const { GLTFExporter } = await import('three-stdlib');
                    const exporter = new GLTFExporter();
                    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
                        exporter.parse(
                            exportGroupRef.current!,
                            (gltf) => resolve(gltf as ArrayBuffer),
                            reject,
                            { binary: true }
                        );
                    });
                    downloadBlob(new Blob([result], { type: 'application/octet-stream' }), `city-export-${timestamp}.glb`);
                    break;
                }
                case 'ply': {
                    const { PLYExporter } = await import('three-stdlib');
                    const exporter = new PLYExporter();
                    const result = await new Promise<string>((resolve) => {
                        exporter.parse(
                            exportGroupRef.current!,
                            (ply) => resolve(ply as string),
                            {}
                        );
                    });
                    downloadBlob(new Blob([result], { type: 'text/plain' }), `city-export-${timestamp}.ply`);
                    break;
                }
            }
        } catch (e) {
            console.error("Export failed", e);
            alert(t('exportFailed'));
        }
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const formats: { value: ExportFormat; label: string }[] = [
        { value: 'stl', label: '.STL' },
        { value: 'obj', label: '.OBJ' },
        { value: 'glb', label: '.GLTF (GLB)' },
        { value: 'ply', label: '.PLY' },
    ];

    return (
        <div className="relative w-full h-full" style={{ backgroundColor: 'var(--color-canvas-bg)' }}>
            <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start pointer-events-none">
                <button
                    onClick={onBack}
                    className="pointer-events-auto backdrop-blur px-4 py-3 rounded-lg shadow-xl border flex items-center gap-2 transition-transform hover:scale-105"
                    style={{
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                    }}
                >
                    <ArrowLeft size={20} />
                    <span className="font-semibold">{t('backToMap')}</span>
                </button>

                <div className="pointer-events-auto backdrop-blur p-5 rounded-xl shadow-2xl border w-64"
                    style={{
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                    }}>
                    <div className="flex items-center gap-2 mb-4 border-b pb-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                        <Settings size={18} />
                        <h3 className="font-bold uppercase tracking-wider text-sm">{t('printSettings')}</h3>
                    </div>

                    <div className="space-y-4">
                        {/* Water Level */}
                        <div>
                            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                <span>{t('waterLevel')}</span>
                                <span>{baseHeight}mm</span>
                            </div>
                            <input
                                type="range" min="1" max="20" step="0.5"
                                value={baseHeight}
                                onChange={(e) => setBaseHeight(parseFloat(e.target.value))}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                style={{ backgroundColor: 'var(--color-surface)' }}
                            />
                        </div>

                        {/* Road Height */}
                        <div>
                            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                <span>{t('roadHeight')}</span>
                                <span>{groundThickness}mm</span>
                            </div>
                            <input
                                type="range" min="0.2" max="5" step="0.1"
                                value={groundThickness}
                                onChange={(e) => setGroundThickness(parseFloat(e.target.value))}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                style={{ backgroundColor: 'var(--color-surface)' }}
                            />
                        </div>

                        {/* Building Scale */}
                        <div>
                            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                <span>{t('buildingScale')}</span>
                                <span>{heightScale}x</span>
                            </div>
                            <input
                                type="range" min="0.5" max="10" step="0.1"
                                value={heightScale}
                                onChange={(e) => setHeightScale(parseFloat(e.target.value))}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                style={{ backgroundColor: 'var(--color-surface)' }}
                            />
                        </div>

                        {/* Export Format Selector */}
                        <div>
                            <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                {t('exportFormat')}
                            </div>
                            <select
                                value={exportFormat}
                                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                                className="w-full px-3 py-2 rounded-lg border text-sm cursor-pointer outline-none"
                                style={{
                                    backgroundColor: 'var(--color-surface)',
                                    borderColor: 'var(--color-border)',
                                    color: 'var(--color-text)'
                                }}
                            >
                                {formats.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleDownload}
                            className="w-full text-white font-bold py-3 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: `linear-gradient(to right, var(--color-primary-gradient-from), var(--color-primary-gradient-to))`
                            }}
                        >
                            <Download size={20} />
                            {t('download')} {formats.find(f => f.value === exportFormat)?.label}
                        </button>
                    </div>
                </div>
            </div>

            <PreviewCanvas
                buildingGeos={buildingGeos}
                roadGeos={roadGeos}
                baseGeo={baseGeo}
                heightScale={heightScale}
                baseHeight={baseHeight}
                groundThickness={groundThickness}
                groupRef={exportGroupRef as React.RefObject<THREE.Group>}
            />
        </div>
    );
}
