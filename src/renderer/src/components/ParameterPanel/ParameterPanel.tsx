import { useEffect, useRef, useState } from 'react'
import { Stack, Text, Slider, NumberInput, ColorInput, Switch, Divider, Group, Select, TextInput, Collapse, Checkbox, SegmentedControl, Box, Button, Radio, Tooltip } from '@mantine/core'
import { useStore } from '../../store/useStore'
import { useGlobalStore } from '../../store/useGlobalStore'
import type { FrameBorderStyle, TitleConfig, CompassConfig, FramePosition, RoadType, GridType, GridLinePattern, GridConfig, BuiltinMarkerTypeId, MarkerPrimitiveId, MarkerSymbolDescriptor } from '../../types'
import { TRI_LABELS, TRI_THRESHOLDS, triRangeLabel, BUILTIN_MARKER_SPECS } from '../../types'
import { BUILDING_CATALOG } from '../../data/buildings'
import type { BuildingShape } from '../../data/buildings'

const DASH_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

const LINE_PATTERN_OPTIONS = [
  { value: 'solid',    label: 'Solid' },
  { value: 'dashed',   label: 'Dashed' },
  { value: 'dotted',   label: 'Dotted' },
  { value: 'dot-dash', label: 'Dot-dash' },
]

const FONT_OPTIONS = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'monospace', label: 'Monospace' },
]

const POSITION_OPTIONS: { value: FramePosition; label: string }[] = [
  { value: 'top-left',      label: 'Top — left corner' },
  { value: 'top-center',    label: 'Top — center' },
  { value: 'top-right',     label: 'Top — right corner' },
  { value: 'right-top',     label: 'Right — near top' },
  { value: 'right-middle',  label: 'Right — middle' },
  { value: 'right-bottom',  label: 'Right — near bottom' },
  { value: 'bottom-right',  label: 'Bottom — right corner' },
  { value: 'bottom-center', label: 'Bottom — center' },
  { value: 'bottom-left',   label: 'Bottom — left corner' },
  { value: 'left-bottom',   label: 'Left — near bottom' },
  { value: 'left-middle',   label: 'Left — middle' },
  { value: 'left-top',      label: 'Left — near top' },
]

const UNIT_OPTIONS = [
  { value: 'feet', label: 'Feet (ft)' },
  { value: 'meters', label: 'Meters (m)' },
  { value: 'custom', label: 'Custom…' },
]

// Non-linear shadow depth stops: fine control at low end, coarser at high end
// 0–1: step 0.1 (10 intervals), 1–5: step 0.25 (4 per unit), 5–10: step 0.5 (2 per unit)
const INTENSITY_STOPS: number[] = [
  ...Array.from({ length: 11 }, (_, i) => parseFloat((i * 0.1).toFixed(1))),   // 0.0–1.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((1.25 + i * 0.25).toFixed(2))), // 1.25–2.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((2.25 + i * 0.25).toFixed(2))), // 2.25–3.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((3.25 + i * 0.25).toFixed(2))), // 3.25–4.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((4.25 + i * 0.25).toFixed(2))), // 4.25–5.0
  ...Array.from({ length: 10 }, (_, i) => parseFloat((5.5  + i * 0.5 ).toFixed(1))), // 5.5–10.0
]

function intensityToIndex(v: number): number {
  return INTENSITY_STOPS.reduce((best, val, i) =>
    Math.abs(val - v) < Math.abs(INTENSITY_STOPS[best] - v) ? i : best, 0)
}

function formatIntensity(v: number): string {
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(v < 1 ? 1 : 2)}×`
}

// Subtle dashed style for read-only informational fields
const roStyle = {
  input: {
    borderStyle: 'dashed' as const,
    cursor: 'default' as const,
    opacity: 0.65,
  },
}

// Highlighted border for editable fields so they're visually distinct at rest
const activeStyle = {
  input: {
    borderColor: 'var(--mantine-color-blue-5)',
  },
}

function buildingPreviewPath(shape: BuildingShape, cx: number, cy: number, w: number, d: number): string {
  const hw = w / 2, hd = d / 2
  switch (shape) {
    case 'rectangle': return `M ${cx-hw},${cy-hd} L ${cx+hw},${cy-hd} L ${cx+hw},${cy+hd} L ${cx-hw},${cy+hd} Z`
    case 'circle': return `M ${cx-hw},${cy} A ${hw},${hd} 0 1,0 ${cx+hw},${cy} A ${hw},${hd} 0 1,0 ${cx-hw},${cy} Z`
    case 'bow-sided': { const bow = hw * 1.14; return `M ${cx-hw},${cy-hd} Q ${cx-bow},${cy} ${cx-hw},${cy+hd} L ${cx+hw},${cy+hd} Q ${cx+bow},${cy} ${cx+hw},${cy-hd} Z` }
    case 'apsidal': return `M ${cx-hw},${cy+hd} L ${cx+hw},${cy+hd} L ${cx+hw},${cy-hd+hw} A ${hw},${hw} 0 0,0 ${cx-hw},${cy-hd+hw} Z`
    case 'courtyard': { const iw2 = w * 0.3, id2 = d * 0.3; return `M ${cx-hw},${cy-hd} L ${cx+hw},${cy-hd} L ${cx+hw},${cy+hd} L ${cx-hw},${cy+hd} Z M ${cx-iw2},${cy-id2} L ${cx-iw2},${cy+id2} L ${cx+iw2},${cy+id2} L ${cx+iw2},${cy-id2} Z` }
    case 'L-shape': return `M ${cx-hw},${cy-hd} L ${cx},${cy-hd} L ${cx},${cy} L ${cx+hw},${cy} L ${cx+hw},${cy+hd} L ${cx-hw},${cy+hd} Z`
    case 'U-shape': { const nw = hw * 0.5; return `M ${cx-hw},${cy-hd} L ${cx+hw},${cy-hd} L ${cx+hw},${cy+hd} L ${cx+nw},${cy+hd} L ${cx+nw},${cy} L ${cx-nw},${cy} L ${cx-nw},${cy+hd} L ${cx-hw},${cy+hd} Z` }
    case 'octagon': { const cut = 0.2929, xc = hw*cut, yc = hd*cut; return `M ${cx-hw},${cy-hd+yc} L ${cx-hw+xc},${cy-hd} L ${cx+hw-xc},${cy-hd} L ${cx+hw},${cy-hd+yc} L ${cx+hw},${cy+hd-yc} L ${cx+hw-xc},${cy+hd} L ${cx-hw+xc},${cy+hd} L ${cx-hw},${cy+hd-yc} Z` }
  }
}

export function ParameterPanel(): JSX.Element {
  const {
    parameters, style, hillshadeParams, elevationCalibration, heightmap,
    updateParameters, updateStyle, updateHillshadeParams,
    updateElevationCalibration, setElevationUnits, finalizeCustomConversion,
  } = useStore()

  const activeTab = useStore((s) => s.activeTab)
  const hillshadeDisabled = activeTab !== 'hillshade'
  const frame = useStore((s) => s.frame)
  const updateFrame = useStore((s) => s.updateFrame)
  const title = useStore((s) => s.title)
  const updateTitle = useStore((s) => s.updateTitle)
  const compass = useStore((s) => s.compass)
  const updateCompass = useStore((s) => s.updateCompass)
  const legend = useStore((s) => s.legend)
  const updateLegend = useStore((s) => s.updateLegend)
  const measureBar = useStore((s) => s.measureBar)
  const updateMeasureBar = useStore((s) => s.updateMeasureBar)
  const elevationFlags = useStore((s) => s.elevationFlags)
  const slopeArrows = useStore((s) => s.slopeArrows)
  const ruggednessFlags = useStore((s) => s.ruggednessFlags)
  const swampMarkers = useStore((s) => s.swampMarkers)
  const ruggednessColorBySeverity = useStore((s) => s.ruggednessColorBySeverity)
  const setRuggednessColorBySeverity = useStore((s) => s.setRuggednessColorBySeverity)
  const elevationFlagDefaults = useStore((s) => s.elevationFlagDefaults)
  const updateElevationFlagDefaults = useStore((s) => s.updateElevationFlagDefaults)
  const slopeArrowDefaults = useStore((s) => s.slopeArrowDefaults)
  const updateSlopeArrowDefaults = useStore((s) => s.updateSlopeArrowDefaults)
  const ruggednessFlagDefaults = useStore((s) => s.ruggednessFlagDefaults)
  const updateRuggednessFlagDefaults = useStore((s) => s.updateRuggednessFlagDefaults)
  const swampMarkerDefaults = useStore((s) => s.swampMarkerDefaults)
  const updateSwampMarkerDefaults = useStore((s) => s.updateSwampMarkerDefaults)
  const elevationFlagsVisible = useStore((s) => s.elevationFlagsVisible)
  const setElevationFlagsVisible = useStore((s) => s.setElevationFlagsVisible)
  const slopeArrowsVisible = useStore((s) => s.slopeArrowsVisible)
  const setSlopeArrowsVisible = useStore((s) => s.setSlopeArrowsVisible)
  const ruggednessFlagsVisible = useStore((s) => s.ruggednessFlagsVisible)
  const setRuggednessFlagsVisible = useStore((s) => s.setRuggednessFlagsVisible)
  const swampMarkersVisible = useStore((s) => s.swampMarkersVisible)
  const setSwampMarkersVisible = useStore((s) => s.setSwampMarkersVisible)
  const ruggednessSeverityColors = useStore((s) => s.ruggednessSeverityColors)
  const setRuggednessSeverityColor = useStore((s) => s.setRuggednessSeverityColor)
  const roads = useStore((s) => s.roads)
  const roadsVisible = useStore((s) => s.roadsVisible)
  const setRoadsVisible = useStore((s) => s.setRoadsVisible)
  const roadDefaults = useStore((s) => s.roadDefaults)
  const updateRoadDefaults = useStore((s) => s.updateRoadDefaults)
  const updateRoad = useStore((s) => s.updateRoad)
  const removeRoad = useStore((s) => s.removeRoad)
  const selectedRoadId = useStore((s) => s.selectedRoadId)
  const setSelectedRoadId = useStore((s) => s.setSelectedRoadId)
  const overlayOnly = useStore((s) => s.overlayOnly)
  const setOverlayOnly = useStore((s) => s.setOverlayOnly)
  const overlayBrightness = useStore((s) => s.overlayBrightness)
  const setOverlayBrightness = useStore((s) => s.setOverlayBrightness)
  const grid = useStore((s) => s.grid)
  const updateGrid = useStore((s) => s.updateGrid)
  const buildings = useStore((s) => s.buildings)
  const buildingsVisible = useStore((s) => s.buildingsVisible)
  const setBuildingsVisible = useStore((s) => s.setBuildingsVisible)
  const buildingDefaults = useStore((s) => s.buildingDefaults)
  const updateBuildingDefaults = useStore((s) => s.updateBuildingDefaults)
  const pois = useStore((s) => s.pois)
  const poisVisible = useStore((s) => s.poisVisible)
  const setPoisVisible = useStore((s) => s.setPoisVisible)
  const poiNewMarker = useStore((s) => s.poiNewMarker)
  const updatePoiNewMarker = useStore((s) => s.updatePoiNewMarker)
  const updatePoi = useStore((s) => s.updatePoi)
  const removePoi = useStore((s) => s.removePoi)
  const selectedPoiId = useStore((s) => s.selectedPoiId)
  const setSelectedPoiId = useStore((s) => s.setSelectedPoiId)
  const customMarkerDefs = useGlobalStore((s) => s.customMarkerDefs)
  const addCustomMarkerDef = useGlobalStore((s) => s.addCustomMarkerDef)
  const removeCustomMarkerDef = useGlobalStore((s) => s.removeCustomMarkerDef)

  const { unitType, customName, customAbbr, customBase, customRatio, realMin, realMax, realInterval, mapWidth } = elevationCalibration

  const abbr = unitType === 'feet' ? 'ft'
    : unitType === 'meters' ? 'm'
    : unitType === 'custom' ? (customAbbr || '?')
    : ''

  const calReady = (unitType === 'feet' || unitType === 'meters'
    || (unitType === 'custom' && !!customAbbr && customRatio > 0))
    && realMin !== null && realMax !== null && realMax !== realMin

  const correctZFactor = calReady && mapWidth && mapWidth > 0 && heightmap
    ? Math.abs(realMax! - realMin!) / (mapWidth / heightmap.width)
    : null
  const hasGroundResolution = correctZFactor !== null

  // Sea level is only applicable when calibration spans real-world 0 (min < 0 < max)
  const seaLevelApplicable = calReady && realMin !== null && realMax !== null
    && realMin < 0 && realMax > 0

  // TextInput local state — avoids Mantine NumberInput controlled-mode quirks
  const [intervalStr, setIntervalStr] = useState<string>(
    realInterval !== null ? String(realInterval) : ''
  )
  const [hillshadeOpen, setHillshadeOpen] = useState(true)
  const [contoursOpen, setContoursOpen] = useState(true)
  const [styleOpen, setStyleOpen] = useState(true)
  const [labelStylingOpen, setLabelStylingOpen] = useState(true)
  const [seaLevelOpen, setSeaLevelOpen] = useState(true)
  const [markersOpen, setMarkersOpen] = useState(true)
  const [roadsOpen, setRoadsOpen] = useState(true)
  const [buildingsOpen, setBuildingsOpen] = useState(true)
  const [gridsOpen, setGridsOpen] = useState(true)
  const [framingOpen, setFramingOpen] = useState(true)

  const [createCustomOpen, setCreateCustomOpen] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [newCustomSymbolKind, setNewCustomSymbolKind] = useState<'builtin' | 'primitive' | 'unicode'>('primitive')
  const [newCustomBuiltinId, setNewCustomBuiltinId] = useState<BuiltinMarkerTypeId>('mine')
  const [newCustomPrimitiveId, setNewCustomPrimitiveId] = useState<MarkerPrimitiveId>('cross-plus')
  const [newCustomUnicodeChars, setNewCustomUnicodeChars] = useState('')
  const [newCustomColor, setNewCustomColor] = useState('#555555')
  const [newCustomSizeM, setNewCustomSizeM] = useState(10)
  const [newCustomStrokeWeight, setNewCustomStrokeWeight] = useState(1.5)

  const allOpen = hillshadeOpen && contoursOpen && styleOpen && labelStylingOpen && seaLevelOpen && markersOpen && roadsOpen && buildingsOpen && gridsOpen && framingOpen
  const toggleAll = () => {
    const next = !allOpen
    setHillshadeOpen(next); setContoursOpen(next); setStyleOpen(next)
    setLabelStylingOpen(next); setSeaLevelOpen(next); setMarkersOpen(next); setRoadsOpen(next); setBuildingsOpen(next); setGridsOpen(next); setFramingOpen(next)
  }

  const poiUnitLabel = abbr || 'm'

  // Refs for latest values — safe to read inside event handlers and effects
  const normIntervalRef = useRef(parameters.interval)
  normIntervalRef.current = parameters.interval
  const normMinRef = useRef(parameters.minElevation)
  normMinRef.current = parameters.minElevation
  const normMaxRef = useRef(parameters.maxElevation)
  normMaxRef.current = parameters.maxElevation
  const realMinRef = useRef(realMin)
  realMinRef.current = realMin
  const realMaxRef = useRef(realMax)
  realMaxRef.current = realMax
  const realIntervalRef = useRef(realInterval)
  realIntervalRef.current = realInterval

  // Sync store → local string whenever realInterval changes from outside
  useEffect(() => {
    setIntervalStr(realInterval !== null ? String(realInterval) : '')
  }, [realInterval])

  // Correct formula: realInterval = normalizedInterval × realWorldSpan / normalizedSpan
  const computeAutoInterval = (): number | null => {
    const rMin = realMinRef.current
    const rMax = realMaxRef.current
    if (rMin === null || rMax === null) return null
    const realSpan = Math.abs(rMax - rMin)
    const normSpan = normMaxRef.current - normMinRef.current
    if (realSpan === 0 || normSpan === 0) return null
    return Math.max(1, Math.round(normIntervalRef.current * realSpan / normSpan))
  }

  // Auto-compute fires on blur of Min/Max fields (not on every keystroke)
  const handleMinMaxBlur = () => {
    if (realIntervalRef.current === null) {
      const auto = computeAutoInterval()
      if (auto !== null) updateElevationCalibration({ realInterval: auto })
    }
  }

  const handleIntervalInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.currentTarget.value.replace(/\D/g, '')   // digits only
    setIntervalStr(raw)
    if (!calReady) return
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed >= 1) {
      const rMin = realMinRef.current ?? 0
      const rMax = realMaxRef.current ?? 0
      const realSpan = Math.abs(rMax - rMin)
      const normSpan = normMaxRef.current - normMinRef.current
      if (realSpan === 0 || normSpan === 0) return
      updateElevationCalibration({ realInterval: parsed })
      // Reverse formula: normalizedInterval = realInterval × normalizedSpan / realWorldSpan
      updateParameters({ interval: parsed * normSpan / realSpan })
    } else if (raw === '') {
      updateElevationCalibration({ realInterval: null })
    }
  }

  const handleRealMinChange = (v: number | string) => {
    const num = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(num)) updateElevationCalibration({ realMin: num })
  }

  const handleRealMaxChange = (v: number | string) => {
    const num = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(num)) updateElevationCalibration({ realMax: num })
  }

  return (
    <Stack gap="md">

      <Group justify="flex-end">
        <Button size="compact-xs" variant="subtle" c="dimmed" onClick={toggleAll}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </Button>
      </Group>

      {!!heightmap && (
        <>
          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setHillshadeOpen((o) => !o)}>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
                Hillshade
              </Text>
              <Switch
                size="xs"
                label="Overlay only"
                checked={overlayOnly}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setOverlayOnly(e.currentTarget.checked)}
              />
            </Group>
            <Text size="lg" c="dimmed">{hillshadeOpen ? '▾' : '▸'}</Text>
          </Group>

          <Collapse in={hillshadeOpen}>
          <Stack gap="md">
          <Stack gap={4}>
            <Text size="xs" fw={500}>Sun Azimuth</Text>
            <Slider
              min={0}
              max={360}
              step={5}
              value={hillshadeParams.azimuth}
              onChange={(v) => updateHillshadeParams({ azimuth: v })}
              label={(v) => `${v}°`}
              disabled={hillshadeDisabled || overlayOnly}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Sun Altitude</Text>
            <Slider
              min={5}
              max={85}
              step={5}
              value={hillshadeParams.altitude}
              onChange={(v) => updateHillshadeParams({ altitude: v })}
              label={(v) => `${v}°`}
              disabled={hillshadeDisabled || overlayOnly}
            />
          </Stack>

          {hasGroundResolution ? (
            <>
              <Stack gap={4}>
                <Text size="xs" fw={500}>Vertical Exaggeration</Text>
                <Slider
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={hillshadeParams.verticalExaggeration}
                  onChange={(v) => updateHillshadeParams({ verticalExaggeration: v })}
                  label={(v) => `${v.toFixed(1)}×`}
                  disabled={hillshadeDisabled || overlayOnly}
                />
              </Stack>
              <NumberInput
                label="Actual Z Factor"
                description="Correct Z × Exaggeration"
                size="xs"
                value={Math.round(correctZFactor! * hillshadeParams.verticalExaggeration)}
                disabled
                styles={roStyle}
              />
            </>
          ) : (
            <Stack gap={4}>
              <Text size="xs" fw={500}>Vertical Exaggeration</Text>
              <Slider
                min={1}
                max={2000}
                step={1}
                value={hillshadeParams.zFactor}
                onChange={(v) => updateHillshadeParams({ zFactor: v })}
                label={(v) => `${v}×`}
                disabled={hillshadeDisabled || overlayOnly}
              />
            </Stack>
          )}

          <Stack gap={4}>
            <Text size="xs" fw={500}>Shadow Depth</Text>
            <Slider
              min={0}
              max={INTENSITY_STOPS.length - 1}
              step={1}
              value={intensityToIndex(hillshadeParams.intensity)}
              onChange={(i) => updateHillshadeParams({ intensity: INTENSITY_STOPS[i] })}
              label={(i) => formatIntensity(INTENSITY_STOPS[i])}
              disabled={hillshadeDisabled || overlayOnly}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Brightness</Text>
            <Slider
              min={0.3}
              max={0.9}
              step={0.05}
              value={overlayOnly ? overlayBrightness : hillshadeParams.brightness}
              onChange={(v) => overlayOnly ? setOverlayBrightness(v) : updateHillshadeParams({ brightness: v })}
              label={(v) => `${Math.round(v * 100)}%`}
              disabled={hillshadeDisabled}
            />
          </Stack>

          </Stack>
          </Collapse>
          <Divider />
        </>
      )}

      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setContoursOpen((o) => !o)}>
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Contour Parameters
        </Text>
        <Text size="lg" c="dimmed">{contoursOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={contoursOpen}>
      <Stack gap="md">

      <Select
        label="Elevation Units"
        size="xs"
        placeholder="Select units…"
        data={UNIT_OPTIONS}
        value={unitType}
        onChange={(v) => v && setElevationUnits(v as 'feet' | 'meters' | 'custom')}
        clearable
        onClear={() => updateElevationCalibration({ unitType: null, realMin: null, realMax: null, realInterval: null, mapWidth: null })}
      />

      {unitType === 'custom' && (
        <Stack gap={6}>
          <Group grow>
            <TextInput
              label="Unit Name"
              size="xs"
              placeholder="e.g. Cubits"
              value={customName}
              onChange={(e) => updateElevationCalibration({ customName: e.currentTarget.value })}
            />
            <TextInput
              label="Abbreviation"
              size="xs"
              placeholder="e.g. cu"
              value={customAbbr}
              onChange={(e) => updateElevationCalibration({ customAbbr: e.currentTarget.value })}
            />
          </Group>
          <Group grow align="flex-end">
            <Select
              label="1 unit equals N"
              size="xs"
              data={[
                { value: 'feet', label: 'Feet' },
                { value: 'meters', label: 'Meters' },
              ]}
              value={customBase}
              onChange={(v) => v && updateElevationCalibration({ customBase: v as 'feet' | 'meters' })}
            />
            <NumberInput
              label="N (ratio)"
              size="xs"
              min={0.000001}
              step={0.1}
              decimalScale={6}
              value={customRatio}
              onChange={(v) => typeof v === 'number' && updateElevationCalibration({ customRatio: v })}
              onBlur={finalizeCustomConversion}
            />
          </Group>
        </Stack>
      )}

      <NumberInput
        label={`Width in ${abbr || '?'} of Map`}
        size="xs"
        decimalScale={1}
        step={1}
        min={0.000001}
        disabled={!unitType}
        value={mapWidth ?? ''}
        onChange={(v) => updateElevationCalibration({ mapWidth: typeof v === 'number' ? v : null })}
        placeholder={unitType ? 'e.g. 50' : '—'}
        styles={!unitType ? roStyle : activeStyle}
      />

      <Group grow>
        <NumberInput
          label={`Min${abbr ? ` (${abbr})` : ''}`}
          description="Real-world"
          size="xs"
          decimalScale={1}
          step={1}
          disabled={!unitType}
          value={realMin ?? ''}
          onChange={handleRealMinChange}
          onBlur={handleMinMaxBlur}
          placeholder={unitType ? '0' : '—'}
          styles={!unitType ? roStyle : activeStyle}
        />
        <NumberInput
          label={`Max${abbr ? ` (${abbr})` : ''}`}
          description="Real-world"
          size="xs"
          decimalScale={1}
          step={1}
          disabled={!unitType}
          value={realMax ?? ''}
          onChange={handleRealMaxChange}
          onBlur={handleMinMaxBlur}
          placeholder={unitType ? '0' : '—'}
          styles={!unitType ? roStyle : activeStyle}
        />
      </Group>

      <Group grow>
        <NumberInput
          label="Min Elevation"
          description="Normalized"
          size="xs"
          decimalScale={4}
          value={parameters.minElevation}
          disabled
          styles={roStyle}
        />
        <NumberInput
          label="Max Elevation"
          description="Normalized"
          size="xs"
          decimalScale={4}
          value={parameters.maxElevation}
          disabled
          styles={roStyle}
        />
      </Group>

      <Group grow>
        <NumberInput
          label="Contour Interval"
          description="Normalized"
          size="xs"
          decimalScale={4}
          value={parameters.interval}
          disabled
          styles={roStyle}
        />
        <TextInput
          label={`Interval${abbr ? ` (${abbr})` : ''}`}
          description="Real-world"
          size="xs"
          value={intervalStr}
          onChange={handleIntervalInput}
          placeholder={calReady ? 'e.g. 100' : 'Set min/max first'}
          inputMode="numeric"
          styles={!calReady ? roStyle : activeStyle}
        />
      </Group>

      <NumberInput
        label="Major Contour Every N Lines"
        size="xs"
        min={1}
        max={20}
        value={parameters.majorEvery}
        onChange={(v) => typeof v === 'number' && updateParameters({ majorEvery: v })}
        styles={activeStyle}
      />

      <Stack gap={4}>
        <Text size="xs" fw={500}>Path Smoothing</Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={parameters.smoothing}
          onChange={(v) => updateParameters({ smoothing: v })}
          label={(v) => v.toFixed(2)}
        />
      </Stack>

      </Stack>
      </Collapse>

      <Divider />

      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setStyleOpen((o) => !o)}>
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Style
        </Text>
        <Text size="lg" c="dimmed">{styleOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={styleOpen}>
      <Stack gap="md">
      <ColorInput
        label="Minor Contour Color"
        size="xs"
        value={style.minorColor}
        onChange={(v) => updateStyle({ minorColor: v })}
      />

      <ColorInput
        label="Major Contour Color"
        size="xs"
        value={style.majorColor}
        onChange={(v) => updateStyle({ majorColor: v })}
      />

      <Group grow>
        <NumberInput
          label="Minor Line Width"
          size="xs"
          min={0.5}
          max={5}
          step={0.5}
          decimalScale={1}
          value={style.minorWidth}
          onChange={(v) => typeof v === 'number' && updateStyle({ minorWidth: v })}
        />
        <NumberInput
          label="Major Line Width"
          size="xs"
          min={0.5}
          max={10}
          step={0.5}
          decimalScale={1}
          value={style.majorWidth}
          onChange={(v) => typeof v === 'number' && updateStyle({ majorWidth: v })}
        />
      </Group>

      <Stack gap={4}>
        <Text size="xs" fw={500}>Overlay Opacity</Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={(v) => updateStyle({ opacity: v })}
          label={(v) => v.toFixed(2)}
        />
      </Stack>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setLabelStylingOpen((o) => !o)}
      >
        <Text fw={600} size="xs" tt="uppercase" style={{ letterSpacing: 1 }}>
          Label Styling
        </Text>
        <Text size="lg" c="dimmed">{labelStylingOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={labelStylingOpen}>
        <Stack gap="md">
          <Switch
            label="Show Elevation Labels"
            description={!calReady ? 'Set units and real-world min/max to enable' : undefined}
            size="sm"
            checked={style.showLabels}
            disabled={!calReady}
            onChange={(e) => updateStyle({ showLabels: e.currentTarget.checked })}
          />

          <ColorInput
            label="Label Color"
            size="xs"
            value={style.labelColor}
            onChange={(v) => updateStyle({ labelColor: v })}
          />

          <Select
            label="Label Font"
            size="xs"
            data={FONT_OPTIONS}
            value={style.labelFont}
            onChange={(v) => v && updateStyle({ labelFont: v })}
          />

          <Group gap="xl">
            <Checkbox
              label="Bold"
              size="xs"
              checked={style.labelBold}
              onChange={(e) => updateStyle({ labelBold: e.currentTarget.checked })}
            />
            <Checkbox
              label="Italic"
              size="xs"
              checked={style.labelItalic}
              onChange={(e) => updateStyle({ labelItalic: e.currentTarget.checked })}
            />
          </Group>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Label Font Size</Text>
            <Slider
              min={1}
              max={30}
              step={1}
              value={style.labelFontSize}
              onChange={(v) => updateStyle({ labelFontSize: v })}
              label={(v) => `${v}`}
            />
          </Stack>
        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setSeaLevelOpen((o) => !o)}
      >
        <Text fw={600} size="xs" tt="uppercase" style={{ letterSpacing: 1 }}>
          Sea Level
        </Text>
        <Text size="lg" c="dimmed">{seaLevelOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={seaLevelOpen}>
        <Stack gap="md">
          <Switch
            label="Show Sea Level Contour"
            description={!seaLevelApplicable ? 'Set real-world min < 0 and max > 0 to enable' : undefined}
            size="sm"
            checked={style.showSeaLevel}
            disabled={!seaLevelApplicable}
            onChange={(e) => updateStyle({ showSeaLevel: e.currentTarget.checked })}
          />

          <ColorInput
            label="Sea Level Color"
            size="xs"
            value={style.seaLevelColor}
            onChange={(v) => updateStyle({ seaLevelColor: v })}
          />

          <Group grow>
            <NumberInput
              label="Line Width"
              size="xs"
              min={0.5}
              max={10}
              step={0.5}
              decimalScale={1}
              value={style.seaLevelWidth}
              onChange={(v) => typeof v === 'number' && updateStyle({ seaLevelWidth: v })}
            />
            <Select
              label="Line Style"
              size="xs"
              data={DASH_OPTIONS}
              value={style.seaLevelDash}
              onChange={(v) => v && updateStyle({ seaLevelDash: v as 'solid' | 'dashed' | 'dotted' })}
            />
          </Group>

          <Switch
            label="Show Sea Level Icon"
            size="sm"
            checked={style.showSeaLevelLabel}
            onChange={(e) => updateStyle({ showSeaLevelLabel: e.currentTarget.checked })}
          />

          <ColorInput
            label="Icon Color"
            size="xs"
            value={style.seaLevelLabelColor}
            onChange={(v) => updateStyle({ seaLevelLabelColor: v })}
          />

          <Stack gap={4}>
            <Text size="xs" fw={500}>Icon Size</Text>
            <Slider
              min={1}
              max={30}
              step={1}
              value={style.seaLevelLabelFontSize}
              onChange={(v) => updateStyle({ seaLevelLabelFontSize: v })}
              label={(v) => `${v}`}
            />
          </Stack>
        </Stack>
      </Collapse>

      </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setMarkersOpen((o) => !o)}
      >
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Markers &amp; Annotations
        </Text>
        <Text size="lg" c="dimmed">{markersOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={markersOpen}>
        <Stack gap="md">

          <Divider label="Elevation Flags" labelPosition="left" />
          <Switch size="sm" label="Show on map"
            checked={elevationFlagsVisible}
            onChange={(e) => setElevationFlagsVisible(e.currentTarget.checked)} />
          <Text size="xs" fw={500}>Stroke weight</Text>
          <SegmentedControl size="xs"
            value={String(elevationFlagDefaults.boldness)}
            onChange={(v) => updateElevationFlagDefaults({ boldness: Number(v) as 1 | 2 | 3 })}
            data={[{ value: '1', label: 'Thin' }, { value: '2', label: 'Normal' }, { value: '3', label: 'Bold' }]}
          />
          <Stack gap={4}>
            <Text size="xs" fw={500}>Opacity</Text>
            <Slider min={0} max={1} step={0.05} value={elevationFlagDefaults.opacity}
              onChange={(v) => updateElevationFlagDefaults({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`} />
          </Stack>

          <Divider label="Slope Arrows" labelPosition="left" />
          <Switch size="sm" label="Show on map"
            checked={slopeArrowsVisible}
            onChange={(e) => setSlopeArrowsVisible(e.currentTarget.checked)} />
          <Text size="xs" fw={500}>Stroke weight</Text>
          <SegmentedControl size="xs"
            value={String(slopeArrowDefaults.boldness)}
            onChange={(v) => updateSlopeArrowDefaults({ boldness: Number(v) as 1 | 2 | 3 })}
            data={[{ value: '1', label: 'Thin' }, { value: '2', label: 'Normal' }, { value: '3', label: 'Bold' }]}
          />
          <Stack gap={4}>
            <Text size="xs" fw={500}>Opacity</Text>
            <Slider min={0} max={1} step={0.05} value={slopeArrowDefaults.opacity}
              onChange={(v) => updateSlopeArrowDefaults({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`} />
          </Stack>

          <Divider label="Ruggedness Flags" labelPosition="left" />
          <Switch size="sm" label="Show on map"
            checked={ruggednessFlagsVisible}
            onChange={(e) => setRuggednessFlagsVisible(e.currentTarget.checked)} />
          <Switch size="sm" label="Color by severity"
            checked={ruggednessColorBySeverity}
            onChange={(e) => setRuggednessColorBySeverity(e.currentTarget.checked)} />
          {ruggednessColorBySeverity && (
            <Stack gap={6}>
              <Text size="xs" fw={500}>Severity colors</Text>
              {TRI_LABELS.map((label, i) => (
                <Group key={i} gap="xs" align="center" wrap="nowrap">
                  <Box style={{
                    width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                    backgroundColor: ruggednessSeverityColors[i] ?? '#888',
                    border: '1px solid rgba(0,0,0,0.2)',
                  }} />
                  <Text size="xs" style={{ width: 64, flexShrink: 0 }}>{label}</Text>
                  <Text size="xs" c="dimmed" style={{ width: 76, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {triRangeLabel(i, realMin !== null && realMax !== null ? Math.abs(realMax - realMin) : undefined, abbr || undefined)}
                  </Text>
                  <ColorInput size="xs" format="hex" style={{ flex: 1 }}
                    value={ruggednessSeverityColors[i] ?? '#888'}
                    onChange={(v) => setRuggednessSeverityColor(i, v)} />
                </Group>
              ))}
            </Stack>
          )}
          <Text size="xs" fw={500}>Stroke weight</Text>
          <SegmentedControl size="xs"
            value={String(ruggednessFlagDefaults.boldness)}
            onChange={(v) => updateRuggednessFlagDefaults({ boldness: Number(v) as 1 | 2 | 3 })}
            data={[{ value: '1', label: 'Thin' }, { value: '2', label: 'Normal' }, { value: '3', label: 'Bold' }]}
          />
          <Stack gap={4}>
            <Text size="xs" fw={500}>Opacity</Text>
            <Slider min={0} max={1} step={0.05} value={ruggednessFlagDefaults.opacity}
              onChange={(v) => updateRuggednessFlagDefaults({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`} />
          </Stack>

          <Divider label="Swamp Markers" labelPosition="left" />
          <Switch size="sm" label="Show on map"
            checked={swampMarkersVisible}
            onChange={(e) => setSwampMarkersVisible(e.currentTarget.checked)} />
          <Text size="xs" fw={500}>Color</Text>
          <Group gap="xs" align="center">
            {(['#1976D2', '#388E3C', '#212121'] as const).map((color) => (
              <Box key={color} title={color} style={{
                width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                backgroundColor: color,
                border: swampMarkerDefaults.color === color
                  ? '2px solid var(--mantine-primary-color-filled)'
                  : '2px solid transparent',
                boxSizing: 'border-box',
              }} onClick={() => updateSwampMarkerDefaults({ color })} />
            ))}
            <ColorInput size="xs" value={swampMarkerDefaults.color}
              onChange={(v) => updateSwampMarkerDefaults({ color: v })}
              format="hex" style={{ flex: 1 }} />
          </Group>
          <Text size="xs" fw={500}>Stroke weight</Text>
          <SegmentedControl size="xs"
            value={String(swampMarkerDefaults.boldness)}
            onChange={(v) => updateSwampMarkerDefaults({ boldness: Number(v) as 1 | 2 | 3 })}
            data={[{ value: '1', label: 'Thin' }, { value: '2', label: 'Normal' }, { value: '3', label: 'Bold' }]}
          />
          <Stack gap={4}>
            <Text size="xs" fw={500}>Opacity</Text>
            <Slider min={0} max={1} step={0.05} value={swampMarkerDefaults.opacity}
              onChange={(v) => updateSwampMarkerDefaults({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`} />
          </Stack>

          <Divider label="Points of Interest" labelPosition="left" />
          <Group gap="xs" align="center">
            <Switch size="sm" label="Show on map"
              checked={poisVisible}
              onChange={(e) => setPoisVisible(e.currentTarget.checked)} />
            <Text size="xs" c="dimmed">({pois.length} placed)</Text>
          </Group>

          {(() => {
            const sel = selectedPoiId ? pois.find(p => p.id === selectedPoiId) : null

            if (sel) {
              const isBuiltin = sel.typeId in BUILTIN_MARKER_SPECS
              const typeName = isBuiltin
                ? BUILTIN_MARKER_SPECS[sel.typeId as BuiltinMarkerTypeId].name
                : customMarkerDefs.find(d => d.id === sel.typeId)?.name ?? sel.typeId
              const isBridge = sel.typeId === 'bridge'
              const isCustom = !isBuiltin
              const customDef = isCustom ? customMarkerDefs.find(d => d.id === sel.typeId) : null
              const showFont = sel.typeId === 'cave' || (isCustom && customDef?.symbol.kind === 'unicode')

              return (
                <Box style={{
                  background: 'rgba(34,139,230,0.07)',
                  border: '1px solid rgba(34,139,230,0.3)',
                  borderRadius: 6,
                  padding: '10px 12px',
                }}>
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Text size="xs" fw={700} c="blue">Editing: {typeName}</Text>
                      <Text size="xs" c="dimmed">Esc to deselect</Text>
                    </Group>

                    <ColorInput size="xs" label="Color"
                      value={sel.color}
                      onChange={(v) => updatePoi(sel.id, { color: v })} format="hex" />

                    <NumberInput label={`Size (${poiUnitLabel})`} size="xs"
                      value={sel.sizeM} min={1} step={1}
                      onChange={(v) => { const n = Number(v); if (n > 0) updatePoi(sel.id, { sizeM: n }) }} />

                    <NumberInput label="Stroke weight (px)" size="xs"
                      value={sel.strokeWeight} min={0.5} step={0.5}
                      onChange={(v) => { const n = Number(v); if (n > 0) updatePoi(sel.id, { strokeWeight: n }) }} />

                    {isBridge && (
                      <>
                        <Group grow>
                          <NumberInput label={`Length (${poiUnitLabel})`} size="xs"
                            value={sel.bridgeLengthM ?? 30} min={1} step={5}
                            onChange={(v) => { const n = Number(v); if (n > 0) updatePoi(sel.id, { bridgeLengthM: n }) }} />
                          <NumberInput label={`Separation (${poiUnitLabel})`} size="xs"
                            value={sel.bridgeSeparationM ?? 6} min={0.5} step={1}
                            onChange={(v) => { const n = Number(v); if (n > 0) updatePoi(sel.id, { bridgeSeparationM: n }) }} />
                        </Group>
                        <Stack gap={4}>
                          <Text size="xs" fw={500}>Rotation (°)</Text>
                          <Slider min={0} max={355} step={5} value={sel.bridgeRotation ?? 0}
                            onChange={(v) => updatePoi(sel.id, { bridgeRotation: v })}
                            label={(v) => `${v}°`} />
                        </Stack>
                      </>
                    )}

                    {showFont && (
                      <Select label="Font" size="xs" data={FONT_OPTIONS}
                        value={sel.fontFamily ?? 'serif'}
                        onChange={(v) => v && updatePoi(sel.id, { fontFamily: v })} />
                    )}

                    <Divider label="Map label" labelPosition="left" />
                    <TextInput size="xs" label="Label text"
                      placeholder="Optional place name"
                      value={sel.label ?? ''}
                      onChange={(e) => updatePoi(sel.id, { label: e.currentTarget.value || undefined })} />
                    {sel.label && (
                      <>
                        <Group grow>
                          <ColorInput size="xs" label="Label color"
                            value={sel.labelColor ?? '#2E2412'}
                            onChange={(v) => updatePoi(sel.id, { labelColor: v })} format="hex" />
                          <NumberInput size="xs" label={`Label size (${poiUnitLabel})`}
                            value={sel.labelSizeM ?? 8} min={1} step={1}
                            onChange={(v) => { const n = Number(v); if (n > 0) updatePoi(sel.id, { labelSizeM: n }) }} />
                        </Group>
                        <Select size="xs" label="Label font" data={FONT_OPTIONS}
                          value={sel.labelFontFamily ?? 'serif'}
                          onChange={(v) => v && updatePoi(sel.id, { labelFontFamily: v })} />
                      </>
                    )}

                    <Button size="xs" color="red" variant="light"
                      onClick={() => { removePoi(sel.id); setSelectedPoiId(null) }}>
                      Delete marker
                    </Button>
                  </Stack>
                </Box>
              )
            }

            // No-selection: new marker defaults + library
            const typeOptions = [
              ...Object.entries(BUILTIN_MARKER_SPECS).map(([id, spec]) => ({ value: id, label: spec.name })),
              ...customMarkerDefs.map(def => ({ value: def.id, label: def.name })),
            ]
            const isNmBridge = poiNewMarker.typeId === 'bridge'
            const isNmCustom = !(poiNewMarker.typeId in BUILTIN_MARKER_SPECS)
            const nmCustomDef = isNmCustom ? customMarkerDefs.find(d => d.id === poiNewMarker.typeId) : null
            const showNmFont = poiNewMarker.typeId === 'cave' || (isNmCustom && nmCustomDef?.symbol.kind === 'unicode')

            return (
              <>
                <Divider label="New Marker Defaults" labelPosition="left" />

                <Select
                  label="Type"
                  size="xs"
                  data={typeOptions}
                  value={poiNewMarker.typeId}
                  onChange={(v) => {
                    if (!v) return
                    if (v in BUILTIN_MARKER_SPECS) {
                      const spec = BUILTIN_MARKER_SPECS[v as BuiltinMarkerTypeId]
                      updatePoiNewMarker({
                        typeId: v,
                        color: spec.defaultColor,
                        sizeM: spec.defaultSizeM,
                        strokeWeight: spec.defaultStrokeWeight,
                        ...(v === 'bridge' ? {
                          bridgeLengthM: spec.defaultBridgeLengthM ?? 30,
                          bridgeSeparationM: spec.defaultBridgeSeparationM ?? 6,
                          bridgeRotation: spec.defaultBridgeRotation ?? 0,
                        } : {}),
                        ...(v === 'cave' ? { fontFamily: spec.defaultFontFamily ?? 'serif' } : {}),
                      })
                    } else {
                      const def = customMarkerDefs.find(d => d.id === v)
                      if (def) updatePoiNewMarker({ typeId: v, color: def.defaultColor, sizeM: def.defaultSizeM, strokeWeight: def.defaultStrokeWeight })
                    }
                  }}
                />

                <ColorInput size="xs" label="Color"
                  value={poiNewMarker.color}
                  onChange={(v) => updatePoiNewMarker({ color: v })} format="hex" />

                <NumberInput label={`Size (${poiUnitLabel})`} size="xs"
                  value={poiNewMarker.sizeM} min={1} step={1}
                  onChange={(v) => { const n = Number(v); if (n > 0) updatePoiNewMarker({ sizeM: n }) }} />

                <NumberInput label="Stroke weight (px)" size="xs"
                  value={poiNewMarker.strokeWeight} min={0.5} step={0.5}
                  onChange={(v) => { const n = Number(v); if (n > 0) updatePoiNewMarker({ strokeWeight: n }) }} />

                {isNmBridge && (
                  <>
                    <Group grow>
                      <NumberInput label={`Length (${poiUnitLabel})`} size="xs"
                        value={poiNewMarker.bridgeLengthM} min={1} step={5}
                        onChange={(v) => { const n = Number(v); if (n > 0) updatePoiNewMarker({ bridgeLengthM: n }) }} />
                      <NumberInput label={`Separation (${poiUnitLabel})`} size="xs"
                        value={poiNewMarker.bridgeSeparationM} min={0.5} step={1}
                        onChange={(v) => { const n = Number(v); if (n > 0) updatePoiNewMarker({ bridgeSeparationM: n }) }} />
                    </Group>
                    <Stack gap={4}>
                      <Text size="xs" fw={500}>Rotation (°)</Text>
                      <Slider min={0} max={355} step={5} value={poiNewMarker.bridgeRotation}
                        onChange={(v) => updatePoiNewMarker({ bridgeRotation: v })}
                        label={(v) => `${v}°`} />
                    </Stack>
                  </>
                )}

                {showNmFont && (
                  <Select label="Font" size="xs" data={FONT_OPTIONS}
                    value={poiNewMarker.fontFamily}
                    onChange={(v) => v && updatePoiNewMarker({ fontFamily: v })} />
                )}

                <Divider label="Map label" labelPosition="left" />
                <TextInput size="xs" label="Label text"
                  description="Stamped on next placed marker"
                  placeholder="Optional"
                  value={poiNewMarker.label}
                  onChange={(e) => updatePoiNewMarker({ label: e.currentTarget.value })}
                />
                <Group grow>
                  <ColorInput size="xs" label="Label color" value={poiNewMarker.labelColor}
                    onChange={(v) => updatePoiNewMarker({ labelColor: v })} format="hex" />
                  <NumberInput size="xs" label={`Label size (${poiUnitLabel})`}
                    value={poiNewMarker.labelSizeM} min={1} step={1}
                    onChange={(v) => { const n = Number(v); if (n > 0) updatePoiNewMarker({ labelSizeM: n }) }} />
                </Group>
                <Select size="xs" label="Label font" data={FONT_OPTIONS}
                  value={poiNewMarker.labelFontFamily}
                  onChange={(v) => v && updatePoiNewMarker({ labelFontFamily: v })} />

                {customMarkerDefs.length > 0 && (
                  <>
                    <Divider label="Custom Marker Library" labelPosition="left" />
                    <Stack gap={6}>
                      {customMarkerDefs.map(def => {
                        const inUse = pois.some(p => p.typeId === def.id)
                        return (
                          <Group key={def.id} justify="space-between" align="center" wrap="nowrap">
                            <Text size="xs" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {def.name}
                            </Text>
                            <Tooltip
                              label={inUse ? 'In use on map — remove instances first' : 'Delete definition'}
                              position="left"
                            >
                              <Button size="compact-xs" color="red" variant="subtle"
                                disabled={inUse}
                                onClick={() => {
                                  removeCustomMarkerDef(def.id)
                                  if (poiNewMarker.typeId === def.id) {
                                    updatePoiNewMarker({ typeId: 'mine', color: BUILTIN_MARKER_SPECS.mine.defaultColor, sizeM: BUILTIN_MARKER_SPECS.mine.defaultSizeM, strokeWeight: BUILTIN_MARKER_SPECS.mine.defaultStrokeWeight })
                                  }
                                }}>
                                ✕
                              </Button>
                            </Tooltip>
                          </Group>
                        )
                      })}
                    </Stack>
                  </>
                )}

                <Divider label="Create Custom Marker" labelPosition="left" />
                <Button size="xs" variant="light"
                  onClick={() => setCreateCustomOpen((o) => !o)}>
                  {createCustomOpen ? 'Cancel' : '+ New marker type'}
                </Button>

                <Collapse in={createCustomOpen}>
                  <Stack gap="md" pt={4}>
                    <TextInput size="xs" label="Name"
                      placeholder="e.g. Waypoint, Danger zone…"
                      value={newCustomName}
                      onChange={(e) => setNewCustomName(e.currentTarget.value)} />

                    <Text size="xs" fw={500}>Symbol</Text>
                    <SegmentedControl size="xs"
                      value={newCustomSymbolKind}
                      onChange={(v) => setNewCustomSymbolKind(v as 'builtin' | 'primitive' | 'unicode')}
                      data={[
                        { value: 'primitive', label: 'Primitive' },
                        { value: 'builtin',   label: 'Built-in' },
                        { value: 'unicode',   label: 'Unicode' },
                      ]}
                    />

                    {newCustomSymbolKind === 'builtin' && (
                      <Select size="xs" label="Built-in symbol"
                        data={Object.entries(BUILTIN_MARKER_SPECS).map(([id, spec]) => ({ value: id, label: spec.name }))}
                        value={newCustomBuiltinId}
                        onChange={(v) => v && setNewCustomBuiltinId(v as BuiltinMarkerTypeId)} />
                    )}

                    {newCustomSymbolKind === 'primitive' && (
                      <Select size="xs" label="Primitive symbol"
                        data={[
                          { value: 'cross-plus',        label: '+ Cross (plus)' },
                          { value: 'cross-x',           label: '× Cross (X)' },
                          { value: 'cross-star',        label: '✳ Cross (star)' },
                          { value: 'circle-tri-open',   label: '◬ Circle + open triangle' },
                          { value: 'circle-tri-filled', label: '◭ Circle + filled triangle' },
                          { value: 'circle-crossbar',   label: '⊖ Circle + crossbar' },
                          { value: 'circle-hatched',    label: '⊗ Circle hatched' },
                          { value: 'mountains',         label: '⛰ Mountains' },
                          { value: 'pin',               label: '📍 Pin' },
                          { value: 'flagpost-left',     label: '⚑ Flagpost (flag left)' },
                        ] as { value: MarkerPrimitiveId; label: string }[]}
                        value={newCustomPrimitiveId}
                        onChange={(v) => v && setNewCustomPrimitiveId(v as MarkerPrimitiveId)} />
                    )}

                    {newCustomSymbolKind === 'unicode' && (
                      <TextInput size="xs" label="Character(s) — max 2"
                        placeholder="e.g. ★ or ⚑"
                        maxLength={2}
                        value={newCustomUnicodeChars}
                        onChange={(e) => setNewCustomUnicodeChars(e.currentTarget.value)} />
                    )}

                    <ColorInput size="xs" label="Default color"
                      value={newCustomColor}
                      onChange={setNewCustomColor} format="hex" />

                    <Group grow>
                      <NumberInput size="xs" label={`Default size (${poiUnitLabel})`}
                        value={newCustomSizeM} min={1} step={1}
                        onChange={(v) => { const n = Number(v); if (n > 0) setNewCustomSizeM(n) }} />
                      <NumberInput size="xs" label="Stroke weight (px)"
                        value={newCustomStrokeWeight} min={0.5} step={0.5}
                        onChange={(v) => { const n = Number(v); if (n > 0) setNewCustomStrokeWeight(n) }} />
                    </Group>

                    <Button size="xs" variant="filled"
                      disabled={!newCustomName.trim() || (newCustomSymbolKind === 'unicode' && !newCustomUnicodeChars.trim())}
                      onClick={() => {
                        const symbol: MarkerSymbolDescriptor =
                          newCustomSymbolKind === 'builtin'   ? { kind: 'builtin',   builtinId: newCustomBuiltinId }
                          : newCustomSymbolKind === 'primitive' ? { kind: 'primitive', primitiveId: newCustomPrimitiveId }
                          : { kind: 'unicode', chars: newCustomUnicodeChars.trim() }
                        addCustomMarkerDef({
                          id: crypto.randomUUID(),
                          name: newCustomName.trim(),
                          symbol,
                          defaultColor: newCustomColor,
                          defaultSizeM: newCustomSizeM,
                          defaultStrokeWeight: newCustomStrokeWeight,
                          createdAt: Date.now(),
                        })
                        setCreateCustomOpen(false)
                        setNewCustomName('')
                        setNewCustomUnicodeChars('')
                      }}>
                      Create marker type
                    </Button>
                  </Stack>
                </Collapse>
              </>
            )
          })()}

        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setRoadsOpen((o) => !o)}
      >
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Roads
        </Text>
        <Text size="lg" c="dimmed">{roadsOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={roadsOpen}>
        <Stack gap="md">

          <Switch size="sm" label="Show on map"
            checked={roadsVisible}
            onChange={(e) => setRoadsVisible(e.currentTarget.checked)} />

          <Divider label="New Road Defaults" labelPosition="left" />

          <Text size="xs" fw={500}>Road type</Text>
          <SegmentedControl size="xs"
            orientation="vertical"
            value={roadDefaults.type}
            onChange={(v) => updateRoadDefaults({ type: v as RoadType })}
            data={[
              { value: 'dirt',     label: 'Dirt' },
              { value: 'gravel',   label: 'Gravel' },
              { value: 'paved',    label: 'Paved' },
              { value: 'footpath', label: 'Footpath (dotted)' },
              { value: 'trail',    label: 'Trail (dot-dash)' },
            ]}
          />

          <Text size="xs" fw={500}>Colors</Text>
          <Group grow gap="xs">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Dirt</Text>
              <ColorInput size="xs" value={roadDefaults.dirtColor}
                onChange={(v) => updateRoadDefaults({ dirtColor: v })}
                format="hex" />
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Gravel</Text>
              <ColorInput size="xs" value={roadDefaults.gravelColor}
                onChange={(v) => updateRoadDefaults({ gravelColor: v })}
                format="hex" />
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Paved</Text>
              <ColorInput size="xs" value={roadDefaults.pavedColor}
                onChange={(v) => updateRoadDefaults({ pavedColor: v })}
                format="hex" />
            </Stack>
          </Group>
          <Group grow gap="xs">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Footpath</Text>
              <ColorInput size="xs" value={roadDefaults.footpathColor}
                onChange={(v) => updateRoadDefaults({ footpathColor: v })}
                format="hex" />
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Trail</Text>
              <ColorInput size="xs" value={roadDefaults.trailColor}
                onChange={(v) => updateRoadDefaults({ trailColor: v })}
                format="hex" />
            </Stack>
          </Group>

          <NumberInput
            label={`Track width${heightmap ? ` (map units, map is ${heightmap.width} wide)` : ''}`}
            size="xs"
            value={Math.round(roadDefaults.trackWidthFraction * (heightmap?.width ?? 1000))}
            onChange={(v) => {
              if (typeof v === 'number' && v > 0 && heightmap) {
                updateRoadDefaults({ trackWidthFraction: v / heightmap.width })
              }
            }}
            min={1}
            step={1}
            disabled={!heightmap}
          />

          <Stack gap={4}>
            <Text size="xs" fw={500}>Stroke weight (fraction of track width)</Text>
            <Slider min={0.05} max={0.25} step={0.01} value={roadDefaults.strokeWeightFraction}
              onChange={(v) => updateRoadDefaults({ strokeWeightFraction: v })}
              label={(v) => `${Math.round(v * 100)}%`} />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Opacity</Text>
            <Slider min={0} max={1} step={0.05} value={roadDefaults.opacity}
              onChange={(v) => updateRoadDefaults({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`} />
          </Stack>

          {selectedRoadId && (() => {
            const road = roads.find(r => r.id === selectedRoadId)
            if (!road) return null
            return (
              <>
                <Divider label="Selected Road" labelPosition="left" />
                <Text size="xs" fw={500}>Road type</Text>
                <SegmentedControl size="xs"
                  orientation="vertical"
                  value={road.type}
                  onChange={(v) => updateRoad(selectedRoadId, {
                    type: v as RoadType,
                    color: v === 'dirt' ? roadDefaults.dirtColor
                      : v === 'gravel' ? roadDefaults.gravelColor
                      : v === 'paved' ? roadDefaults.pavedColor
                      : v === 'footpath' ? roadDefaults.footpathColor
                      : roadDefaults.trailColor,
                  })}
                  data={[
                    { value: 'dirt',     label: 'Dirt' },
                    { value: 'gravel',   label: 'Gravel' },
                    { value: 'paved',    label: 'Paved' },
                    { value: 'footpath', label: 'Footpath (dotted)' },
                    { value: 'trail',    label: 'Trail (dot-dash)' },
                  ]}
                />
                {road.type !== 'footpath' && (
                  <TextInput
                    label="Label"
                    size="xs"
                    placeholder="Road name…"
                    value={road.label}
                    onChange={(e) => updateRoad(selectedRoadId, { label: e.currentTarget.value })}
                  />
                )}
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => {
                    removeRoad(selectedRoadId)
                    setSelectedRoadId(null)
                  }}
                >
                  Delete selected road
                </Button>
              </>
            )
          })()}

        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setBuildingsOpen((o) => !o)}
      >
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Urban Areas &amp; Settlements
        </Text>
        <Text size="lg" c="dimmed">{buildingsOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={buildingsOpen}>
        <Stack gap="md">

          <Switch size="sm" label="Show on map"
            checked={buildingsVisible}
            onChange={(e) => setBuildingsVisible(e.currentTarget.checked)} />

          <Text size="xs" c="dimmed">
            {buildings.length === 0 ? 'No buildings placed yet' : `${buildings.length} building${buildings.length === 1 ? '' : 's'} on map`}
          </Text>

          <Divider label="New Building Defaults" labelPosition="left" />

          <Select
            label="Culture / Period"
            size="xs"
            data={BUILDING_CATALOG.map(g => ({ value: g.id, label: `${g.label} (${g.period})` }))}
            value={buildingDefaults.cultureId}
            onChange={(v) => {
              if (!v) return
              const group = BUILDING_CATALOG.find(g => g.id === v)
              if (!group) return
              const firstTpl = group.buildings[0]
              updateBuildingDefaults({
                cultureId: v,
                buildingTemplateId: firstTpl.id,
                widthM: firstTpl.defaultWidthM,
                depthM: firstTpl.defaultDepthM,
              })
            }}
          />

          {(() => {
            const group = BUILDING_CATALOG.find(g => g.id === buildingDefaults.cultureId)
            if (!group) return null
            return (
              <Select
                label="Building type"
                size="xs"
                data={group.buildings.map(b => ({ value: b.id, label: b.name }))}
                value={buildingDefaults.buildingTemplateId}
                onChange={(v) => {
                  if (!v) return
                  const tpl = group.buildings.find(b => b.id === v)
                  if (!tpl) return
                  updateBuildingDefaults({
                    buildingTemplateId: v,
                    widthM: tpl.defaultWidthM,
                    depthM: tpl.defaultDepthM,
                  })
                }}
              />
            )
          })()}

          <Group grow>
            <NumberInput
              label="Width (m)"
              size="xs"
              value={buildingDefaults.widthM}
              onChange={(v) => typeof v === 'number' && v > 0 && updateBuildingDefaults({ widthM: v })}
              min={1}
              step={1}
              decimalScale={1}
            />
            <NumberInput
              label="Depth (m)"
              size="xs"
              value={buildingDefaults.depthM}
              onChange={(v) => typeof v === 'number' && v > 0 && updateBuildingDefaults({ depthM: v })}
              min={1}
              step={1}
              decimalScale={1}
            />
          </Group>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Rotation (°)</Text>
            <Slider
              min={0} max={355} step={5}
              value={buildingDefaults.rotation}
              onChange={(v) => updateBuildingDefaults({ rotation: v })}
              label={(v) => `${v}°`}
            />
          </Stack>

          <ColorInput
            label="Color"
            size="xs"
            value={buildingDefaults.color}
            onChange={(v) => updateBuildingDefaults({ color: v })}
            format="hex"
          />

          <Stack gap={4}>
            <Text size="xs" fw={500}>Opacity</Text>
            <Slider
              min={0} max={1} step={0.05}
              value={buildingDefaults.opacity}
              onChange={(v) => updateBuildingDefaults({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`}
            />
          </Stack>

          {(() => {
            const group = BUILDING_CATALOG.find(g => g.id === buildingDefaults.cultureId)
            const tpl = group?.buildings.find(b => b.id === buildingDefaults.buildingTemplateId)
            if (!tpl) return null
            const shape = tpl.shape
            const cx = 50, cy = 40, pw = 38, pd = 28
            const dPath = buildingPreviewPath(shape, cx, cy, pw, pd)
            return (
              <Stack gap={2}>
                <Text size="xs" fw={500} c="dimmed">Shape preview</Text>
                <svg width={100} height={80} style={{ border: '1px solid rgba(128,128,128,0.2)', borderRadius: 4 }}>
                  <path d={dPath}
                    fill={buildingDefaults.color} fillOpacity={0.6}
                    stroke={buildingDefaults.color} strokeWidth={1.5}
                    fillRule={shape === 'courtyard' ? 'evenodd' : undefined} />
                </svg>
                <Text size="xs" c="dimmed">{tpl.name}</Text>
              </Stack>
            )
          })()}

        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setGridsOpen((o) => !o)}
      >
        <Group gap="xs" align="center">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
            Grids
          </Text>
          <Switch
            size="xs"
            label="Show grid"
            checked={grid.enabled}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateGrid({ enabled: e.currentTarget.checked })}
            disabled={!heightmap}
          />
        </Group>
        <Text size="lg" c="dimmed">{gridsOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={gridsOpen}>
        <Stack gap="md">

          {/* Five mutually exclusive grid types */}
          <Radio.Group
            value={grid.type}
            onChange={(v) => updateGrid({ type: v as GridType })}
          >
            <Stack gap={4}>
              <Radio value="square"      label="Square" disabled={!heightmap} />
              <Radio value="hex-flat"    label="Hex (flat-top)" disabled={!heightmap} />
              <Radio value="hex-pointy"  label="Hex (pointy-top)" disabled={!heightmap} />
              <Radio value="hex-rotated" label="Hex (rotated 45°)" disabled={!heightmap} />
              <Tooltip
                label="Enable Framing → measure bars first"
                disabled={measureBar.enabled}
                position="right"
              >
                <Radio
                  value="measured"
                  label="Measured (matches measure bars)"
                  disabled={!heightmap || !measureBar.enabled}
                />
              </Tooltip>
            </Stack>
          </Radio.Group>

          {/* Interval (only for square/hex) */}
          {grid.type !== 'measured' && (
            <NumberInput
              label={`Interval${abbr ? ` (${abbr})` : ' (px)'}`}
              description={calReady && mapWidth ? `Map width: ${mapWidth} ${abbr}` : 'Pixels (no calibration)'}
              size="xs"
              value={grid.interval}
              onChange={(v) => typeof v === 'number' && v > 0 && updateGrid({ interval: v })}
              min={1}
              step={calReady ? 10 : 5}
              decimalScale={1}
              allowDecimal
              disabled={!heightmap}
            />
          )}

          {/* Major lines */}
          <Divider label="Major lines" labelPosition="left" />
          <Group grow align="flex-end">
            <ColorInput
              label="Color"
              size="xs"
              value={grid.color}
              onChange={(v) => updateGrid({ color: v })}
              format="hex"
              disabled={!heightmap}
            />
            <Select
              label="Pattern"
              size="xs"
              data={LINE_PATTERN_OPTIONS}
              value={grid.pattern}
              onChange={(v) => v && updateGrid({ pattern: v as GridLinePattern })}
              disabled={!heightmap}
            />
          </Group>
          <Group grow align="flex-end">
            <NumberInput
              label="Width (px)"
              size="xs"
              value={grid.lineWidth}
              onChange={(v) => typeof v === 'number' && v > 0 && updateGrid({ lineWidth: v })}
              min={0.25}
              step={0.25}
              decimalScale={2}
              allowDecimal
              disabled={!heightmap}
            />
            <Stack gap={4}>
              <Text size="xs" fw={500} c={heightmap ? undefined : 'dimmed'}>Opacity</Text>
              <Group gap="xs" align="center">
                <Slider
                  min={0} max={1} step={0.05}
                  value={grid.opacity}
                  onChange={(v) => updateGrid({ opacity: v })}
                  label={(v) => `${Math.round(v * 100)}%`}
                  disabled={!heightmap}
                  style={{ flex: 1 }}
                />
                <Text size="xs" c="dimmed" style={{ width: 34, textAlign: 'right' }}>{Math.round(grid.opacity * 100)}%</Text>
              </Group>
            </Stack>
          </Group>

          {/* Minor lines (square and measured only) */}
          {(grid.type === 'square' || grid.type === 'measured') && (
            <>
              <Divider label="Minor lines" labelPosition="left" />
              <Switch
                size="xs"
                label="Show minor lines"
                checked={grid.showMinor}
                onChange={(e) => updateGrid({ showMinor: e.currentTarget.checked })}
                disabled={!heightmap}
              />
              <NumberInput
                label="Divisions per major interval"
                size="xs"
                value={grid.minorDivisions}
                onChange={(v) => typeof v === 'number' && v >= 2 && updateGrid({ minorDivisions: Math.round(v) })}
                min={2}
                max={20}
                step={1}
                disabled={!heightmap || !grid.showMinor}
              />
              <Group grow align="flex-end">
                <ColorInput
                  label="Color"
                  size="xs"
                  value={grid.minorColor}
                  onChange={(v) => updateGrid({ minorColor: v })}
                  format="hex"
                  disabled={!heightmap || !grid.showMinor}
                />
                <Select
                  label="Pattern"
                  size="xs"
                  data={LINE_PATTERN_OPTIONS}
                  value={grid.minorPattern}
                  onChange={(v) => v && updateGrid({ minorPattern: v as GridLinePattern })}
                  disabled={!heightmap || !grid.showMinor}
                />
              </Group>
              <Group grow align="flex-end">
                <NumberInput
                  label="Width (px)"
                  size="xs"
                  value={grid.minorLineWidth}
                  onChange={(v) => typeof v === 'number' && v > 0 && updateGrid({ minorLineWidth: v })}
                  min={0.1}
                  step={0.1}
                  decimalScale={2}
                  allowDecimal
                  disabled={!heightmap || !grid.showMinor}
                />
                <Stack gap={4}>
                  <Text size="xs" fw={500} c={heightmap && grid.showMinor ? undefined : 'dimmed'}>Opacity</Text>
                  <Group gap="xs" align="center">
                    <Slider
                      min={0} max={1} step={0.05}
                      value={grid.minorOpacity}
                      onChange={(v) => updateGrid({ minorOpacity: v })}
                      label={(v) => `${Math.round(v * 100)}%`}
                      disabled={!heightmap || !grid.showMinor}
                      style={{ flex: 1 }}
                    />
                    <Text size="xs" c="dimmed" style={{ width: 34, textAlign: 'right' }}>{Math.round(grid.minorOpacity * 100)}%</Text>
                  </Group>
                </Stack>
              </Group>
            </>
          )}

        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setFramingOpen((o) => !o)}
      >
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Framing
        </Text>
        <Text size="lg" c="dimmed">{framingOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={framingOpen}>
        <Stack gap="md">
          <Switch
            label="Enable frame"
            size="sm"
            checked={frame.enabled}
            onChange={(e) => updateFrame({ enabled: e.currentTarget.checked })}
          />

          <ColorInput
            label="Margin color"
            size="xs"
            value={frame.marginColor}
            onChange={(v) => updateFrame({ marginColor: v })}
            disabled={!frame.enabled}
          />

          <Text size="xs" fw={500} c={frame.enabled ? undefined : 'dimmed'}>Margin (px)</Text>
          <Group grow>
            <NumberInput
              label="Top"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginTop}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginTop: v })}
              disabled={!frame.enabled}
            />
            <NumberInput
              label="Bottom"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginBottom}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginBottom: v })}
              disabled={!frame.enabled}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Left"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginLeft}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginLeft: v })}
              disabled={!frame.enabled}
            />
            <NumberInput
              label="Right"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginRight}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginRight: v })}
              disabled={!frame.enabled}
            />
          </Group>

          <Switch
            label="Show border"
            size="sm"
            checked={frame.borderEnabled}
            onChange={(e) => updateFrame({ borderEnabled: e.currentTarget.checked })}
            disabled={!frame.enabled}
          />

          <ColorInput
            label="Border color"
            size="xs"
            value={frame.borderColor}
            onChange={(v) => updateFrame({ borderColor: v })}
            disabled={!frame.enabled || !frame.borderEnabled}
          />

          <NumberInput
            label="Border width (px)"
            size="xs"
            min={0.5}
            max={20}
            step={0.5}
            decimalScale={1}
            value={frame.borderWidth}
            onChange={(v) => typeof v === 'number' && updateFrame({ borderWidth: v })}
            disabled={!frame.enabled || !frame.borderEnabled}
          />

          <Text size="xs" fw={500} c={frame.enabled && frame.borderEnabled ? undefined : 'dimmed'}>Border style</Text>
          <SegmentedControl
            size="xs"
            orientation="vertical"
            value={frame.borderStyle}
            onChange={(v) => updateFrame({ borderStyle: v as FrameBorderStyle })}
            disabled={!frame.enabled || !frame.borderEnabled}
            data={[
              { value: 'single',        label: 'Single line' },
              { value: 'double',        label: 'Double line' },
              { value: 'cartographic',  label: 'Cartographic' },
              { value: 'shadow',        label: 'Drop shadow' },
              { value: 'ornate',        label: 'Ornate' },
            ]}
          />

          <Divider label="Title" labelPosition="left" />

          <Switch
            label="Show title"
            size="sm"
            checked={title.enabled}
            onChange={(e) => updateTitle({ enabled: e.currentTarget.checked })}
            disabled={!frame.enabled}
          />

          <Select
            label="Position"
            size="xs"
            data={POSITION_OPTIONS}
            value={title.position}
            onChange={(v) => v && updateTitle({ position: v as FramePosition })}
            disabled={!frame.enabled || !title.enabled}
          />

          <TextInput
            label="Title text"
            size="xs"
            placeholder="Map title…"
            value={title.text}
            onChange={(e) => updateTitle({ text: e.currentTarget.value })}
            disabled={!frame.enabled || !title.enabled}
          />

          <Group grow>
            <Select
              label="Font"
              size="xs"
              data={FONT_OPTIONS}
              value={title.font}
              onChange={(v) => v && updateTitle({ font: v })}
              disabled={!frame.enabled || !title.enabled}
            />
            <NumberInput
              label="Size (px)"
              size="xs"
              min={6}
              max={120}
              step={2}
              value={title.size}
              onChange={(v) => typeof v === 'number' && updateTitle({ size: v })}
              disabled={!frame.enabled || !title.enabled}
            />
          </Group>

          <ColorInput
            label="Color"
            size="xs"
            value={title.color}
            onChange={(v) => updateTitle({ color: v })}
            disabled={!frame.enabled || !title.enabled}
          />

          <Group gap="xl">
            <Checkbox
              label="Bold"
              size="xs"
              checked={title.bold}
              onChange={(e) => updateTitle({ bold: e.currentTarget.checked })}
              disabled={!frame.enabled || !title.enabled}
            />
            <Checkbox
              label="Italic"
              size="xs"
              checked={title.italic}
              onChange={(e) => updateTitle({ italic: e.currentTarget.checked })}
              disabled={!frame.enabled || !title.enabled}
            />
          </Group>

          <Divider label="Compass" labelPosition="left" />

          <Switch
            label="Show compass"
            size="sm"
            checked={compass.enabled}
            onChange={(e) => updateCompass({ enabled: e.currentTarget.checked })}
            disabled={!frame.enabled}
          />

          <Select
            label="Position"
            size="xs"
            data={POSITION_OPTIONS}
            value={compass.position}
            onChange={(v) => v && updateCompass({ position: v as FramePosition })}
            disabled={!frame.enabled || !compass.enabled}
          />

          <Select
            label="Style"
            size="xs"
            value={compass.compassStyle}
            onChange={(v) => v && updateCompass({ compassStyle: v as CompassConfig['compassStyle'] })}
            disabled={!frame.enabled || !compass.enabled}
            data={[
              { value: 'plain',    label: 'Plain' },
              { value: 'compass',  label: 'Compass Star' },
              { value: 'nautical', label: 'Nautical' },
              { value: 'celtic',   label: 'Celtic Knot' },
              { value: 'dragon',   label: 'Norse Dragon' },
            ]}
          />

          <Group grow>
            <NumberInput
              label="Size (px)"
              size="xs"
              min={20}
              max={200}
              step={5}
              value={compass.size}
              onChange={(v) => typeof v === 'number' && updateCompass({ size: v })}
              disabled={!frame.enabled || !compass.enabled}
            />
            <ColorInput
              label="Color"
              size="xs"
              value={compass.color}
              onChange={(v) => updateCompass({ color: v })}
              disabled={!frame.enabled || !compass.enabled}
            />
          </Group>

          <NumberInput
            label="Line width (px)"
            size="xs"
            min={0.5}
            max={5}
            step={0.5}
            decimalScale={1}
            value={compass.lineWidth}
            onChange={(v) => typeof v === 'number' && updateCompass({ lineWidth: v })}
            disabled={!frame.enabled || !compass.enabled}
          />

          <Text size="xs" fw={500} c={frame.enabled && compass.enabled ? undefined : 'dimmed'}>Labels</Text>

          {([
            { dir: '↑ Top',    labelKey: 'topLabel',    arrowKey: 'topArrow'    },
            { dir: '→ Right',  labelKey: 'rightLabel',  arrowKey: 'rightArrow'  },
            { dir: '↓ Bottom', labelKey: 'bottomLabel', arrowKey: 'bottomArrow' },
            { dir: '← Left',   labelKey: 'leftLabel',   arrowKey: 'leftArrow'   },
          ] as { dir: string; labelKey: keyof CompassConfig; arrowKey: keyof CompassConfig }[]).map(({ dir, labelKey, arrowKey }) => (
            <Group key={dir} gap="xs" align="center">
              <Text size="xs" style={{ width: 56, flexShrink: 0 }}>{dir}</Text>
              <TextInput
                size="xs"
                placeholder="—"
                value={compass[labelKey] as string}
                onChange={(e) => updateCompass({ [labelKey]: e.currentTarget.value })}
                disabled={!frame.enabled || !compass.enabled}
                maxLength={4}
                style={{ flex: 1 }}
              />
              {compass.compassStyle === 'plain' && (
                <Switch
                  size="xs"
                  label="Arrow"
                  checked={compass[arrowKey] as boolean}
                  onChange={(e) => updateCompass({ [arrowKey]: e.currentTarget.checked })}
                  disabled={!frame.enabled || !compass.enabled}
                />
              )}
            </Group>
          ))}
        <Divider label="Legend" labelPosition="left" />
        <Switch
          label="Show legend"
          size="sm"
          checked={legend.enabled}
          onChange={(e) => updateLegend({ enabled: e.currentTarget.checked })}
          disabled={!frame.enabled}
        />
        <Select
          label="Position"
          size="xs"
          data={POSITION_OPTIONS}
          value={legend.position}
          onChange={(v) => v && updateLegend({ position: v as FramePosition })}
          disabled={!frame.enabled || !legend.enabled}
        />
        <Group gap="md" align="flex-end" grow>
          <NumberInput
            label="Columns"
            size="xs"
            value={legend.columns}
            onChange={(v) => typeof v === 'number' && updateLegend({ columns: Math.max(1, Math.round(v)) })}
            disabled={!frame.enabled || !legend.enabled}
            min={1}
            max={5}
            step={1}
          />
          <NumberInput
            label="Font size (px)"
            size="xs"
            value={legend.fontSize}
            onChange={(v) => typeof v === 'number' && updateLegend({ fontSize: v })}
            disabled={!frame.enabled || !legend.enabled}
            min={6}
            max={32}
            step={1}
          />
          <ColorInput
            label="Color"
            size="xs"
            value={legend.color}
            onChange={(v) => updateLegend({ color: v })}
            disabled={!frame.enabled || !legend.enabled}
            format="hex"
          />
        </Group>
        <Divider label="Items" labelPosition="left" />
        {([
          { key: 'showMinorContour', labelKey: 'minorLabel', label: 'Minor contour' },
          { key: 'showMajorContour', labelKey: 'majorLabel', label: 'Major contour' },
          { key: 'showSeaLevel',     labelKey: 'seaLevelLabel', label: 'Sea level' },
          { key: 'showElevationFlags', labelKey: 'flagLabel', label: 'Elevation flags', requiresData: elevationFlags.length > 0 },
          { key: 'showSlopeArrows',  labelKey: 'arrowLabel',    label: 'Slope arrows',  requiresData: slopeArrows.length > 0 },
          { key: 'showGeoAnchor',    labelKey: 'geoAnchorLabel',      label: 'Geo reference',    requiresData: measureBar.enabled && measureBar.geoEnabled },
          { key: 'showRuggednessFlags', labelKey: 'ruggednessFlagLabel', label: 'Ruggedness index', requiresData: ruggednessFlags.length > 0 },
          { key: 'showSwampMarkers',  labelKey: 'swampMarkerLabel',  label: 'Swamp markers', requiresData: swampMarkers.length > 0 },
          { key: 'showDirtRoads',    labelKey: 'dirtRoadsLabel',    label: 'Dirt road',     requiresData: roads.some(r => r.type === 'dirt') },
          { key: 'showGravelRoads',  labelKey: 'gravelRoadsLabel',  label: 'Gravel road',   requiresData: roads.some(r => r.type === 'gravel') },
          { key: 'showPavedRoads',   labelKey: 'pavedRoadsLabel',   label: 'Paved road',    requiresData: roads.some(r => r.type === 'paved') },
          { key: 'showFootpaths',    labelKey: 'footpathsLabel',    label: 'Footpath',      requiresData: roads.some(r => r.type === 'footpath') },
          { key: 'showTrails',       labelKey: 'trailsLabel',       label: 'Trail',         requiresData: roads.some(r => r.type === 'trail') },
        ] as { key: keyof typeof legend; labelKey?: keyof typeof legend; label: string; requiresData?: boolean }[]).map(({ key, labelKey, label, requiresData }) => (
          <Group key={key as string} gap="xs" align="center" wrap="nowrap">
            <Switch
              size="xs"
              checked={legend[key] as boolean}
              onChange={(e) => updateLegend({ [key]: e.currentTarget.checked })}
              disabled={!frame.enabled || !legend.enabled || requiresData === false}
              label={label}
              style={{ flex: '0 0 auto' }}
            />
            {labelKey && (
              <TextInput
                size="xs"
                placeholder={label}
                value={legend[labelKey] as string}
                onChange={(e) => updateLegend({ [labelKey!]: e.currentTarget.value })}
                disabled={!frame.enabled || !legend.enabled || !(legend[key] as boolean)}
                style={{ flex: 1, minWidth: 0 }}
              />
            )}
          </Group>
        ))}

        {/* Buildings toggle + per-(templateId,color) label overrides */}
        <Group gap="xs" align="center" wrap="nowrap">
          <Switch
            size="xs"
            checked={legend.showBuildings as boolean}
            onChange={(e) => updateLegend({ showBuildings: e.currentTarget.checked })}
            disabled={!frame.enabled || !legend.enabled || buildings.length === 0}
            label="Buildings"
            style={{ flex: '0 0 auto' }}
          />
        </Group>
        {legend.showBuildings && buildings.length > 0 && frame.enabled && legend.enabled && (() => {
          const seen = new Map<string, { shape: BuildingShape; color: string; tplName: string }>()
          for (const b of buildings) {
            const tid = b.templateId ?? ''
            const key = `${tid}::${b.color}`
            if (!seen.has(key)) {
              const tpl = BUILDING_CATALOG.flatMap(g => g.buildings).find(t => t.id === tid)
              seen.set(key, { shape: b.shape, color: b.color, tplName: tpl?.name ?? tid ?? b.shape })
            }
          }
          return (
            <Stack gap={6} pl={4}>
              <Text size="xs" c="dimmed">Building legend labels</Text>
              {[...seen.entries()].map(([key, { shape, color, tplName }]) => (
                <Group key={key} gap="xs" align="center" wrap="nowrap">
                  <svg width={32} height={20} style={{ flexShrink: 0, overflow: 'visible' }}>
                    <path d={buildingPreviewPath(shape, 16, 10, 28, 17)}
                      fill={color} fillOpacity={0.6}
                      stroke={color} strokeWidth={1}
                      fillRule={shape === 'courtyard' ? 'evenodd' : undefined} />
                  </svg>
                  <TextInput
                    size="xs"
                    placeholder={tplName}
                    value={legend.buildingLabels[key] ?? ''}
                    onChange={(e) => {
                      const val = e.currentTarget.value
                      const newLabels = { ...legend.buildingLabels }
                      if (val) { newLabels[key] = val } else { delete newLabels[key] }
                      updateLegend({ buildingLabels: newLabels })
                    }}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </Group>
              ))}
            </Stack>
          )
        })()}

        {/* POI toggle + per-typeId label overrides */}
        <Group gap="xs" align="center" wrap="nowrap">
          <Switch
            size="xs"
            checked={legend.showPois as boolean}
            onChange={(e) => updateLegend({ showPois: e.currentTarget.checked })}
            disabled={!frame.enabled || !legend.enabled || pois.length === 0}
            label="Points of interest"
            style={{ flex: '0 0 auto' }}
          />
        </Group>
        {legend.showPois && pois.length > 0 && frame.enabled && legend.enabled && (() => {
          const seenTypes = new Map<string, string>()
          for (const p of pois) {
            if (!seenTypes.has(p.typeId)) {
              const name = p.typeId in BUILTIN_MARKER_SPECS
                ? BUILTIN_MARKER_SPECS[p.typeId as BuiltinMarkerTypeId].name
                : customMarkerDefs.find(d => d.id === p.typeId)?.name ?? p.typeId
              seenTypes.set(p.typeId, name)
            }
          }
          return (
            <Stack gap={6} pl={4}>
              <Text size="xs" c="dimmed">POI legend labels</Text>
              {[...seenTypes.entries()].map(([typeId, name]) => (
                <TextInput
                  key={typeId}
                  size="xs"
                  label={name}
                  placeholder={name}
                  value={legend.poiLabels[typeId] ?? ''}
                  onChange={(e) => {
                    const val = e.currentTarget.value
                    const newLabels = { ...legend.poiLabels }
                    if (val) { newLabels[typeId] = val } else { delete newLabels[typeId] }
                    updateLegend({ poiLabels: newLabels })
                  }}
                />
              ))}
            </Stack>
          )
        })()}
          <Divider label="Measure bars" labelPosition="left" />
          <Switch
            label="Show measure bars"
            size="sm"
            description={!hasGroundResolution ? 'Set map width in calibration to enable' : undefined}
            checked={measureBar.enabled}
            onChange={(e) => updateMeasureBar({ enabled: e.currentTarget.checked })}
            disabled={!frame.enabled || !hasGroundResolution}
          />
          <Text size="xs" fw={500} c={frame.enabled && measureBar.enabled ? undefined : 'dimmed'}>Edges</Text>
          <Group gap="md">
            <Switch size="xs" label="Top"    checked={measureBar.showTop}    onChange={(e) => updateMeasureBar({ showTop: e.currentTarget.checked })}    disabled={!frame.enabled || !measureBar.enabled} />
            <Switch size="xs" label="Bottom" checked={measureBar.showBottom} onChange={(e) => updateMeasureBar({ showBottom: e.currentTarget.checked })} disabled={!frame.enabled || !measureBar.enabled} />
            <Switch size="xs" label="Left"   checked={measureBar.showLeft}   onChange={(e) => updateMeasureBar({ showLeft: e.currentTarget.checked })}   disabled={!frame.enabled || !measureBar.enabled} />
            <Switch size="xs" label="Right"  checked={measureBar.showRight}  onChange={(e) => updateMeasureBar({ showRight: e.currentTarget.checked })}  disabled={!frame.enabled || !measureBar.enabled} />
          </Group>
          <NumberInput
            label={`Major tick interval${abbr ? ` (${abbr})` : ''}`}
            size="xs"
            value={measureBar.majorInterval}
            onChange={(v) => typeof v === 'number' && v > 0 && updateMeasureBar({ majorInterval: v })}
            min={1}
            step={10}
            disabled={!frame.enabled || !measureBar.enabled}
          />
          <Group grow>
            <NumberInput
              label="Minor divisions"
              size="xs"
              value={measureBar.minorDivisions}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ minorDivisions: Math.max(1, Math.round(v)) })}
              min={1}
              max={10}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <NumberInput
              label="Tick (px)"
              size="xs"
              value={measureBar.tickLength}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ tickLength: v })}
              min={2}
              max={30}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <NumberInput
              label="Minor tick (px)"
              size="xs"
              value={measureBar.minorTickLength}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ minorTickLength: v })}
              min={1}
              max={20}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Line width (px)"
              size="xs"
              value={measureBar.lineWidth}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ lineWidth: v })}
              min={0.5}
              max={5}
              step={0.5}
              decimalScale={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <NumberInput
              label="Font size (px)"
              size="xs"
              value={measureBar.fontSize}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ fontSize: v })}
              min={6}
              max={24}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <ColorInput
              label="Color"
              size="xs"
              value={measureBar.color}
              onChange={(v) => updateMeasureBar({ color: v })}
              disabled={!frame.enabled || !measureBar.enabled}
              format="hex"
            />
          </Group>
          <Switch
            label="Show geo coordinates"
            size="sm"
            description={!hasGroundResolution ? 'Set map width in calibration to enable' : 'Use anchor tool in toolbar to set reference point'}
            checked={measureBar.geoEnabled}
            onChange={(e) => updateMeasureBar({ geoEnabled: e.currentTarget.checked })}
            disabled={!frame.enabled || !measureBar.enabled || !hasGroundResolution}
          />
          {measureBar.geoEnabled && hasGroundResolution && (
            <>
              <Group grow>
                <NumberInput
                  label="Anchor latitude (°)"
                  size="xs"
                  value={measureBar.anchorLat}
                  onChange={(v) => typeof v === 'number' && updateMeasureBar({ anchorLat: v })}
                  min={-90}
                  max={90}
                  step={0.001}
                  decimalScale={6}
                  disabled={!frame.enabled || !measureBar.enabled}
                />
                <NumberInput
                  label="Anchor longitude (°)"
                  size="xs"
                  value={measureBar.anchorLon}
                  onChange={(v) => typeof v === 'number' && updateMeasureBar({ anchorLon: v })}
                  min={-180}
                  max={180}
                  step={0.001}
                  decimalScale={6}
                  disabled={!frame.enabled || !measureBar.enabled}
                />
              </Group>
              <NumberInput
                label="Planet radius (km)"
                size="xs"
                value={measureBar.planetRadius}
                onChange={(v) => typeof v === 'number' && updateMeasureBar({ planetRadius: v })}
                min={100}
                max={100000}
                step={100}
                disabled={!frame.enabled || !measureBar.enabled}
              />
              <Switch
                label="Horizontal axis = latitude"
                description="Swap which axis shows lat vs lon"
                size="sm"
                checked={measureBar.horizontalAxisIsLat}
                onChange={(e) => updateMeasureBar({ horizontalAxisIsLat: e.currentTarget.checked })}
                disabled={!frame.enabled || !measureBar.enabled}
              />
            </>
          )}
        </Stack>
      </Collapse>
    </Stack>
  )
}
