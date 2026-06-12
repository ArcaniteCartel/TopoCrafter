import { useEffect, useRef, useState } from 'react'
import { Stack, Text, Slider, NumberInput, ColorInput, Switch, Divider, Group, Select, TextInput, Collapse, Checkbox, SegmentedControl, Box, Button, Radio, Tooltip, Alert, Modal } from '@mantine/core'
import { useStore } from '../../store/useStore'
import { useGlobalStore } from '../../store/useGlobalStore'
import type { FrameBorderStyle, TitleConfig, CompassConfig, FramePosition, RoadType, GridType, GridLinePattern, GridConfig, BuiltinMarkerTypeId, MarkerPrimitiveId, MarkerSymbolDescriptor, PrecisionSetting } from '../../types'
import { TRI_LABELS, TRI_THRESHOLDS, triRangeLabel, BUILTIN_MARKER_SPECS, calToMeters, niceBarDistance } from '../../types'
import { computeSagittalErrorM, sagittalColor, formatSagittalError, PRECISION_CAPS, PRECISION_LABELS } from '../../utils/sagittal'
import { BUILDING_CATALOG } from '../../data/buildings'
import type { BuildingShape } from '../../data/buildings'
import { detectWaterFeatures } from '../../utils/hydrology'
import { generateVegetation } from '../../utils/vegetation'
import type { VegetationTextureStyle } from '../../types'

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
  const selectedItems = useStore((s) => s.selectedItems)
  const selectItem = useStore((s) => s.selectItem)
  const clearSelection = useStore((s) => s.clearSelection)
  const hillshadeView = useStore((s) => s.hillshadeView)
  const setHillshadeView = useStore((s) => s.setHillshadeView)
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
  const curvedLabels = useStore((s) => s.curvedLabels)
  const updateCurvedLabel = useStore((s) => s.updateCurvedLabel)
  const removeCurvedLabel = useStore((s) => s.removeCurvedLabel)
  // Derive single-selection helpers — editing panels only appear for single selections
  const singleSel = selectedItems.length === 1 ? selectedItems[0] : null
  const selectedRoadId = singleSel?.type === 'road' ? singleSel.id : null
  const selectedPoiId = singleSel?.type === 'poi' ? singleSel.id : null
  const selectedCurvedLabelId = singleSel?.type === 'curved-label' ? singleSel.id : null
  const selectedWaterLakeId = singleSel?.type === 'water-lake' ? singleSel.id : null
  const selectedWaterRiverId = singleSel?.type === 'water-river' ? singleSel.id : null
  const ppi = useStore((s) => s.ppi)
  const setPpi = useStore((s) => s.setPpi)
  const customMarkerDefs = useGlobalStore((s) => s.customMarkerDefs)
  const addCustomMarkerDef = useGlobalStore((s) => s.addCustomMarkerDef)
  const removeCustomMarkerDef = useGlobalStore((s) => s.removeCustomMarkerDef)
  const precisionSetting = useStore((s) => s.precisionSetting)
  const setPrecisionSetting = useStore((s) => s.setPrecisionSetting)
  const sagittalExceptionAcknowledged = useStore((s) => s.sagittalExceptionAcknowledged)
  const setSagittalExceptionAcknowledged = useStore((s) => s.setSagittalExceptionAcknowledged)
  const waterLakes = useStore((s) => s.waterLakes)
  const waterRivers = useStore((s) => s.waterRivers)
  const waterLakesVisible = useStore((s) => s.waterLakesVisible)
  const waterRiversVisible = useStore((s) => s.waterRiversVisible)
  const waterDetectionParams = useStore((s) => s.waterDetectionParams)
  const waterDetecting = useStore((s) => s.waterDetecting)
  const setWaterLakes = useStore((s) => s.setWaterLakes)
  const setWaterRivers = useStore((s) => s.setWaterRivers)
  const updateWaterLake = useStore((s) => s.updateWaterLake)
  const updateWaterRiver = useStore((s) => s.updateWaterRiver)
  const removeWaterLake = useStore((s) => s.removeWaterLake)
  const removeWaterRiver = useStore((s) => s.removeWaterRiver)
  const setWaterLakesVisible = useStore((s) => s.setWaterLakesVisible)
  const setWaterRiversVisible = useStore((s) => s.setWaterRiversVisible)
  const updateWaterDetectionParams = useStore((s) => s.updateWaterDetectionParams)
  const setWaterDetecting = useStore((s) => s.setWaterDetecting)
  const clearWaterFeatures = useStore((s) => s.clearWaterFeatures)
  const vegetationLayers = useStore((s) => s.vegetationLayers)
  const vegetationLayersVisible = useStore((s) => s.vegetationLayersVisible)
  const addVegetationLayer = useStore((s) => s.addVegetationLayer)
  const updateVegetationLayer = useStore((s) => s.updateVegetationLayer)
  const removeVegetationLayer = useStore((s) => s.removeVegetationLayer)
  const setVegetationLayersVisible = useStore((s) => s.setVegetationLayersVisible)

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
  const groundResDisplay = hasGroundResolution && mapWidth && heightmap
    ? (mapWidth / heightmap.width).toPrecision(4).replace(/\.?0+$/, '')
    : null
  // calibration units per pixel — used to convert spread controls
  const spreadPxToUnit = (mapWidth != null && heightmap) ? mapWidth / heightmap.width : null
  const scaleRatio = hasGroundResolution && mapWidth && heightmap && ppi > 0
    ? Math.round(calToMeters(mapWidth, elevationCalibration) / heightmap.width * ppi / 0.0254)
    : null
  const hasPpiAndWidth = ppi > 0 && hasGroundResolution
  const scaleBarDisplayScale = legend.scaleBarUnits === 'imperial' ? 1 / 0.3048 : 1
  const scaleBarDisplayUnit = legend.scaleBarUnits === 'imperial' ? 'ft' : 'm'
  const scaleBarLengthDisplay = legend.scaleBarLengthM != null ? Math.round(legend.scaleBarLengthM * scaleBarDisplayScale) : 0
  const autoBarLengthM = hasPpiAndWidth && mapWidth && heightmap
    ? niceBarDistance((2.5 / 2.54) * ppi * calToMeters(mapWidth, elevationCalibration) / heightmap.width)
    : null
  const autoBarDisplay = autoBarLengthM !== null
    ? `${Math.round(autoBarLengthM * scaleBarDisplayScale)} ${scaleBarDisplayUnit}`
    : undefined
  const hasGeoInfo = hasGroundResolution && (
    measureBar.anchorLat !== 0 || measureBar.anchorLon !== 0 ||
    measureBar.anchorX !== null || measureBar.anchorY !== null
  )

  const effectivePrecision: PrecisionSetting = measureBar.geoEnabled ? precisionSetting : 'medium'
  const effectiveCapM = PRECISION_CAPS[effectivePrecision]
  const sagittalErrorM = (mapWidth && mapWidth > 0 && heightmap)
    ? computeSagittalErrorM(mapWidth, heightmap.width, heightmap.height, unitType, measureBar.planetRadius)
    : null
  const sagittalExceeded = sagittalErrorM !== null && sagittalErrorM > effectiveCapM

  // Sea level is only applicable when calibration spans real-world 0 (min < 0 < max)
  const seaLevelApplicable = calReady && realMin !== null && realMax !== null
    && realMin < 0 && realMax > 0

  // TextInput local state — avoids Mantine NumberInput controlled-mode quirks
  const [intervalStr, setIntervalStr] = useState<string>(
    realInterval !== null ? String(realInterval) : ''
  )
  const [hillshadeOpen, setHillshadeOpen] = useState(false)
  const [contoursOpen, setContoursOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [labelStylingOpen, setLabelStylingOpen] = useState(false)
  const [seaLevelOpen, setSeaLevelOpen] = useState(false)
  const [markersOpen, setMarkersOpen] = useState(false)
  const [roadsOpen, setRoadsOpen] = useState(false)
  const [buildingsOpen, setBuildingsOpen] = useState(false)
  const [gridsOpen, setGridsOpen] = useState(false)
  const [geoOpen, setGeoOpen] = useState(false)
  const [framingOpen, setFramingOpen] = useState(false)
  // Marker subgroups
  const [elevFlagsSubOpen, setElevFlagsSubOpen] = useState(false)
  const [slopeArrowsSubOpen, setSlopeArrowsSubOpen] = useState(false)
  const [ruggedSubOpen, setRuggedSubOpen] = useState(false)
  const [swampSubOpen, setSwampSubOpen] = useState(false)
  const [poisSubOpen, setPoisSubOpen] = useState(false)
  const [labelsSubOpen, setLabelsSubOpen] = useState(false)
  // Grid subgroups
  const [majorLinesOpen, setMajorLinesOpen] = useState(false)
  const [minorLinesOpen, setMinorLinesOpen] = useState(false)
  // Framing subgroups
  const [titleSubOpen, setTitleSubOpen] = useState(false)
  const [compassSubOpen, setCompassSubOpen] = useState(false)
  const [legendSubOpen, setLegendSubOpen] = useState(false)
  // POI sub-subgroups
  const [poiEditMapLabelOpen, setPoiEditMapLabelOpen] = useState(false)
  const [poiNewDefaultsOpen, setPoiNewDefaultsOpen] = useState(false)
  const [poiNewMapLabelOpen, setPoiNewMapLabelOpen] = useState(false)
  const [poiCustomLibOpen, setPoiCustomLibOpen] = useState(false)
  // Legend sub-subgroups
  const [mapScaleOpen, setMapScaleOpen] = useState(false)
  const [legendItemsOpen, setLegendItemsOpen] = useState(false)
  const [measureBarsOpen, setMeasureBarsOpen] = useState(false)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [waterOpen, setWaterOpen] = useState(false)
  const [waterDetectParamsOpen, setWaterDetectParamsOpen] = useState(false)
  const [waterConfirmOpen, setWaterConfirmOpen] = useState(false)
  const [vegetationOpen, setVegetationOpen] = useState(false)
  const [vegetationOpenLayers, setVegetationOpenLayers] = useState<Record<string, boolean>>({})

  const [createCustomOpen, setCreateCustomOpen] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [newCustomSymbolKind, setNewCustomSymbolKind] = useState<'builtin' | 'primitive' | 'unicode'>('primitive')
  const [newCustomBuiltinId, setNewCustomBuiltinId] = useState<BuiltinMarkerTypeId>('mine')
  const [newCustomPrimitiveId, setNewCustomPrimitiveId] = useState<MarkerPrimitiveId>('cross-plus')
  const [newCustomUnicodeChars, setNewCustomUnicodeChars] = useState('')
  const [newCustomColor, setNewCustomColor] = useState('#555555')
  const [newCustomSizeM, setNewCustomSizeM] = useState(10)
  const [newCustomStrokeWeight, setNewCustomStrokeWeight] = useState(1.5)

  const allOpen = hillshadeOpen && contoursOpen && styleOpen && labelStylingOpen && seaLevelOpen && markersOpen && roadsOpen && buildingsOpen && gridsOpen && geoOpen && framingOpen
    && elevFlagsSubOpen && slopeArrowsSubOpen && ruggedSubOpen && swampSubOpen && poisSubOpen && labelsSubOpen
    && majorLinesOpen && minorLinesOpen
    && titleSubOpen && compassSubOpen && legendSubOpen
    && poiEditMapLabelOpen && poiNewDefaultsOpen && poiNewMapLabelOpen && poiCustomLibOpen
    && mapScaleOpen && legendItemsOpen && measureBarsOpen && metadataOpen
  const toggleAll = () => {
    const next = !allOpen
    setHillshadeOpen(next); setContoursOpen(next); setStyleOpen(next)
    setLabelStylingOpen(next); setSeaLevelOpen(next); setMarkersOpen(next); setRoadsOpen(next); setBuildingsOpen(next); setGridsOpen(next); setGeoOpen(next); setFramingOpen(next)
    setElevFlagsSubOpen(next); setSlopeArrowsSubOpen(next); setRuggedSubOpen(next); setSwampSubOpen(next); setPoisSubOpen(next); setLabelsSubOpen(next)
    setMajorLinesOpen(next); setMinorLinesOpen(next)
    setTitleSubOpen(next); setCompassSubOpen(next); setLegendSubOpen(next)
    setPoiEditMapLabelOpen(next); setPoiNewDefaultsOpen(next); setPoiNewMapLabelOpen(next); setPoiCustomLibOpen(next)
    setMapScaleOpen(next); setLegendItemsOpen(next); setMeasureBarsOpen(next); setMetadataOpen(next)
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

  const runWaterDetection = async () => {
    if (!heightmap) return
    setWaterDetecting(true)
    await new Promise<void>((res) => setTimeout(res, 50))
    try {
      const result = detectWaterFeatures(
        heightmap.data, heightmap.width, heightmap.height,
        waterDetectionParams, heightmap.minValue, heightmap.maxValue
      )
      setWaterLakes(result.lakes)
      setWaterRivers(result.rivers)
      clearSelection()
    } finally {
      setWaterDetecting(false)
    }
  }

  const handleDetectClick = () => {
    if (waterLakes.length > 0 || waterRivers.length > 0) {
      setWaterConfirmOpen(true)
    } else {
      void runWaterDetection()
    }
  }

  const runVegetationGeneration = async (layerId: string) => {
    if (!heightmap) return
    updateVegetationLayer(layerId, { generating: true })
    await new Promise<void>((res) => setTimeout(res, 50))
    try {
      const layer = vegetationLayers.find((l) => l.id === layerId)
      if (!layer) return
      const dataUrl = generateVegetation({
        heightData: heightmap.data,
        mapWidth: heightmap.width,
        mapHeight: heightmap.height,
        minValue: heightmap.minValue,
        maxValue: heightmap.maxValue,
        waterLakes,
        waterRivers,
        layer,
        pixelsPerUnit: spreadPxToUnit ? 1 / spreadPxToUnit : 1,
      })
      updateVegetationLayer(layerId, { dataUrl, generating: false })
    } catch {
      updateVegetationLayer(layerId, { generating: false })
    }
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
            <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
              Hillshade
            </Text>
            <Text size="lg" c="dimmed">{hillshadeOpen ? '▾' : '▸'}</Text>
          </Group>

          <Collapse in={hillshadeOpen}>
          <Stack gap="md">
          <SegmentedControl
            size="xs"
            fullWidth
            data={[
              { value: 'combined', label: 'Combined' },
              { value: 'hillshade-only', label: 'Hillshade only' },
              { value: 'overlay-only', label: 'Overlay only' },
            ]}
            value={hillshadeView}
            onChange={(v) => setHillshadeView(v as 'combined' | 'hillshade-only' | 'overlay-only')}
          />
          <Stack gap={4}>
            <Text size="xs" fw={500}>Sun Azimuth</Text>
            <Slider
              min={0}
              max={360}
              step={5}
              value={hillshadeParams.azimuth}
              onChange={(v) => updateHillshadeParams({ azimuth: v })}
              label={(v) => `${v}°`}
              disabled={hillshadeDisabled || hillshadeView === 'overlay-only'}
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
              disabled={hillshadeDisabled || hillshadeView === 'overlay-only'}
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
                  disabled={hillshadeDisabled || hillshadeView === 'overlay-only'}
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
                disabled={hillshadeDisabled || hillshadeView === 'overlay-only'}
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
              disabled={hillshadeDisabled || hillshadeView === 'overlay-only'}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Brightness</Text>
            <Slider
              min={0.3}
              max={0.9}
              step={0.05}
              value={hillshadeView === 'overlay-only' ? overlayBrightness : hillshadeParams.brightness}
              onChange={(v) => hillshadeView === 'overlay-only' ? setOverlayBrightness(v) : updateHillshadeParams({ brightness: v })}
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

      {sagittalErrorM !== null && (
        <Group gap={6} align="center">
          <Text size="xs" c="dimmed">Spherical error:</Text>
          <Tooltip
            label={
              `Sagittal error: the flat-tile assumption deviates from the spherical surface by this amount at the tile center. ` +
              `Computed from the diagonal of your map dimensions and the planet radius.`
            }
            withArrow multiline maw={260} position="right"
          >
            <Text size="xs" fw={600} c={sagittalColor(sagittalErrorM)} style={{ cursor: 'help' }}>
              {formatSagittalError(sagittalErrorM)}
            </Text>
          </Tooltip>
          <Text size="xs" c="dimmed">/ {effectiveCapM} m cap</Text>
        </Group>
      )}

      {sagittalExceeded && (
        <Alert
          color={sagittalExceptionAcknowledged ? 'gray' : 'orange'}
          variant="light"
          p="xs"
        >
          <Stack gap={6}>
            <Text size="xs">
              Spherical error ({formatSagittalError(sagittalErrorM!)}) exceeds your{' '}
              <strong>{PRECISION_LABELS[effectivePrecision]}</strong> precision cap.
              At this tile size, flat-map geometry deviates from the true planetary surface
              by more than {effectiveCapM} m at the center — contours, slope arrows, and
              distance annotations will carry that inaccuracy.
            </Text>
            <Checkbox
              size="xs"
              label="I understand the limitation and wish to proceed"
              checked={sagittalExceptionAcknowledged}
              onChange={(e) => setSagittalExceptionAcknowledged(e.currentTarget.checked)}
            />
          </Stack>
        </Alert>
      )}

      {sagittalErrorM !== null && (
        <Select
          label="Precision setting"
          description="Sagittal error cap for this project"
          size="xs"
          data={[
            { value: 'high',   label: 'High — ≤ 2 m (local / tactical)' },
            { value: 'medium', label: 'Medium — ≤ 10 m (balanced)' },
            { value: 'low',    label: 'Low — ≤ 30 m (macro / regional)' },
          ]}
          value={precisionSetting}
          onChange={(v) => v && setPrecisionSetting(v as PrecisionSetting)}
        />
      )}

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

      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
        onClick={() => setStyleOpen((o) => !o)}>
        <Text fw={500} size="xs" c="dimmed">Style</Text>
        <Text size="sm" c="dimmed">{styleOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={styleOpen}>
      <Stack gap="md" pt={4}>
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
        style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
        onClick={() => setLabelStylingOpen((o) => !o)}
      >
        <Text fw={400} size="xs" c="dimmed">label styling</Text>
        <Text size="xs" c="dimmed">{labelStylingOpen ? '▾' : '▸'}</Text>
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
        style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
        onClick={() => setSeaLevelOpen((o) => !o)}
      >
        <Text fw={400} size="xs" c="dimmed">sea level</Text>
        <Text size="xs" c="dimmed">{seaLevelOpen ? '▾' : '▸'}</Text>
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

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setElevFlagsSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Elevation flags</Text>
            <Text size="sm" c="dimmed">{elevFlagsSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={elevFlagsSubOpen}>
          <Stack gap="md" pt={4}>
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

          </Stack>
          </Collapse>

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setSlopeArrowsSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Slope arrows</Text>
            <Text size="sm" c="dimmed">{slopeArrowsSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={slopeArrowsSubOpen}>
          <Stack gap="md" pt={4}>
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

          </Stack>
          </Collapse>

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setRuggedSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Ruggedness flags</Text>
            <Text size="sm" c="dimmed">{ruggedSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={ruggedSubOpen}>
          <Stack gap="md" pt={4}>
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

          </Stack>
          </Collapse>

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setSwampSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Swamp markers</Text>
            <Text size="sm" c="dimmed">{swampSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={swampSubOpen}>
          <Stack gap="md" pt={4}>
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

          </Stack>
          </Collapse>

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setPoisSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Points of interest</Text>
            <Text size="sm" c="dimmed">{poisSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={poisSubOpen}>
          <Stack gap="md" pt={4}>
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

                    <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
                      onClick={() => setPoiEditMapLabelOpen((o) => !o)}>
                      <Text fw={400} size="xs" c="dimmed">map label</Text>
                      <Text size="xs" c="dimmed">{poiEditMapLabelOpen ? '▾' : '▸'}</Text>
                    </Group>
                    <Collapse in={poiEditMapLabelOpen}>
                    <Stack gap="md" pt={4}>
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
                    </Stack>
                    </Collapse>

                    <Button size="xs" color="red" variant="light"
                      onClick={() => { removePoi(sel.id); clearSelection() }}>
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
                <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
                  onClick={() => setPoiNewDefaultsOpen((o) => !o)}>
                  <Text fw={400} size="xs" c="dimmed">new marker defaults</Text>
                  <Text size="xs" c="dimmed">{poiNewDefaultsOpen ? '▾' : '▸'}</Text>
                </Group>
                <Collapse in={poiNewDefaultsOpen}>
                <Stack gap="md" pt={4}>
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
                </Stack>
                </Collapse>

                <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
                  onClick={() => setPoiNewMapLabelOpen((o) => !o)}>
                  <Text fw={400} size="xs" c="dimmed">map label</Text>
                  <Text size="xs" c="dimmed">{poiNewMapLabelOpen ? '▾' : '▸'}</Text>
                </Group>
                <Collapse in={poiNewMapLabelOpen}>
                <Stack gap="md" pt={4}>
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
                </Stack>
                </Collapse>

                {customMarkerDefs.length > 0 && (
                  <>
                    <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
                      onClick={() => setPoiCustomLibOpen((o) => !o)}>
                      <Text fw={400} size="xs" c="dimmed">custom marker library</Text>
                      <Text size="xs" c="dimmed">{poiCustomLibOpen ? '▾' : '▸'}</Text>
                    </Group>
                    <Collapse in={poiCustomLibOpen}>
                    <Stack gap="md" pt={4}>
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
                    </Stack>
                    </Collapse>
                  </>
                )}

                <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
                  onClick={() => setCreateCustomOpen((o) => !o)}>
                  <Text fw={400} size="xs" c="dimmed">create custom marker</Text>
                  <Text size="xs" c="dimmed">{createCustomOpen ? '▾' : '▸'}</Text>
                </Group>

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

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setLabelsSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Labels</Text>
            <Text size="sm" c="dimmed">{labelsSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={labelsSubOpen}>
          <Stack gap="md" pt={4}>
          <Text size="xs" c="dimmed">({curvedLabels.length} placed)</Text>

          {(() => {
            const sel = selectedCurvedLabelId ? curvedLabels.find(l => l.id === selectedCurvedLabelId) : null
            if (!sel) return null
            return (
              <Box style={{
                background: 'rgba(34,139,230,0.07)',
                border: '1px solid rgba(34,139,230,0.3)',
                borderRadius: 6,
                padding: '10px 12px',
              }}>
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text size="xs" fw={700} c="blue">Editing label</Text>
                    <Text size="xs" c="dimmed">Esc to deselect</Text>
                  </Group>

                  <TextInput size="xs" label="Text"
                    value={sel.text}
                    onChange={(e) => updateCurvedLabel(sel.id, { text: e.currentTarget.value })} />

                  <Group grow>
                    <Select size="xs" label="Font" data={FONT_OPTIONS}
                      value={sel.fontFamily}
                      onChange={(v) => v && updateCurvedLabel(sel.id, { fontFamily: v })} />
                    <NumberInput size="xs" label="Size (px)"
                      value={sel.fontSize} min={4} step={2}
                      onChange={(v) => { const n = Number(v); if (n >= 4) updateCurvedLabel(sel.id, { fontSize: n }) }} />
                  </Group>

                  <Group grow>
                    <Switch size="sm" label="Bold" checked={sel.bold}
                      onChange={(e) => updateCurvedLabel(sel.id, { bold: e.currentTarget.checked })} />
                    <Switch size="sm" label="Italic" checked={sel.italic}
                      onChange={(e) => updateCurvedLabel(sel.id, { italic: e.currentTarget.checked })} />
                  </Group>

                  <ColorInput size="xs" label="Color"
                    value={sel.color}
                    onChange={(v) => updateCurvedLabel(sel.id, { color: v })} format="hex" />

                  <Group grow>
                    <ColorInput size="xs" label="Outline color"
                      value={sel.strokeColor}
                      onChange={(v) => updateCurvedLabel(sel.id, { strokeColor: v })} format="hex" />
                    <NumberInput size="xs" label="Outline width (px)"
                      value={sel.strokeWidth} min={0} step={0.5}
                      onChange={(v) => { const n = Number(v); if (n >= 0) updateCurvedLabel(sel.id, { strokeWidth: n }) }} />
                  </Group>

                  <Stack gap={4}>
                    <Text size="xs" fw={500}>Opacity</Text>
                    <Slider min={0} max={1} step={0.05} value={sel.opacity}
                      onChange={(v) => updateCurvedLabel(sel.id, { opacity: v })}
                      label={(v) => `${Math.round(v * 100)}%`} />
                  </Stack>

                  <Stack gap={4}>
                    <Text size="xs" fw={500}>Start offset (%)</Text>
                    <Slider min={0} max={100} step={1} value={sel.startOffset}
                      onChange={(v) => updateCurvedLabel(sel.id, { startOffset: v })}
                      label={(v) => `${v}%`} />
                  </Stack>

                  <Group grow>
                    <Switch size="sm" label="Reverse side" checked={sel.side === 'right'}
                      onChange={(e) => updateCurvedLabel(sel.id, { side: e.currentTarget.checked ? 'right' : 'left' })} />
                    <Switch size="sm" label="Flip" checked={sel.flip}
                      onChange={(e) => updateCurvedLabel(sel.id, { flip: e.currentTarget.checked })} />
                  </Group>

                  <NumberInput size="xs" label="Z-order (0–100)"
                    description="0–24: below contours · 25–49: below roads · 50–74: above POIs · 75–100: above grid"
                    value={sel.zOrder} min={0} max={100} step={1}
                    onChange={(v) => { const n = Number(v); if (n >= 0 && n <= 100) updateCurvedLabel(sel.id, { zOrder: n }) }} />

                  <Button size="xs" color="red" variant="light"
                    onClick={() => { removeCurvedLabel(sel.id); clearSelection() }}>
                    Delete label
                  </Button>
                </Stack>
              </Box>
            )
          })()}
          </Stack>
          </Collapse>

      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
        onClick={() => setRoadsOpen((o) => !o)}>
        <Text fw={500} size="xs" c="dimmed">Roads</Text>
        <Text size="sm" c="dimmed">{roadsOpen ? '▾' : '▸'}</Text>
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
                    clearSelection()
                  }}
                >
                  Delete selected road
                </Button>
              </>
            )
          })()}

        </Stack>
      </Collapse>

      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
        onClick={() => setBuildingsOpen((o) => !o)}>
        <Text fw={500} size="xs" c="dimmed">Urban areas &amp; settlements</Text>
        <Text size="sm" c="dimmed">{buildingsOpen ? '▾' : '▸'}</Text>
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

      </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setGeoOpen((o) => !o)}
      >
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Geolocation
        </Text>
        <Text size="lg" c="dimmed">{geoOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={geoOpen}>
        <Stack gap="md">
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
          />
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

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setMajorLinesOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Major lines</Text>
            <Text size="sm" c="dimmed">{majorLinesOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={majorLinesOpen}>
          <Stack gap="md" pt={4}>
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

          </Stack>
          </Collapse>

          {/* Minor lines (square and measured only) */}
          {(grid.type === 'square' || grid.type === 'measured') && (
            <>
              <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
                onClick={() => setMinorLinesOpen((o) => !o)}>
                <Text fw={500} size="xs" c="dimmed">Minor lines</Text>
                <Text size="sm" c="dimmed">{minorLinesOpen ? '▾' : '▸'}</Text>
              </Group>
              <Collapse in={minorLinesOpen}>
              <Stack gap="md" pt={4}>
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
              </Stack>
              </Collapse>
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

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setTitleSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Title</Text>
            <Text size="sm" c="dimmed">{titleSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={titleSubOpen}>
          <Stack gap="md" pt={4}>

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

          </Stack>
          </Collapse>

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setCompassSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Compass</Text>
            <Text size="sm" c="dimmed">{compassSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={compassSubOpen}>
          <Stack gap="md" pt={4}>

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
          </Stack>
          </Collapse>

          <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 10 }}
            onClick={() => setLegendSubOpen((o) => !o)}>
            <Text fw={500} size="xs" c="dimmed">Legend</Text>
            <Text size="sm" c="dimmed">{legendSubOpen ? '▾' : '▸'}</Text>
          </Group>
          <Collapse in={legendSubOpen}>
          <Stack gap="md" pt={4}>
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
        <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
          onClick={() => setMapScaleOpen((o) => !o)}>
          <Text fw={400} size="xs" c="dimmed">map scale</Text>
          <Text size="xs" c="dimmed">{mapScaleOpen ? '▾' : '▸'}</Text>
        </Group>
        <Collapse in={mapScaleOpen}>
        <Stack gap="md" pt={4}>
          <Switch
            label="Show scale ratio"
            size="xs"
            checked={legend.showScaleRatio}
            onChange={(e) => updateLegend({ showScaleRatio: e.currentTarget.checked })}
            disabled={!frame.enabled || !legend.enabled || !hasPpiAndWidth}
            description={!hasPpiAndWidth
              ? 'Set PPI (Metadata) and map width (Calibration) to enable'
              : scaleRatio !== null ? `1:${scaleRatio.toLocaleString()}` : undefined}
          />
          {legend.showScaleRatio && frame.enabled && legend.enabled && hasPpiAndWidth && (
            <Box pl="xs">
              <Stack gap={4}>
                <Group gap="xs" grow>
                  <NumberInput
                    label="Font size" size="xs"
                    value={legend.scaleRatioFontSize}
                    onChange={(v) => typeof v === 'number' && v > 0 && updateLegend({ scaleRatioFontSize: v })}
                    min={6} max={48}
                  />
                  <ColorInput
                    label="Color" size="xs"
                    value={legend.scaleRatioColor}
                    onChange={(v) => updateLegend({ scaleRatioColor: v })}
                    format="hex"
                  />
                </Group>
                <Group gap="xs">
                  <Switch label="Bold" size="xs"
                    checked={legend.scaleRatioBold}
                    onChange={(e) => updateLegend({ scaleRatioBold: e.currentTarget.checked })} />
                  <Switch label="Italic" size="xs"
                    checked={legend.scaleRatioItalic}
                    onChange={(e) => updateLegend({ scaleRatioItalic: e.currentTarget.checked })} />
                </Group>
              </Stack>
            </Box>
          )}
          <Switch
            label="Show scale bar"
            size="xs"
            checked={legend.showScaleBar}
            onChange={(e) => updateLegend({ showScaleBar: e.currentTarget.checked })}
            disabled={!frame.enabled || !legend.enabled || !hasPpiAndWidth}
            description={!hasPpiAndWidth ? 'Set PPI (Metadata) and map width (Calibration) to enable' : undefined}
          />
          {legend.showScaleBar && frame.enabled && legend.enabled && (
            <Box pl="xs">
              <Stack gap={6}>
                <SegmentedControl
                  size="xs"
                  data={[
                    { value: 'line', label: 'Line' },
                    { value: 'banded', label: 'Banded' },
                    { value: 'open', label: 'Open' },
                    { value: 'classic', label: 'Classic' },
                  ]}
                  value={legend.scaleBarStyle}
                  onChange={(v) => updateLegend({ scaleBarStyle: v as 'line' | 'banded' | 'open' | 'classic' })}
                />
                <Group gap="xs" grow>
                  <NumberInput
                    label={`Length (${scaleBarDisplayUnit}, 0=auto)`} size="xs"
                    value={scaleBarLengthDisplay}
                    onChange={(v) => updateLegend({ scaleBarLengthM: typeof v === 'number' && v > 0 ? v / scaleBarDisplayScale : null })}
                    min={0}
                    description={legend.scaleBarLengthM === null ? `Auto: ${autoBarDisplay ?? '—'}` : undefined}
                  />
                  <NumberInput
                    label="Height (px)" size="xs"
                    value={legend.scaleBarHeight}
                    onChange={(v) => typeof v === 'number' && v > 0 && updateLegend({ scaleBarHeight: v })}
                    min={2} max={64}
                  />
                </Group>
                <Group gap="xs" grow>
                  <NumberInput
                    label="Divisions" size="xs"
                    value={legend.scaleBarDivisions}
                    onChange={(v) => typeof v === 'number' && v >= 1 && updateLegend({ scaleBarDivisions: Math.round(v) })}
                    min={1} max={12}
                  />
                  <Select
                    label="Border" size="xs"
                    data={[
                      { value: 'none', label: 'None' },
                      { value: 'solid', label: 'Solid' },
                      { value: 'double', label: 'Double' },
                      { value: 'rounded', label: 'Rounded' },
                    ]}
                    value={legend.scaleBarBorder}
                    onChange={(v) => v && updateLegend({ scaleBarBorder: v as 'none' | 'solid' | 'double' | 'rounded' })}
                  />
                </Group>
                <Group gap="xs" grow>
                  <ColorInput
                    label="Color 1" size="xs"
                    value={legend.scaleBarColor1}
                    onChange={(v) => updateLegend({ scaleBarColor1: v })}
                    format="hex"
                  />
                  <ColorInput
                    label="Color 2" size="xs"
                    value={legend.scaleBarColor2}
                    onChange={(v) => updateLegend({ scaleBarColor2: v })}
                    format="hex"
                  />
                </Group>
                <Switch
                  label="Label all divisions" size="xs"
                  checked={legend.scaleBarLabelAll}
                  onChange={(e) => updateLegend({ scaleBarLabelAll: e.currentTarget.checked })}
                />
                {legend.scaleBarStyle === 'classic' && (
                  <Switch
                    label="Sub-labels (alternate unit)" size="xs"
                    checked={legend.scaleBarClassicSubLabels}
                    onChange={(e) => updateLegend({ scaleBarClassicSubLabels: e.currentTarget.checked })}
                  />
                )}
                <Group gap="xs" grow>
                  <NumberInput
                    label="Label size" size="xs"
                    value={legend.scaleBarLabelSize}
                    onChange={(v) => typeof v === 'number' && v > 0 && updateLegend({ scaleBarLabelSize: v })}
                    min={6} max={48}
                  />
                  <ColorInput
                    label="Label color" size="xs"
                    value={legend.scaleBarLabelColor}
                    onChange={(v) => updateLegend({ scaleBarLabelColor: v })}
                    format="hex"
                  />
                </Group>
                <SegmentedControl
                  size="xs"
                  data={[{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]}
                  value={legend.scaleBarUnits}
                  onChange={(v) => updateLegend({ scaleBarUnits: v as 'metric' | 'imperial' })}
                />
                <SegmentedControl
                  size="xs"
                  data={[{ value: 'above', label: 'Above legend' }, { value: 'below', label: 'Below legend' }]}
                  value={legend.scaleBarPosition}
                  onChange={(v) => updateLegend({ scaleBarPosition: v as 'above' | 'below' })}
                />
              </Stack>
            </Box>
          )}
        </Stack>
        </Collapse>

        <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
          onClick={() => setLegendItemsOpen((o) => !o)}>
          <Text fw={400} size="xs" c="dimmed">items</Text>
          <Text size="xs" c="dimmed">{legendItemsOpen ? '▾' : '▸'}</Text>
        </Group>
        <Collapse in={legendItemsOpen}>
        <Stack gap="md" pt={4}>
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
        </Stack>
        </Collapse>
        <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none', paddingLeft: 20 }}
          onClick={() => setMeasureBarsOpen((o) => !o)}>
          <Text fw={400} size="xs" c="dimmed">measure bars</Text>
          <Text size="xs" c="dimmed">{measureBarsOpen ? '▾' : '▸'}</Text>
        </Group>
        <Collapse in={measureBarsOpen}>
        <Stack gap="md" pt={4}>
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
          <Tooltip
            label="Configure geolocation settings in the Geolocation group to enable this control"
            disabled={hasGeoInfo}
            withArrow
            position="right"
            multiline
            maw={220}
          >
            <Box>
              <Switch
                label="Show geo coordinates"
                size="sm"
                checked={measureBar.geoEnabled}
                onChange={(e) => updateMeasureBar({ geoEnabled: e.currentTarget.checked })}
                disabled={!frame.enabled || !measureBar.enabled || !hasGeoInfo}
              />
            </Box>
          </Tooltip>
          {measureBar.geoEnabled && (
            <Switch
              label="Horizontal axis = latitude"
              description="Swap which axis shows lat vs lon"
              size="sm"
              checked={measureBar.horizontalAxisIsLat}
              onChange={(e) => updateMeasureBar({ horizontalAxisIsLat: e.currentTarget.checked })}
              disabled={!frame.enabled || !measureBar.enabled}
            />
          )}
        </Stack>
        </Collapse>
          </Stack>
          </Collapse>

        </Stack>
      </Collapse>

      {/* ─── WATER FEATURES ────────────────────────────────────── */}
      <Divider my="xs" />
      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setWaterOpen((o) => !o)}>
        <Text size="lg" c="dimmed">Water Features</Text>
        <Text size="lg" c="dimmed">{waterOpen ? '▾' : '▸'}</Text>
      </Group>
      <Collapse in={waterOpen}>
      <Stack gap="md" pt={4} pl="xs">

        {/* Detection controls */}
        <Group>
          <Button size="xs" onClick={handleDetectClick}
            loading={waterDetecting} disabled={!heightmap || waterDetecting}>
            {waterLakes.length + waterRivers.length > 0 ? 'Re-detect' : 'Detect'}
          </Button>
          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
            {waterDetecting ? 'Detecting…' : waterLakes.length + waterRivers.length > 0
              ? `${waterLakes.length} lake${waterLakes.length !== 1 ? 's' : ''}, ${waterRivers.length} river${waterRivers.length !== 1 ? 's' : ''}`
              : 'No features detected'}
          </Text>
        </Group>

        {/* Detection params */}
        <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setWaterDetectParamsOpen((o) => !o)}>
          <Text size="xs" fw={500}>Detection parameters</Text>
          <Text size="xs" c="dimmed">{waterDetectParamsOpen ? '▾' : '▸'}</Text>
        </Group>
        <Collapse in={waterDetectParamsOpen}>
        <Stack gap="xs" pl="xs">
          <NumberInput size="xs" label="Min depression depth (%)"
            description="Minimum depth as % of elevation range"
            value={waterDetectionParams.minDepthPct}
            onChange={(v) => typeof v === 'number' && updateWaterDetectionParams({ minDepthPct: v })}
            min={0.1} max={20} step={0.1} decimalScale={1} />
          <NumberInput size="xs" label="Min lake area (pixels)"
            value={waterDetectionParams.minAreaPx}
            onChange={(v) => typeof v === 'number' && updateWaterDetectionParams({ minAreaPx: Math.max(1, Math.round(v)) })}
            min={1} max={5000} step={1} />
          <NumberInput size="xs" label="Stream accumulation (%)"
            description="Threshold as % of map area"
            value={waterDetectionParams.accumulationPct}
            onChange={(v) => typeof v === 'number' && updateWaterDetectionParams({ accumulationPct: v })}
            min={0.01} max={10} step={0.1} decimalScale={2} />
          <NumberInput size="xs" label="Max river systems (0 = all)"
            value={waterDetectionParams.maxRiverSystems}
            onChange={(v) => typeof v === 'number' && updateWaterDetectionParams({ maxRiverSystems: Math.max(0, Math.round(v)) })}
            min={0} max={50} step={1} />
        </Stack>
        </Collapse>

        {/* ── Lakes section ── */}
        {waterLakes.length > 0 && (
          <>
            <Divider label={`Lakes (${waterLakes.length})`} labelPosition="left" size="xs" />
            <Group justify="space-between">
              <Switch size="xs" label="Visible"
                checked={waterLakesVisible} onChange={(e) => setWaterLakesVisible(e.target.checked)} />
              <Button size="xs" variant="subtle" color="red"
                onClick={() => { clearWaterFeatures(); clearSelection() }}>
                Delete all water
              </Button>
            </Group>
            <Stack gap={4}>
              {waterLakes.map((lake, i) => (
                <Box key={lake.id}>
                  <Group justify="space-between"
                    p={4} style={{
                      backgroundColor: selectedItems.some(s => s.type === 'water-lake' && s.id === lake.id) ? '#e8f4ff' : 'transparent',
                      borderRadius: 4, cursor: 'pointer',
                    }}
                    onClick={() => selectItem('water-lake', lake.id)}>
                    <Text size="xs">Lake {i + 1} ({Math.round(lake.areaPx).toLocaleString()} px²)</Text>
                    <Button size="compact-xs" variant="subtle" color="red"
                      onClick={(e) => { e.stopPropagation(); removeWaterLake(lake.id) }}>×</Button>
                  </Group>
                  {selectedWaterLakeId === lake.id && (
                    <Stack gap="xs" pl="sm" pt={4}>
                      <Group grow>
                        <ColorInput size="xs" label="Fill" value={lake.color}
                          onChange={(v) => updateWaterLake(lake.id, { color: v })} />
                        <NumberInput size="xs" label="Opacity %"
                          value={Math.round(lake.opacity * 100)} min={0} max={100}
                          onChange={(v) => typeof v === 'number' && updateWaterLake(lake.id, { opacity: v / 100 })} />
                      </Group>
                      <TextInput size="xs" label="Label text" value={lake.label}
                        onChange={(e) => updateWaterLake(lake.id, { label: e.target.value })} />
                      {lake.label && (
                        <>
                          <Group grow>
                            <Select size="xs" label="Font" data={FONT_OPTIONS}
                              value={lake.labelFontFamily}
                              onChange={(v) => v && updateWaterLake(lake.id, { labelFontFamily: v })} />
                            <NumberInput size="xs" label="Size" min={6} max={120}
                              value={lake.labelFontSize}
                              onChange={(v) => typeof v === 'number' && updateWaterLake(lake.id, { labelFontSize: v })} />
                          </Group>
                          <Group grow>
                            <ColorInput size="xs" label="Label color" value={lake.labelColor}
                              onChange={(v) => updateWaterLake(lake.id, { labelColor: v })} />
                            <Switch size="xs" label="Bold" checked={lake.labelBold}
                              onChange={(e) => updateWaterLake(lake.id, { labelBold: e.target.checked })} />
                            <Switch size="xs" label="Italic" checked={lake.labelItalic}
                              onChange={(e) => updateWaterLake(lake.id, { labelItalic: e.target.checked })} />
                          </Group>
                        </>
                      )}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}

        {/* ── Rivers section ── */}
        {waterRivers.length > 0 && (
          <>
            <Divider label={`Rivers (${waterRivers.length})`} labelPosition="left" size="xs" />
            <Switch size="xs" label="Visible"
              checked={waterRiversVisible} onChange={(e) => setWaterRiversVisible(e.target.checked)} />
            <Stack gap={4}>
              {waterRivers.map((river) => (
                <Box key={river.id}>
                  <Group justify="space-between"
                    p={4} style={{
                      backgroundColor: selectedItems.some(s => s.type === 'water-river' && s.id === river.id) ? '#e8f4ff' : 'transparent',
                      borderRadius: 4, cursor: 'pointer',
                    }}
                    onClick={() => selectItem('water-river', river.id)}>
                    <Text size="xs">River {river.systemRank}</Text>
                    <Button size="compact-xs" variant="subtle" color="red"
                      onClick={(e) => { e.stopPropagation(); removeWaterRiver(river.id) }}>×</Button>
                  </Group>
                  {selectedWaterRiverId === river.id && (
                    <Stack gap="xs" pl="sm" pt={4}>
                      <Group grow>
                        <ColorInput size="xs" label="Color" value={river.color}
                          onChange={(v) => updateWaterRiver(river.id, { color: v })} />
                        <NumberInput size="xs" label="Opacity %"
                          value={Math.round(river.opacity * 100)} min={0} max={100}
                          onChange={(v) => typeof v === 'number' && updateWaterRiver(river.id, { opacity: v / 100 })} />
                      </Group>
                      <NumberInput size="xs" label="Base stroke width"
                        value={river.strokeWidth} min={0.5} max={20} step={0.5} decimalScale={1}
                        onChange={(v) => typeof v === 'number' && updateWaterRiver(river.id, { strokeWidth: v })} />
                      <TextInput size="xs" label="Label text" value={river.label}
                        onChange={(e) => updateWaterRiver(river.id, { label: e.target.value })} />
                      {river.label && (
                        <>
                          <Group grow>
                            <Select size="xs" label="Font" data={FONT_OPTIONS}
                              value={river.labelFontFamily}
                              onChange={(v) => v && updateWaterRiver(river.id, { labelFontFamily: v })} />
                            <NumberInput size="xs" label="Size" min={6} max={120}
                              value={river.labelFontSize}
                              onChange={(v) => typeof v === 'number' && updateWaterRiver(river.id, { labelFontSize: v })} />
                          </Group>
                          <Group grow>
                            <ColorInput size="xs" label="Label color" value={river.labelColor}
                              onChange={(v) => updateWaterRiver(river.id, { labelColor: v })} />
                            <Switch size="xs" label="Bold" checked={river.labelBold}
                              onChange={(e) => updateWaterRiver(river.id, { labelBold: e.target.checked })} />
                            <Switch size="xs" label="Italic" checked={river.labelItalic}
                              onChange={(e) => updateWaterRiver(river.id, { labelItalic: e.target.checked })} />
                          </Group>
                        </>
                      )}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}

      </Stack>
      </Collapse>

      {/* Confirm re-detect modal */}
      <Modal opened={waterConfirmOpen} onClose={() => setWaterConfirmOpen(false)}
        title="Replace water features?" size="sm">
        <Text size="sm">
          This will replace {waterLakes.length} lake{waterLakes.length !== 1 ? 's' : ''} and{' '}
          {waterRivers.length} river{waterRivers.length !== 1 ? 's' : ''} with newly detected features.
        </Text>
        <Group mt="md" justify="flex-end">
          <Button variant="default" size="sm" onClick={() => setWaterConfirmOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => { setWaterConfirmOpen(false); void runWaterDetection() }}>Detect</Button>
        </Group>
      </Modal>

      {/* ─── VEGETATION ────────────────────────────────────────── */}
      <Divider my="xs" />
      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setVegetationOpen((o) => !o)}>
        <Group gap="xs">
          <Switch
            checked={vegetationLayersVisible}
            onChange={(e) => setVegetationLayersVisible(e.currentTarget.checked)}
            onClick={(e) => e.stopPropagation()}
            size="xs"
          />
          <Text size="lg" c="dimmed">Vegetation</Text>
        </Group>
        <Text size="lg" c="dimmed">{vegetationOpen ? '▾' : '▸'}</Text>
      </Group>
      <Collapse in={vegetationOpen}>
      <Stack gap="md" pt={4} pl="xs">
        <Group>
          <Button
            size="xs"
            variant="default"
            disabled={waterLakes.length + waterRivers.length === 0}
            onClick={addVegetationLayer}
          >
            Add Layer
          </Button>
          {waterLakes.length + waterRivers.length === 0 && (
            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Detect water features first</Text>
          )}
        </Group>

        {vegetationLayers.map((vl, idx) => (
          <Box key={vl.id} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6, padding: 8 }}>
            <Group justify="space-between" style={{ cursor: 'pointer' }}
              onClick={() => setVegetationOpenLayers((s) => ({ ...s, [vl.id]: !s[vl.id] }))}>
              <Group gap="xs">
                <Switch
                  checked={vl.visible}
                  onChange={(e) => updateVegetationLayer(vl.id, { visible: e.currentTarget.checked })}
                  onClick={(e) => e.stopPropagation()}
                  size="xs"
                />
                <TextInput
                  value={vl.name}
                  onChange={(e) => updateVegetationLayer(vl.id, { name: e.currentTarget.value })}
                  size="xs"
                  style={{ width: 130 }}
                  onClick={(e) => e.stopPropagation()}
                />
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">{vegetationOpenLayers[vl.id] ? '▾' : '▸'}</Text>
              </Group>
            </Group>

            <Collapse in={!!vegetationOpenLayers[vl.id]}>
            <Stack gap="xs" pt="xs">
              <Text size="xs" fw={500} c="dimmed">Layer {idx + 1}</Text>

              {/* Generate button */}
              <Group>
                <Button
                  size="xs"
                  loading={vl.generating}
                  disabled={!heightmap || vl.generating}
                  onClick={() => void runVegetationGeneration(vl.id)}
                >
                  {vl.dataUrl ? 'Re-generate' : 'Generate'}
                </Button>
                <Button size="xs" variant="subtle" color="red"
                  onClick={() => removeVegetationLayer(vl.id)}>Remove</Button>
              </Group>

              {/* Color + opacity */}
              <Group grow>
                <ColorInput
                  label="Color"
                  size="xs"
                  value={vl.color}
                  onChange={(v) => updateVegetationLayer(vl.id, { color: v })}
                  swatches={['#2d6a4f','#3a7d44','#52b788','#74c69d','#1b4332','#40916c','#95d5b2']}
                />
                <NumberInput
                  label="Opacity %"
                  size="xs"
                  value={Math.round(vl.opacity * 100)}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { opacity: Math.max(0.10, Math.min(0.70, v / 100)) })}
                  min={10} max={70} step={5}
                />
              </Group>

              {/* Water spread */}
              <Group grow>
                <NumberInput
                  label={`Lake spread (${spreadPxToUnit ? abbr : 'px'})`}
                  size="xs"
                  value={vl.lakeSpread}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { lakeSpread: Math.max(0, v) })}
                  min={0} step={spreadPxToUnit ? 10 : 5} decimalScale={0}
                />
                <NumberInput
                  label={`River spread (${spreadPxToUnit ? abbr : 'px'})`}
                  size="xs"
                  value={vl.riverSpread}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { riverSpread: Math.max(0, v) })}
                  min={0} step={spreadPxToUnit ? 10 : 5} decimalScale={0}
                />
              </Group>

              {/* Texture */}
              <Select
                label="Texture"
                size="xs"
                value={vl.textureStyle}
                onChange={(v) => v && updateVegetationLayer(vl.id, { textureStyle: v as VegetationTextureStyle })}
                data={[
                  { value: 'gradient', label: 'Gradient' },
                  { value: 'organic',  label: 'Organic (fBm noise)' },
                  { value: 'stipple',  label: 'Stipple (Bayer dither)' },
                  { value: 'hatch',    label: 'Hatch (diagonal lines)' },
                  { value: 'cellular', label: 'Cellular (Worley noise)' },
                ]}
              />

              {/* Global noise */}
              <Group grow>
                <NumberInput
                  label="Noisiness"
                  size="xs"
                  value={Math.round(vl.noisiness * 100)}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { noisiness: Math.max(0, Math.min(1, v / 100)) })}
                  min={0} max={100} step={5}
                />
                <NumberInput
                  label="Noise scale"
                  size="xs"
                  value={vl.noiseScale}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { noiseScale: Math.max(0.1, Math.min(5, v)) })}
                  min={0.1} max={5} step={0.1} decimalScale={1}
                />
              </Group>

              {/* Style-specific params */}
              {vl.textureStyle === 'organic' && (
                <NumberInput
                  label="fBm octaves"
                  size="xs"
                  value={vl.organicOctaves}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { organicOctaves: Math.max(1, Math.min(8, Math.round(v))) })}
                  min={1} max={8} step={1}
                />
              )}
              {vl.textureStyle === 'stipple' && (
                <NumberInput
                  label="Stipple density"
                  size="xs"
                  value={Math.round(vl.stippleDensity * 100)}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { stippleDensity: Math.max(0, Math.min(1, v / 100)) })}
                  min={0} max={100} step={5}
                />
              )}
              {vl.textureStyle === 'hatch' && (
                <Group grow>
                  <NumberInput
                    label="Angle (°)"
                    size="xs"
                    value={vl.hatchAngle}
                    onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { hatchAngle: ((v % 180) + 180) % 180 })}
                    min={0} max={179} step={15}
                  />
                  <NumberInput
                    label="Spacing (px)"
                    size="xs"
                    value={vl.hatchSpacing}
                    onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { hatchSpacing: Math.max(2, v) })}
                    min={2} max={50} step={1}
                  />
                </Group>
              )}
              {vl.textureStyle === 'cellular' && (
                <NumberInput
                  label="Jitter"
                  size="xs"
                  value={Math.round(vl.cellularJitter * 100)}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { cellularJitter: Math.max(0, Math.min(1, v / 100)) })}
                  min={0} max={100} step={5}
                />
              )}

              {/* Elevation thinning */}
              <Text size="xs" fw={500} c="dimmed" mt={4}>Elevation thinning</Text>
              <Group grow>
                <NumberInput
                  label="Start elev %"
                  size="xs"
                  value={vl.elevStartPct}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { elevStartPct: Math.max(0, Math.min(99, v)) })}
                  min={0} max={99} step={5}
                />
                <NumberInput
                  label="Thin range %"
                  size="xs"
                  value={vl.elevThinRangePct}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { elevThinRangePct: Math.max(1, Math.min(50, v)) })}
                  min={1} max={50} step={5}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label="Variation"
                  size="xs"
                  value={Math.round(vl.elevVariation * 100)}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { elevVariation: Math.max(0, Math.min(1, v / 100)) })}
                  min={0} max={100} step={5}
                />
                <NumberInput
                  label="Water attenuation"
                  size="xs"
                  value={Math.round(vl.waterAttenuation * 100)}
                  onChange={(v) => typeof v === 'number' && updateVegetationLayer(vl.id, { waterAttenuation: Math.max(0, Math.min(1, v / 100)) })}
                  min={0} max={100} step={5}
                />
              </Group>
            </Stack>
            </Collapse>
          </Box>
        ))}
      </Stack>
      </Collapse>

      {/* ─── METADATA ──────────────────────────────────────────── */}
      <Divider my="xs" />
      <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setMetadataOpen((o) => !o)}>
        <Text size="lg" c="dimmed">Metadata</Text>
        <Text size="lg" c="dimmed">{metadataOpen ? '▾' : '▸'}</Text>
      </Group>
      <Collapse in={metadataOpen}>
      <Stack gap="md" pt={4} pl="xs">
        <Tooltip label="Helps determine the scale for printed maps" position="right" withArrow>
          <NumberInput
            label="PPI (pixels per inch)"
            size="xs"
            value={ppi}
            onChange={(v) => typeof v === 'number' && v >= 1 && setPpi(Math.round(v))}
            min={1}
            max={2400}
            step={1}
          />
        </Tooltip>
        {groundResDisplay !== null && (
          <Box>
            <Text size="xs" fw={500} c="dimmed">Ground resolution</Text>
            <Text size="xs" c="dimmed">{groundResDisplay} {abbr}/pixel</Text>
          </Box>
        )}
        {scaleRatio !== null && (
          <Box>
            <Text size="xs" fw={500} c="dimmed">Map scale ratio</Text>
            <Text size="xs" c="dimmed">1:{scaleRatio.toLocaleString()}</Text>
          </Box>
        )}
      </Stack>
      </Collapse>
    </Stack>
  )
}
