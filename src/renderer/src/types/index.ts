export interface ContourParameters {
  interval: number
  minElevation: number
  maxElevation: number
  majorEvery: number
  smoothing: number
}

export interface ContourStyle {
  minorColor: string
  majorColor: string
  labelColor: string
  labelFont: string
  labelBold: boolean
  labelItalic: boolean
  minorWidth: number
  majorWidth: number
  opacity: number
  showLabels: boolean
  labelFontSize: number
  showSeaLevel: boolean
  seaLevelColor: string
  seaLevelWidth: number
  seaLevelDash: 'solid' | 'dashed' | 'dotted'
  showSeaLevelLabel: boolean
  seaLevelLabelColor: string
  seaLevelLabelFontSize: number
}

export interface HeightmapInfo {
  width: number
  height: number
  minValue: number
  maxValue: number
  data: Float32Array
}

export interface HillshadeParameters {
  azimuth: number              // degrees 0–360, clockwise from north (315 = northwest)
  altitude: number             // degrees 0–90 above horizon
  zFactor: number              // raw Z factor used when no ground resolution is set
  verticalExaggeration: number // multiplier on top of computed correct Z Factor (1.0 = accurate)
  intensity: number            // shadow depth multiplier; 1.0 = subtle, higher = more contrast
  brightness: number           // base brightness offset; 0.5 = mid-grey, higher = brighter
}

export interface ElevationCalibration {
  unitType: 'feet' | 'meters' | 'custom' | null
  customName: string
  customAbbr: string
  customBase: 'feet' | 'meters'
  customRatio: number              // 1 custom unit = N base units
  realMin: number | null           // real-world elevation at normalized 0
  realMax: number | null           // real-world elevation at normalized 1
  realInterval: number | null      // contour spacing in real-world units (integer)
  mapWidth: number | null          // total real-world width of the map in calibration units
  preCustomUnit: 'feet' | 'meters' | null  // source unit before switching to custom; null once converted
}

export const defaultElevationCalibration: ElevationCalibration = {
  unitType: null,
  customName: '',
  customAbbr: '',
  customBase: 'feet',
  customRatio: 1,
  realMin: null,
  realMax: null,
  realInterval: null,
  mapWidth: null,
  preCustomUnit: null,
}

export interface ElevationFlag {
  id: string
  x: number         // SVG / heightmap pixel coordinate
  y: number
  elevation: number // real-world elevation at placement point
  boldness?: 1 | 2 | 3
  opacity?: number
}

export interface SlopeArrow {
  id: string
  x: number
  y: number
  angleDeg: number  // direction of steepest ascent in SVG coordinate space
  slopeDeg: number  // slope angle from horizontal in degrees (label value)
  boldness?: 1 | 2 | 3
  opacity?: number
}

export interface RuggednessFlag {
  id: string
  x: number
  y: number
  triNorm: number  // normalized TRI value (0 to ~0.3); dimensionless
  boldness?: 1 | 2 | 3
  opacity?: number
}

export interface SwampMarker {
  id: string
  x: number
  y: number
  sizeFactor: number  // 0.75–1.25 randomized at drop time
  boldness: 1 | 2 | 3
  opacity: number
  color: string
}

export interface MarkerDefaults {
  boldness: 1 | 2 | 3
  opacity: number
}

export interface SwampMarkerDefaults extends MarkerDefaults {
  color: string
}

export type RoadType = 'dirt' | 'gravel' | 'paved' | 'footpath' | 'trail'

export interface Road {
  id: string
  type: RoadType
  points: { x: number; y: number }[]
  closed: boolean
  label: string
  color: string
  trackWidth: number    // in heightmap coordinate units
  strokeWeight: number  // in heightmap coordinate units
  opacity: number
}

export interface RoadDefaults {
  type: RoadType
  dirtColor: string
  gravelColor: string
  pavedColor: string
  footpathColor: string
  trailColor: string
  trackWidthFraction: number  // multiplied by heightmap.width at placement
  strokeWeightFraction: number  // multiplied by trackWidth
  opacity: number
}

export const defaultRoadDefaults: RoadDefaults = {
  type: 'dirt',
  dirtColor: '#8B6914',
  gravelColor: '#888888',
  pavedColor: '#555555',
  footpathColor: '#8B6914',
  trailColor: '#5C4A2A',
  trackWidthFraction: 0.010,
  strokeWeightFraction: 0.12,
  opacity: 1,
}

export const TRI_THRESHOLDS = [0.004, 0.015, 0.04, 0.1] as const
export const TRI_COLORS = ['#4CAF50', '#8BC34A', '#FFC107', '#FF5722', '#8B0000'] as const
export const TRI_LABELS = ['Very Low', 'Low', 'Moderate', 'High', 'Extreme'] as const

export function getTriSeverity(triNorm: number): 0 | 1 | 2 | 3 | 4 {
  if (triNorm < TRI_THRESHOLDS[0]) return 0
  if (triNorm < TRI_THRESHOLDS[1]) return 1
  if (triNorm < TRI_THRESHOLDS[2]) return 2
  if (triNorm < TRI_THRESHOLDS[3]) return 3
  return 4
}

export function triRangeLabel(i: number, elevRange?: number, unitAbbr?: string): string {
  const lo = i === 0 ? 0 : TRI_THRESHOLDS[i - 1]
  const hi = i < TRI_THRESHOLDS.length ? TRI_THRESHOLDS[i] : null
  if (elevRange !== undefined && elevRange > 0) {
    const loVal = Math.round(lo * elevRange)
    const hiVal = hi !== null ? Math.round(hi * elevRange) : null
    const suffix = unitAbbr ? ` ${unitAbbr}` : ''
    return hiVal !== null ? `${loVal}–${hiVal}${suffix}` : `>${loVal}${suffix}`
  }
  return hi !== null ? `${lo}–${hi}` : `>${lo}`
}

export type MapTool = 'none' | 'elevation-flag' | 'slope-arrow' | 'measure-anchor' | 'ruggedness-flag' | 'swamp-marker' | 'road' | 'building'

export type BuildingShape = 'rectangle' | 'circle' | 'bow-sided' | 'apsidal' | 'courtyard' | 'L-shape' | 'U-shape' | 'octagon'

export interface BuildingEntry {
  id: string
  x: number
  y: number
  rotation: number
  widthM: number
  depthM: number
  shape: BuildingShape
  color: string
  opacity: number
  templateId: string
}

export interface BuildingDefaults {
  cultureId: string
  buildingTemplateId: string
  widthM: number
  depthM: number
  rotation: number
  color: string
  opacity: number
}

export const defaultBuildingDefaults: BuildingDefaults = {
  cultureId: 'medieval-europe',
  buildingTemplateId: 'me-cot-md',
  widthM: 5,
  depthM: 11,
  rotation: 0,
  color: '#8B6914',
  opacity: 0.85,
}

export type FrameBorderStyle = 'single' | 'double' | 'cartographic' | 'shadow' | 'ornate'

export type FramePosition =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'right-top'   | 'right-middle'  | 'right-bottom'
  | 'bottom-right'| 'bottom-center' | 'bottom-left'
  | 'left-bottom' | 'left-middle'   | 'left-top'

export interface FrameConfig {
  enabled: boolean
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  marginColor: string
  borderEnabled: boolean
  borderStyle: FrameBorderStyle
  borderColor: string
  borderWidth: number
}

export const defaultFrameConfig: FrameConfig = {
  enabled: false,
  marginTop: 40,
  marginBottom: 40,
  marginLeft: 40,
  marginRight: 40,
  marginColor: '#ffffff',
  borderEnabled: true,
  borderStyle: 'single',
  borderColor: '#2E2412',
  borderWidth: 2,
}

export interface TitleConfig {
  enabled: boolean
  position: FramePosition
  text: string
  font: string
  size: number    // px at screen resolution
  color: string
  bold: boolean
  italic: boolean
}

export const defaultTitleConfig: TitleConfig = {
  enabled: false,
  position: 'top-left',
  text: '',
  font: 'serif',
  size: 24,
  color: '#2E2412',
  bold: false,
  italic: false,
}

export type CompassStyle = 'plain' | 'compass' | 'nautical' | 'celtic' | 'dragon'

export interface LegendConfig {
  enabled: boolean
  position: FramePosition
  columns: number
  fontSize: number
  color: string
  showMinorContour: boolean
  showMajorContour: boolean
  showSeaLevel: boolean
  showElevationFlags: boolean
  showSlopeArrows: boolean
  showGeoAnchor: boolean
  showRuggednessFlags: boolean
  showSwampMarkers: boolean
  showDirtRoads: boolean
  showGravelRoads: boolean
  showPavedRoads: boolean
  showFootpaths: boolean
  showTrails: boolean
  showBuildings: boolean
  buildingLabels: Record<string, string>  // key: `${templateId}::${color}`
  minorLabel: string
  majorLabel: string
  seaLevelLabel: string
  flagLabel: string
  arrowLabel: string
  geoAnchorLabel: string
  ruggednessFlagLabel: string
  swampMarkerLabel: string
  dirtRoadsLabel: string
  gravelRoadsLabel: string
  pavedRoadsLabel: string
  footpathsLabel: string
  trailsLabel: string
}

export const defaultLegendConfig: LegendConfig = {
  enabled: false,
  position: 'bottom-right',
  columns: 1,
  fontSize: 10,
  color: '#2E2412',
  showMinorContour: true,
  showMajorContour: true,
  showSeaLevel: true,
  showElevationFlags: true,
  showSlopeArrows: true,
  showGeoAnchor: true,
  showRuggednessFlags: true,
  showSwampMarkers: true,
  showDirtRoads: true,
  showGravelRoads: true,
  showPavedRoads: true,
  showFootpaths: true,
  showTrails: true,
  showBuildings: true,
  buildingLabels: {},
  minorLabel: 'Minor contour',
  majorLabel: 'Major contour',
  seaLevelLabel: 'Sea level',
  flagLabel: 'Elevation flag',
  arrowLabel: 'Slope angle',
  geoAnchorLabel: 'Geo reference',
  ruggednessFlagLabel: 'Ruggedness index',
  swampMarkerLabel: 'Marsh / Swamp',
  dirtRoadsLabel: 'Dirt road',
  gravelRoadsLabel: 'Gravel road',
  pavedRoadsLabel: 'Paved road',
  footpathsLabel: 'Footpath',
  trailsLabel: 'Trail',
}

export interface CompassConfig {
  enabled: boolean
  compassStyle: CompassStyle
  position: FramePosition
  size: number       // arm length in px (center to arrow tip)
  color: string
  lineWidth: number
  topLabel: string
  rightLabel: string
  bottomLabel: string
  leftLabel: string
  topArrow: boolean
  rightArrow: boolean
  bottomArrow: boolean
  leftArrow: boolean
}

export const defaultCompassConfig: CompassConfig = {
  enabled: false,
  compassStyle: 'plain',
  position: 'bottom-center',
  size: 40,
  color: '#2E2412',
  lineWidth: 1.5,
  topLabel: 'N',
  rightLabel: 'E',
  bottomLabel: 'S',
  leftLabel: 'W',
  topArrow: true,
  rightArrow: true,
  bottomArrow: true,
  leftArrow: true,
}

export interface MeasureBarConfig {
  enabled: boolean
  showTop: boolean
  showBottom: boolean
  showLeft: boolean
  showRight: boolean
  majorInterval: number        // spacing between major ticks in calibration units
  minorDivisions: number       // subdivisions per major interval (1 = no minor ticks)
  tickLength: number           // major tick length in screen px
  minorTickLength: number
  lineWidth: number
  color: string
  fontSize: number
  geoEnabled: boolean
  anchorLat: number            // lat at reference point (degrees)
  anchorLon: number            // lon at reference point
  anchorX: number | null       // heightmap px X; null = left edge (0)
  anchorY: number | null       // heightmap px Y; null = bottom edge (mapH - 1)
  planetRadius: number         // km — Earth = 6371
  horizontalAxisIsLat: boolean // if true, H ticks = latitude axis, V ticks = longitude
}

export const defaultMeasureBarConfig: MeasureBarConfig = {
  enabled: false,
  showTop: false,
  showBottom: true,
  showLeft: true,
  showRight: false,
  majorInterval: 100,
  minorDivisions: 4,
  tickLength: 8,
  minorTickLength: 4,
  lineWidth: 1,
  color: '#2E2412',
  fontSize: 9,
  geoEnabled: false,
  anchorLat: 0,
  anchorLon: 0,
  anchorX: null,
  anchorY: null,
  planetRadius: 6371,
  horizontalAxisIsLat: false,
}

export type GridType = 'measured' | 'square' | 'hex-flat' | 'hex-pointy' | 'hex-rotated'
export type GridLinePattern = 'solid' | 'dashed' | 'dotted' | 'dot-dash'

export interface GridConfig {
  enabled: boolean
  type: GridType
  interval: number          // major interval: real-world units when calibrated, pixels otherwise
  color: string
  opacity: number
  lineWidth: number
  pattern: GridLinePattern
  showMinor: boolean
  minorDivisions: number    // subdivisions per major interval
  minorColor: string
  minorOpacity: number
  minorLineWidth: number
  minorPattern: GridLinePattern
}

export const defaultGridConfig: GridConfig = {
  enabled: false,
  type: 'square',
  interval: 100,
  color: '#555555',
  opacity: 0.3,
  lineWidth: 0.5,
  pattern: 'solid',
  showMinor: false,
  minorDivisions: 4,
  minorColor: '#555555',
  minorOpacity: 0.15,
  minorLineWidth: 0.25,
  minorPattern: 'solid',
}

export interface ProjectState {
  terrainImagePath: string | null
  heightmapPath: string | null
  terrainImageUrl: string | null
  hillshadeImageUrl: string | null
  activeTab: 'terrain' | 'hillshade'
  hillshadeGenerating: boolean
  fileLoadingMessage: string | null
  heightmap: HeightmapInfo | null
  parameters: ContourParameters
  style: ContourStyle
  hillshadeParams: HillshadeParameters
  elevationCalibration: ElevationCalibration
  isDirty: boolean
  hillshadeDirty: boolean
  contoursDirty: boolean
  hillshadeVersion: number
  contoursVersion: number
  contoursGenerating: boolean
  elevationFlags: ElevationFlag[]
  slopeArrows: SlopeArrow[]
  ruggednessFlags: RuggednessFlag[]
  swampMarkers: SwampMarker[]
  ruggednessColorBySeverity: boolean
  ruggednessSeverityColors: string[]
  elevationFlagsVisible: boolean
  slopeArrowsVisible: boolean
  ruggednessFlagsVisible: boolean
  swampMarkersVisible: boolean
  elevationFlagDefaults: MarkerDefaults
  slopeArrowDefaults: MarkerDefaults
  ruggednessFlagDefaults: MarkerDefaults
  swampMarkerDefaults: SwampMarkerDefaults
  roads: Road[]
  roadsVisible: boolean
  roadDefaults: RoadDefaults
  selectedRoadId: string | null
  buildings: BuildingEntry[]
  buildingsVisible: boolean
  buildingDefaults: BuildingDefaults
  mapTool: MapTool
  snapshotParams: ContourParameters | null
  snapshotStyle: ContourStyle | null
  snapshotHillshadeParams: HillshadeParameters | null
  snapshotElevationCalibration: ElevationCalibration | null
  mapZoom: number
  mapDisplaySize: { w: number; h: number } | null
  overlayOnly: boolean
  overlayBrightness: number
  frame: FrameConfig
  title: TitleConfig
  compass: CompassConfig
  legend: LegendConfig
  measureBar: MeasureBarConfig
  grid: GridConfig
}

export const defaultParameters: ContourParameters = {
  interval: 0.05,
  minElevation: 0,
  maxElevation: 1,
  majorEvery: 5,
  smoothing: 0,
}

export const defaultStyle: ContourStyle = {
  minorColor: '#8B7355',
  majorColor: '#5C4A2A',
  labelColor: '#2E2412',
  labelFont: 'serif',
  labelBold: false,
  labelItalic: false,
  minorWidth: 1,
  majorWidth: 2,
  opacity: 0.8,
  showLabels: true,
  labelFontSize: 10,
  showSeaLevel: false,
  seaLevelColor: '#FFFFFF',
  seaLevelWidth: 2,
  seaLevelDash: 'solid',
  showSeaLevelLabel: true,
  seaLevelLabelColor: '#FFFFFF',
  seaLevelLabelFontSize: 10,
}

export const defaultHillshadeParameters: HillshadeParameters = {
  azimuth: 315,
  altitude: 45,
  zFactor: 150,
  verticalExaggeration: 1.0,
  intensity: 3.0,
  brightness: 0.65,
}

// Augment window with the IPC bridge exposed by the preload script
declare global {
  interface Window {
    electronAPI: {
      openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
      readFile: (filePath: string) => Promise<Uint8Array>
      saveFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
      writeFile: (filePath: string, data: Uint8Array) => Promise<void>
    }
  }
}
