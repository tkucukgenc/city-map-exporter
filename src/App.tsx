import { useState } from 'react';
import MapSelector, { type ShapeType } from './components/MapSelector';
import SceneProcessor from './components/SceneProcessor';
import { LngLatBounds } from 'maplibre-gl';
import { Download, Map as MapIcon, Loader2, Github } from 'lucide-react';
import { useLanguage } from './context/LanguageContext';
import { useTheme } from './context/ThemeContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import ThemeToggle from './components/ThemeToggle';

function App() {
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [mask, setMask] = useState<any>(null);
  const [mode, setMode] = useState<'map' | 'preview'>('map');
  const [tileProvider, setTileProvider] = useState('osm');
  const { t } = useLanguage();
  const { isDark } = useTheme();

  const [viewState, setViewState] = useState({
    center: [28.9784, 41.0082] as [number, number],
    zoom: 15,
    pitch: 0,
    bearing: 0
  });

  // Shape state — lifted here so it persists across map<->preview switches
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
  const [boxSize, setBoxSize] = useState({ width: 300, height: 300 });
  const [rectangleRotation, setRectangleRotation] = useState(0);
  const [circleRadius, setCircleRadius] = useState(150);
  const [ellipseRadiusX, setEllipseRadiusX] = useState(200);
  const [ellipseRadiusY, setEllipseRadiusY] = useState(120);
  const [ellipseRotation, setEllipseRotation] = useState(0);

  const handleExport = () => {
    if (!bounds) return;
    setMode('preview');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 flex flex-col z-20 shadow-xl border-r"
        style={{
          backgroundColor: 'var(--color-sidebar)',
          borderColor: 'var(--color-border)'
        }}>
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo" className="w-9 h-9" style={{ filter: isDark ? 'invert(1)' : 'none' }} />
              <h1 className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
                {t('appTitle')}
              </h1>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 space-y-5 overflow-y-auto">
          <div className="text-xs p-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)'
            }}>
            <p className="mb-2 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              {t('instructions')}:
            </p>
            <div className="space-y-1">
              <p>{t('instruction1')}</p>
              <p>{t('instruction2')}</p>
              <p>{t('instruction3')}</p>
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="p-6 pt-4 space-y-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <LanguageSwitcher />

          {/* Tile provider selector */}
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>{t('mapProvider')}:</span>
            <select
              value={tileProvider}
              onChange={(e) => setTileProvider(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-md border text-xs cursor-pointer"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              <option value="osm">OpenStreetMap</option>
              <option value="carto-light">CartoDB Positron</option>
              <option value="carto-dark">CartoDB Dark Matter</option>
              <option value="stamen-toner">Stamen Toner</option>
              <option value="stamen-watercolor">Stamen Watercolor</option>
              <option value="osm-bright">OSM Bright</option>
              <option value="topo">OpenTopoMap</option>
            </select>
          </div>

          <button
            onClick={handleExport}
            disabled={mode === 'preview'}
            className="w-full py-4 rounded-lg font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all text-white"
            style={{
              backgroundColor: mode === 'preview' ? 'var(--color-surface)' : 'var(--color-primary)',
              opacity: mode === 'preview' ? 0.5 : 1,
              cursor: mode === 'preview' ? 'not-allowed' : 'pointer'
            }}
          >
            {mode === 'preview' ? <Loader2 className="animate-spin" /> : <Download />}
            {mode === 'preview' ? t('processing') : t('generateModel')}
          </button>

          {/* GitHub link */}
          <a
            href="https://github.com/tkucukgenc/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs py-2 rounded-lg transition-all hover:opacity-80"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Github size={14} />
            <span>github.com/tkucukgenc</span>
          </a>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 relative">
        {mode === 'map' ? (
          <>
            <MapSelector
              onBoundsChange={setBounds}
              onMaskChange={setMask}
              viewState={viewState}
              onViewStateChange={setViewState}
              tileProvider={tileProvider}
              shapeType={shapeType}
              onShapeTypeChange={setShapeType}
              boxSize={boxSize}
              onBoxSizeChange={setBoxSize}
              rectangleRotation={rectangleRotation}
              onRectangleRotationChange={setRectangleRotation}
              circleRadius={circleRadius}
              onCircleRadiusChange={setCircleRadius}
              ellipseRadiusX={ellipseRadiusX}
              onEllipseRadiusXChange={setEllipseRadiusX}
              ellipseRadiusY={ellipseRadiusY}
              onEllipseRadiusYChange={setEllipseRadiusY}
              ellipseRotation={ellipseRotation}
              onEllipseRotationChange={setEllipseRotation}
            />
            <div className="absolute top-4 left-4 px-4 py-2 rounded shadow-md backdrop-blur z-10 flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-coord-bg)',
                color: 'var(--color-coord-text)'
              }}>
              <MapIcon className="w-4 h-4 opacity-60" />
              <span className="font-mono text-sm">
                {bounds ?
                  `${bounds.getNorth().toFixed(4)}, ${bounds.getWest().toFixed(4)}` :
                  t('drawArea')}
              </span>
            </div>
          </>
        ) : (
          bounds && <SceneProcessor bounds={bounds} mask={mask} onBack={() => setMode('map')} />
        )}
      </main>
    </div>
  );
}

export default App;
