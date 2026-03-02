import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { Scaling, Square, Circle as CircleIcon } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export type ShapeType = 'rectangle' | 'circle' | 'ellipse';

const TILE_PROVIDERS: Record<string, { url: string; attribution: string; maxZoom: number }> = {
    'osm': {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap Contributors',
        maxZoom: 19,
    },
    'carto-light': {
        url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attribution: '&copy; CartoDB &copy; OSM Contributors',
        maxZoom: 20,
    },
    'carto-dark': {
        url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        attribution: '&copy; CartoDB &copy; OSM Contributors',
        maxZoom: 20,
    },
    'stamen-toner': {
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png',
        attribution: '&copy; Stadia Maps &copy; Stamen Design &copy; OSM',
        maxZoom: 20,
    },
    'stamen-watercolor': {
        url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
        attribution: '&copy; Stadia Maps &copy; Stamen Design &copy; OSM',
        maxZoom: 18,
    },
    'osm-bright': {
        url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png',
        attribution: '&copy; Stadia Maps &copy; OSM Contributors',
        maxZoom: 20,
    },
    'topo': {
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenTopoMap &copy; OSM Contributors',
        maxZoom: 17,
    },
};

interface MapSelectorProps {
    onBoundsChange: (bounds: maplibregl.LngLatBounds | null) => void;
    onMaskChange: (mask: any) => void;
    viewState: { center: [number, number]; zoom: number; pitch: number; bearing: number };
    onViewStateChange: (newState: { center: [number, number]; zoom: number; pitch: number; bearing: number }) => void;
    tileProvider: string;
    shapeType: ShapeType;
    onShapeTypeChange: (s: ShapeType) => void;
    boxSize: { width: number; height: number };
    onBoxSizeChange: (s: { width: number; height: number }) => void;
    rectangleRotation: number;
    onRectangleRotationChange: (r: number) => void;
    circleRadius: number;
    onCircleRadiusChange: (r: number) => void;
    ellipseRadiusX: number;
    onEllipseRadiusXChange: (r: number) => void;
    ellipseRadiusY: number;
    onEllipseRadiusYChange: (r: number) => void;
    ellipseRotation: number;
    onEllipseRotationChange: (r: number) => void;
}

function generateRectPolygon(
    map: maplibregl.Map, containerCenter: [number, number],
    halfW: number, halfH: number, rotation: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
    const rotRad = (rotation * Math.PI) / 180;
    const corners: [number, number][] = [
        [-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH], [-halfW, -halfH]
    ];
    const coords: [number, number][] = corners.reverse().map(([px, py]) => {
        const rx = px * Math.cos(rotRad) - py * Math.sin(rotRad);
        const ry = px * Math.sin(rotRad) + py * Math.cos(rotRad);
        const lngLat = map.unproject([containerCenter[0] + rx, containerCenter[1] + ry]);
        return [lngLat.lng, lngLat.lat];
    });
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

function generateEllipsePolygon(
    map: maplibregl.Map, containerCenter: [number, number],
    radiusX: number, radiusY: number, rotation: number, segments: number = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
    const coords: [number, number][] = [];
    const rotRad = (rotation * Math.PI) / 180;
    for (let i = segments; i >= 0; i--) {
        const angle = (2 * Math.PI * i) / segments;
        const px = radiusX * Math.cos(angle);
        const py = radiusY * Math.sin(angle);
        const rx = px * Math.cos(rotRad) - py * Math.sin(rotRad);
        const ry = px * Math.sin(rotRad) + py * Math.cos(rotRad);
        const lngLat = map.unproject([containerCenter[0] + rx, containerCenter[1] + ry]);
        coords.push([lngLat.lng, lngLat.lat]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export default function MapSelector({
    onBoundsChange, onMaskChange, viewState, onViewStateChange,
    tileProvider,
    shapeType, onShapeTypeChange,
    boxSize, onBoxSizeChange,
    rectangleRotation, onRectangleRotationChange,
    circleRadius, onCircleRadiusChange,
    ellipseRadiusX, onEllipseRadiusXChange,
    ellipseRadiusY, onEllipseRadiusYChange,
    ellipseRotation, onEllipseRotationChange,
}: MapSelectorProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const { t } = useLanguage();

    const [isResizing, setIsResizing] = useState(false);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const updateBoundsRef = useRef<() => void>(() => { });

    useEffect(() => {
        const updateSize = () => {
            if (mapContainer.current) {
                const rect = mapContainer.current.getBoundingClientRect();
                setContainerSize({ width: rect.width, height: rect.height });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        const timer = setTimeout(updateSize, 200);
        return () => { window.removeEventListener('resize', updateSize); clearTimeout(timer); };
    }, []);

    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;

    const updateBoundsFromShape = useCallback(() => {
        if (!map.current || !mapContainer.current) return;
        const rect = mapContainer.current.getBoundingClientRect();
        const mcx = rect.width / 2;
        const mcy = rect.height / 2;
        const halfW = boxSize.width / 2;
        const halfH = boxSize.height / 2;

        if (shapeType === 'rectangle') {
            if (rectangleRotation === 0) {
                const nw = map.current.unproject([mcx - halfW, mcy - halfH]);
                const se = map.current.unproject([mcx + halfW, mcy + halfH]);
                onBoundsChange(new maplibregl.LngLatBounds(
                    new maplibregl.LngLat(nw.lng, se.lat), new maplibregl.LngLat(se.lng, nw.lat)
                ));
                onMaskChange(null);
            } else {
                const mask = generateRectPolygon(map.current, [mcx, mcy], halfW, halfH, rectangleRotation);
                const cosR = Math.abs(Math.cos((rectangleRotation * Math.PI) / 180));
                const sinR = Math.abs(Math.sin((rectangleRotation * Math.PI) / 180));
                const bboxW = halfW * cosR + halfH * sinR;
                const bboxH = halfW * sinR + halfH * cosR;
                const nw = map.current.unproject([mcx - bboxW, mcy - bboxH]);
                const se = map.current.unproject([mcx + bboxW, mcy + bboxH]);
                onBoundsChange(new maplibregl.LngLatBounds(
                    new maplibregl.LngLat(nw.lng, se.lat), new maplibregl.LngLat(se.lng, nw.lat)
                ));
                onMaskChange(mask);
            }
        } else if (shapeType === 'circle') {
            const mask = generateEllipsePolygon(map.current, [mcx, mcy], circleRadius, circleRadius, 0);
            const nw = map.current.unproject([mcx - circleRadius, mcy - circleRadius]);
            const se = map.current.unproject([mcx + circleRadius, mcy + circleRadius]);
            onBoundsChange(new maplibregl.LngLatBounds(
                new maplibregl.LngLat(nw.lng, se.lat), new maplibregl.LngLat(se.lng, nw.lat)
            ));
            onMaskChange(mask);
        } else {
            const cosR = Math.abs(Math.cos((ellipseRotation * Math.PI) / 180));
            const sinR = Math.abs(Math.sin((ellipseRotation * Math.PI) / 180));
            const bboxW = ellipseRadiusX * cosR + ellipseRadiusY * sinR;
            const bboxH = ellipseRadiusX * sinR + ellipseRadiusY * cosR;
            const mask = generateEllipsePolygon(map.current, [mcx, mcy], ellipseRadiusX, ellipseRadiusY, ellipseRotation);
            const nw = map.current.unproject([mcx - bboxW, mcy - bboxH]);
            const se = map.current.unproject([mcx + bboxW, mcy + bboxH]);
            onBoundsChange(new maplibregl.LngLatBounds(
                new maplibregl.LngLat(nw.lng, se.lat), new maplibregl.LngLat(se.lng, nw.lat)
            ));
            onMaskChange(mask);
        }
    }, [shapeType, boxSize, rectangleRotation, circleRadius, ellipseRadiusX, ellipseRadiusY, ellipseRotation, onBoundsChange, onMaskChange]);

    useEffect(() => { updateBoundsRef.current = updateBoundsFromShape; }, [updateBoundsFromShape]);

    // Switch tile provider without destroying the map
    useEffect(() => {
        if (!map.current) return;
        const m = map.current;
        const provider = TILE_PROVIDERS[tileProvider] || TILE_PROVIDERS['osm'];
        const source = m.getSource('osm') as maplibregl.RasterTileSource | undefined;
        if (source) {
            // MapLibre doesn't have setTiles directly on the source object easily.
            // Safest way: remove and re-add the source and layer.
            if (m.getLayer('osm-tiles')) m.removeLayer('osm-tiles');
            m.removeSource('osm');
            m.addSource('osm', {
                type: 'raster',
                tiles: [provider.url],
                tileSize: 256,
                attribution: provider.attribution,
                maxzoom: provider.maxZoom,
            });
            m.addLayer({
                id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: provider.maxZoom,
            }, m.getLayer('background') ? undefined : undefined);
        }
    }, [tileProvider]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !mapContainer.current) return;
            const mapRect = mapContainer.current.getBoundingClientRect();
            const centerX = mapRect.left + mapRect.width / 2;
            const centerY = mapRect.top + mapRect.height / 2;
            if (shapeType === 'rectangle') {
                onBoxSizeChange({ width: Math.max(50, Math.abs(e.clientX - centerX) * 2), height: Math.max(50, Math.abs(e.clientY - centerY) * 2) });
            } else if (shapeType === 'circle') {
                onCircleRadiusChange(Math.max(30, Math.sqrt((e.clientX - centerX) ** 2 + (e.clientY - centerY) ** 2)));
            } else {
                onEllipseRadiusXChange(Math.max(30, Math.abs(e.clientX - centerX)));
                onEllipseRadiusYChange(Math.max(30, Math.abs(e.clientY - centerY)));
            }
        };
        const handleMouseUp = () => { if (isResizing) { setIsResizing(false); updateBoundsRef.current(); } };
        if (isResizing) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
        return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }, [isResizing, shapeType, onBoxSizeChange, onCircleRadiusChange, onEllipseRadiusXChange, onEllipseRadiusYChange]);

    useEffect(() => {
        if (map.current || !mapContainer.current) return;
        const provider = TILE_PROVIDERS[tileProvider] || TILE_PROVIDERS['osm'];
        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: { 'osm': { type: 'raster', tiles: [provider.url], tileSize: 256, attribution: provider.attribution, maxzoom: provider.maxZoom } },
                layers: [
                    { id: 'background', type: 'background', paint: { 'background-color': '#f0f0f0' } },
                    { id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: provider.maxZoom }
                ]
            },
            center: viewState.center, zoom: viewState.zoom, pitch: viewState.pitch, bearing: viewState.bearing,
            dragRotate: true, touchZoomRotate: true
        });
        map.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right');
        map.current.on('move', () => updateBoundsRef.current());
        map.current.on('moveend', () => {
            updateBoundsRef.current();
            if (map.current) {
                const c = map.current.getCenter();
                onViewStateChange({ center: [c.lng, c.lat], zoom: map.current.getZoom(), pitch: map.current.getPitch(), bearing: map.current.getBearing() });
            }
        });
        map.current.on('load', () => {
            if (mapContainer.current) { const r = mapContainer.current.getBoundingClientRect(); setContainerSize({ width: r.width, height: r.height }); }
            updateBoundsRef.current();
        });
        return () => { map.current?.remove(); map.current = null; };
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => updateBoundsRef.current(), 50);
        return () => clearTimeout(timer);
    }, [shapeType, boxSize, rectangleRotation, circleRadius, ellipseRadiusX, ellipseRadiusY, ellipseRotation]);

    useEffect(() => { const timer = setTimeout(() => updateBoundsRef.current(), 500); return () => clearTimeout(timer); }, []);

    const shapes: { type: ShapeType; label: string }[] = [
        { type: 'rectangle', label: t('rectangle') },
        { type: 'circle', label: t('circle') },
        { type: 'ellipse', label: t('ellipse') },
    ];
    const shapeIcons: Record<ShapeType, typeof Square> = { rectangle: Square, circle: CircleIcon, ellipse: CircleIcon };
    const currentRotation = shapeType === 'rectangle' ? rectangleRotation : shapeType === 'ellipse' ? ellipseRotation : -1;
    const showAngleSlider = shapeType === 'rectangle' || shapeType === 'ellipse';

    return (
        <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
            <div ref={mapContainer} className="absolute inset-0 z-0" />

            <div className="absolute top-4 left-4 z-20 pointer-events-none">
                <div className="backdrop-blur text-xs px-3 py-2 rounded shadow-lg border"
                    style={{ backgroundColor: 'var(--color-hint-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    <p className="font-bold mb-1">{t('howToUse')}</p>
                    <ul className="list-disc list-inside opacity-90">
                        <li>{t('howToUseHint1')}</li>
                        <li>{t('howToUseHint2')}</li>
                    </ul>
                </div>
            </div>

            {containerSize.width > 0 && (<>
                {shapeType === 'rectangle' && (
                    <div className="absolute inset-0 pointer-events-none z-10">
                        {rectangleRotation === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="relative border-4 border-red-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-all"
                                    style={{ width: `${boxSize.width}px`, height: `${boxSize.height}px` }}>
                                    <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded shadow pointer-events-none">{t('exportArea')}</div>
                                    <div className="absolute bottom-[-10px] right-[-10px] w-8 h-8 bg-white border-2 border-red-600 rounded-full shadow-lg cursor-se-resize pointer-events-auto flex items-center justify-center hover:scale-110 transition-transform z-50"
                                        onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}>
                                        <Scaling size={14} className="text-red-600" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <svg width={containerSize.width} height={containerSize.height} style={{ position: 'absolute', top: 0, left: 0 }}>
                                    <defs><mask id="rmask">
                                        <rect x="0" y="0" width={containerSize.width} height={containerSize.height} fill="white" />
                                        <rect x={cx - boxSize.width / 2} y={cy - boxSize.height / 2} width={boxSize.width} height={boxSize.height}
                                            fill="black" transform={`rotate(${rectangleRotation} ${cx} ${cy})`} />
                                    </mask></defs>
                                    <rect x="0" y="0" width={containerSize.width} height={containerSize.height} fill="rgba(0,0,0,0.5)" mask="url(#rmask)" />
                                    <rect x={cx - boxSize.width / 2} y={cy - boxSize.height / 2} width={boxSize.width} height={boxSize.height}
                                        fill="none" stroke="#ef4444" strokeWidth="4" transform={`rotate(${rectangleRotation} ${cx} ${cy})`} />
                                </svg>
                                <div className="absolute bg-red-600 text-white text-xs px-2 py-0.5 rounded shadow pointer-events-none"
                                    style={{ left: cx - boxSize.width / 2 + 10, top: cy - boxSize.height / 2 + 10 }}>{t('exportArea')}</div>
                                <div className="absolute w-8 h-8 bg-white border-2 border-red-600 rounded-full shadow-lg cursor-se-resize pointer-events-auto flex items-center justify-center hover:scale-110 transition-transform z-50"
                                    style={{ left: cx + boxSize.width / 2 - 16, top: cy + boxSize.height / 2 - 16 }}
                                    onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}>
                                    <Scaling size={14} className="text-red-600" />
                                </div>
                            </>
                        )}
                    </div>
                )}
                {shapeType === 'circle' && (
                    <div className="absolute inset-0 pointer-events-none z-10" style={{ width: containerSize.width, height: containerSize.height }}>
                        <svg width={containerSize.width} height={containerSize.height} style={{ position: 'absolute', top: 0, left: 0 }}>
                            <defs><mask id="cmask">
                                <rect x="0" y="0" width={containerSize.width} height={containerSize.height} fill="white" />
                                <circle cx={cx} cy={cy} r={circleRadius} fill="black" />
                            </mask></defs>
                            <rect x="0" y="0" width={containerSize.width} height={containerSize.height} fill="rgba(0,0,0,0.5)" mask="url(#cmask)" />
                            <circle cx={cx} cy={cy} r={circleRadius} fill="none" stroke="#ef4444" strokeWidth="4" />
                        </svg>
                        <div className="absolute bg-red-600 text-white text-xs px-2 py-0.5 rounded shadow pointer-events-none"
                            style={{ left: cx - circleRadius + 10, top: cy - circleRadius + 10 }}>{t('exportArea')}</div>
                        <div className="absolute w-8 h-8 bg-white border-2 border-red-600 rounded-full shadow-lg cursor-se-resize pointer-events-auto flex items-center justify-center hover:scale-110 transition-transform z-50"
                            style={{ left: cx + circleRadius * 0.707 - 16, top: cy + circleRadius * 0.707 - 16 }}
                            onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}>
                            <Scaling size={14} className="text-red-600" />
                        </div>
                    </div>
                )}
                {shapeType === 'ellipse' && (
                    <div className="absolute inset-0 pointer-events-none z-10" style={{ width: containerSize.width, height: containerSize.height }}>
                        <svg width={containerSize.width} height={containerSize.height} style={{ position: 'absolute', top: 0, left: 0 }}>
                            <defs><mask id="emask">
                                <rect x="0" y="0" width={containerSize.width} height={containerSize.height} fill="white" />
                                <ellipse cx={cx} cy={cy} rx={ellipseRadiusX} ry={ellipseRadiusY}
                                    fill="black" transform={`rotate(${ellipseRotation} ${cx} ${cy})`} />
                            </mask></defs>
                            <rect x="0" y="0" width={containerSize.width} height={containerSize.height} fill="rgba(0,0,0,0.5)" mask="url(#emask)" />
                            <ellipse cx={cx} cy={cy} rx={ellipseRadiusX} ry={ellipseRadiusY}
                                fill="none" stroke="#ef4444" strokeWidth="4" transform={`rotate(${ellipseRotation} ${cx} ${cy})`} />
                        </svg>
                        <div className="absolute bg-red-600 text-white text-xs px-2 py-0.5 rounded shadow pointer-events-none"
                            style={{ left: cx - ellipseRadiusX + 10, top: cy - ellipseRadiusY + 10 }}>{t('exportArea')}</div>
                        <div className="absolute w-8 h-8 bg-white border-2 border-red-600 rounded-full shadow-lg cursor-se-resize pointer-events-auto flex items-center justify-center hover:scale-110 transition-transform z-50"
                            style={{ left: cx + ellipseRadiusX - 16, top: cy + ellipseRadiusY - 16 }}
                            onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}>
                            <Scaling size={14} className="text-red-600" />
                        </div>
                    </div>
                )}
            </>)}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden shadow-lg border"
                    style={{ backgroundColor: 'var(--color-sidebar)', borderColor: 'var(--color-border)' }}>
                    {shapes.map(s => {
                        const Icon = shapeIcons[s.type];
                        const active = shapeType === s.type;
                        return (
                            <button key={s.type} onClick={() => onShapeTypeChange(s.type)}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all pointer-events-auto"
                                style={{ backgroundColor: active ? 'var(--color-primary)' : 'transparent', color: active ? '#fff' : 'var(--color-text-secondary)' }}
                                title={s.label}>
                                <Icon size={14} /><span>{s.label}</span>
                            </button>
                        );
                    })}
                </div>
                {showAngleSlider && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border text-xs pointer-events-auto"
                        style={{ backgroundColor: 'var(--color-sidebar)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{t('angle')}: {currentRotation}°</span>
                        <input type="range" min="0" max="180" step="1" value={currentRotation}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (shapeType === 'rectangle') onRectangleRotationChange(val);
                                else onEllipseRotationChange(val);
                            }}
                            className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
                            style={{ backgroundColor: 'var(--color-surface)' }} />
                    </div>
                )}
            </div>
        </div>
    );
}
