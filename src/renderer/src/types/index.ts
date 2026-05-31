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
}

export interface SlopeArrow {
  id: string
  x: number
  y: number
  angleDeg: number  // direction of steepest ascent in SVG coordinate space
  slopeDeg: number  // slope angle from horizontal in degrees (label value)
}

export type MapTool = 'none' | 'elevation-flag' | 'slope-arrow'

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
  mapTool: MapTool
  snapshotParams: ContourParameters | null
  snapshotStyle: ContourStyle | null
  snapshotHillshadeParams: HillshadeParameters | null
  snapshotElevationCalibration: ElevationCalibration | null
  mapZoom: number
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
