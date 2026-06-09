import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  ProjectState, ContourParameters, ContourStyle,
  HeightmapInfo, HillshadeParameters, ElevationCalibration,
  ElevationFlag, SlopeArrow, RuggednessFlag, SwampMarker, MarkerDefaults, SwampMarkerDefaults,
  MapTool, FrameConfig, TitleConfig, CompassConfig, LegendConfig, MeasureBarConfig,
  Road, RoadDefaults, GridConfig, BuildingEntry, BuildingDefaults,
  PoiEntry, PoiNewMarkerState, PrecisionSetting,
} from '../types'
import { defaultParameters, defaultStyle, defaultHillshadeParameters, defaultElevationCalibration, defaultFrameConfig, defaultTitleConfig, defaultCompassConfig, defaultLegendConfig, defaultMeasureBarConfig, TRI_COLORS, defaultRoadDefaults, defaultGridConfig, defaultBuildingDefaults, defaultPoiNewMarkerState } from '../types'

function calToMeters(value: number, cal: ElevationCalibration): number {
  if (cal.unitType === 'feet') return value * 0.3048
  if (cal.unitType === 'meters') return value
  if (cal.unitType === 'custom') {
    return cal.customBase === 'feet'
      ? value * cal.customRatio * 0.3048
      : value * cal.customRatio
  }
  return value
}

function calFromMeters(meters: number, cal: ElevationCalibration): number {
  if (cal.unitType === 'feet') return meters / 0.3048
  if (cal.unitType === 'meters') return meters
  if (cal.unitType === 'custom') {
    return cal.customBase === 'feet'
      ? meters / (cal.customRatio * 0.3048)
      : meters / cal.customRatio
  }
  return meters
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

interface AppActions {
  setTerrainImage: (path: string, url: string) => void
  restoreTerrainImage: (path: string, url: string) => void
  setTerrainHillshade: (url: string) => void
  setHillshadeGenerating: (val: boolean) => void
  setFileLoading: (message: string | null) => void
  setHeightmap: (path: string, info: HeightmapInfo) => void
  updateParameters: (params: Partial<ContourParameters>) => void
  updateStyle: (style: Partial<ContourStyle>) => void
  updateHillshadeParams: (params: Partial<HillshadeParameters>) => void
  updateElevationCalibration: (cal: Partial<ElevationCalibration>) => void
  setElevationUnits: (newType: 'feet' | 'meters' | 'custom', customData?: Partial<ElevationCalibration>) => void
  setHillshadeDirty: (val: boolean) => void
  setContoursDirty: (val: boolean) => void
  setContoursGenerating: (val: boolean) => void
  triggerHillshade: () => void
  triggerContours: () => void
  finalizeCustomConversion: () => void
  addElevationFlag: (flag: ElevationFlag) => void
  updateElevationFlag: (id: string, updates: Partial<Omit<ElevationFlag, 'id'>>) => void
  removeElevationFlag: (id: string) => void
  addSlopeArrow: (arrow: SlopeArrow) => void
  updateSlopeArrow: (id: string, updates: Partial<Omit<SlopeArrow, 'id'>>) => void
  removeSlopeArrow: (id: string) => void
  addRuggednessFlag: (flag: RuggednessFlag) => void
  updateRuggednessFlag: (id: string, updates: Partial<Omit<RuggednessFlag, 'id'>>) => void
  removeRuggednessFlag: (id: string) => void
  setRuggednessColorBySeverity: (val: boolean) => void
  addSwampMarker: (marker: SwampMarker) => void
  updateSwampMarker: (id: string, updates: Partial<Omit<SwampMarker, 'id'>>) => void
  removeSwampMarker: (id: string) => void
  updateElevationFlagDefaults: (d: Partial<MarkerDefaults>) => void
  updateSlopeArrowDefaults: (d: Partial<MarkerDefaults>) => void
  updateRuggednessFlagDefaults: (d: Partial<MarkerDefaults>) => void
  updateSwampMarkerDefaults: (d: Partial<SwampMarkerDefaults>) => void
  setElevationFlagsVisible: (v: boolean) => void
  setSlopeArrowsVisible: (v: boolean) => void
  setRuggednessFlagsVisible: (v: boolean) => void
  setSwampMarkersVisible: (v: boolean) => void
  addRoad: (road: Road) => void
  updateRoad: (id: string, updates: Partial<Omit<Road, 'id'>>) => void
  removeRoad: (id: string) => void
  setRoadsVisible: (v: boolean) => void
  updateRoadDefaults: (d: Partial<RoadDefaults>) => void
  setSelectedRoadId: (id: string | null) => void
  addBuilding: (b: BuildingEntry) => void
  updateBuilding: (id: string, updates: Partial<Omit<BuildingEntry, 'id'>>) => void
  removeBuilding: (id: string) => void
  setBuildingsVisible: (v: boolean) => void
  updateBuildingDefaults: (d: Partial<BuildingDefaults>) => void
  addPoi: (p: PoiEntry) => void
  updatePoi: (id: string, updates: Partial<Omit<PoiEntry, 'id'>>) => void
  removePoi: (id: string) => void
  setPoisVisible: (v: boolean) => void
  updatePoiNewMarker: (d: Partial<PoiNewMarkerState>) => void
  setSelectedPoiId: (id: string | null) => void
  setRuggednessSeverityColor: (index: number, color: string) => void
  setMapTool: (tool: MapTool) => void
  setActiveTab: (tab: 'terrain' | 'hillshade') => void
  setMapZoom: (zoom: number) => void
  setMapDisplaySize: (size: { w: number; h: number } | null) => void
  setOverlayOnly: (val: boolean) => void
  setOverlayBrightness: (brightness: number) => void
  updateFrame: (f: Partial<FrameConfig>) => void
  updateTitle: (t: Partial<TitleConfig>) => void
  updateCompass: (c: Partial<CompassConfig>) => void
  updateLegend: (l: Partial<LegendConfig>) => void
  updateMeasureBar: (m: Partial<MeasureBarConfig>) => void
  updateGrid: (updates: Partial<GridConfig>) => void
  setPrecisionSetting: (s: PrecisionSetting) => void
  setSagittalExceptionAcknowledged: (v: boolean) => void
  clearPendingChanges: () => void
  markClean: () => void
  reset: () => void
}

const initialState: ProjectState = {
  terrainImagePath: null,
  heightmapPath: null,
  terrainImageUrl: null,
  hillshadeImageUrl: null,
  activeTab: 'hillshade',
  hillshadeGenerating: false,
  fileLoadingMessage: null,
  heightmap: null,
  parameters: defaultParameters,
  style: defaultStyle,
  hillshadeParams: defaultHillshadeParameters,
  elevationCalibration: defaultElevationCalibration,
  isDirty: false,
  hillshadeDirty: false,
  contoursDirty: false,
  hillshadeVersion: 0,
  contoursVersion: 0,
  contoursGenerating: false,
  elevationFlags: [],
  slopeArrows: [],
  ruggednessFlags: [],
  swampMarkers: [],
  ruggednessColorBySeverity: true,
  ruggednessSeverityColors: [...TRI_COLORS],
  elevationFlagsVisible: true,
  slopeArrowsVisible: true,
  ruggednessFlagsVisible: true,
  swampMarkersVisible: true,
  elevationFlagDefaults: { boldness: 2, opacity: 1 },
  slopeArrowDefaults: { boldness: 2, opacity: 1 },
  ruggednessFlagDefaults: { boldness: 2, opacity: 1 },
  swampMarkerDefaults: { boldness: 2, opacity: 1, color: '#388E3C' },
  roads: [],
  roadsVisible: true,
  roadDefaults: defaultRoadDefaults,
  selectedRoadId: null,
  buildings: [],
  buildingsVisible: true,
  buildingDefaults: defaultBuildingDefaults,
  pois: [],
  poisVisible: true,
  poiNewMarker: defaultPoiNewMarkerState,
  selectedPoiId: null,
  mapTool: 'none',
  snapshotParams: null,
  snapshotStyle: null,
  snapshotHillshadeParams: null,
  snapshotElevationCalibration: null,
  mapZoom: 100,
  mapDisplaySize: null,
  overlayOnly: false,
  overlayBrightness: 0.65,
  frame: defaultFrameConfig,
  title: defaultTitleConfig,
  compass: defaultCompassConfig,
  legend: defaultLegendConfig,
  measureBar: defaultMeasureBarConfig,
  grid: defaultGridConfig,
  precisionSetting: 'medium' as PrecisionSetting,
  sagittalExceptionAcknowledged: false,
}

export const useStore = create<ProjectState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setTerrainImage: (path, url) =>
        set({ terrainImagePath: path, terrainImageUrl: url, isDirty: true, activeTab: 'terrain' }),

      // Restore path: sets URL without forcing activeTab to 'terrain'
      restoreTerrainImage: (path, url) =>
        set({ terrainImagePath: path, terrainImageUrl: url }),

      setTerrainHillshade: (url) =>
        set({ hillshadeImageUrl: url, hillshadeGenerating: false, isDirty: true }),

      setHillshadeGenerating: (val) =>
        set({ hillshadeGenerating: val }),

      setFileLoading: (message) =>
        set({ fileLoadingMessage: message }),

      setHeightmap: (path, info) =>
        set((state) => ({
          heightmapPath: path,
          heightmap: info,
          isDirty: true,
          contoursVersion: state.contoursVersion + 1,
          hillshadeVersion: state.hillshadeVersion + 1,
          hillshadeDirty: false,
          contoursDirty: false,
          activeTab: state.terrainImageUrl ? state.activeTab : 'hillshade',
          snapshotParams: state.parameters,
          snapshotStyle: state.style,
          snapshotHillshadeParams: state.hillshadeParams,
          snapshotElevationCalibration: state.elevationCalibration,
        })),

      updateParameters: (params) =>
        set((state) => ({
          parameters: { ...state.parameters, ...params },
          isDirty: true,
          contoursDirty: true,
        })),

      updateStyle: (style) =>
        set((state) => ({
          style: { ...state.style, ...style },
          isDirty: true,
        })),

      updateHillshadeParams: (params) =>
        set((state) => ({
          hillshadeParams: { ...state.hillshadeParams, ...params },
          ...(state.heightmap ? { hillshadeDirty: true } : {}),
        })),

      updateElevationCalibration: (cal) =>
        set((state) => {
          const affectsHillshade = 'realMin' in cal || 'realMax' in cal || 'mapWidth' in cal
          return {
            elevationCalibration: { ...state.elevationCalibration, ...cal },
            isDirty: true,
            contoursDirty: true,
            ...('mapWidth' in cal ? { sagittalExceptionAcknowledged: false } : {}),
            ...(state.heightmap && affectsHillshade ? { hillshadeDirty: true } : {}),
          }
        }),

      setElevationUnits: (newType, customData) => {
        const { elevationCalibration: old, heightmap } = get()
        const merged: ElevationCalibration = { ...old, ...customData, unitType: newType }

        let newRealMin = old.realMin
        let newRealMax = old.realMax
        let newRealInterval = old.realInterval
        let newMapWidth = old.mapWidth

        if (newType === 'custom') {
          merged.preCustomUnit = (old.unitType === 'feet' || old.unitType === 'meters')
            ? old.unitType
            : null
        } else if (old.unitType && old.unitType !== newType) {
          if (old.realMin !== null && old.realMax !== null) {
            const minM = calToMeters(old.realMin, old)
            const maxM = calToMeters(old.realMax, old)
            newRealMin = round1(calFromMeters(minM, merged))
            newRealMax = round1(calFromMeters(maxM, merged))
          }
          if (old.realInterval !== null) {
            const intervalM = calToMeters(old.realInterval, old)
            newRealInterval = Math.max(1, Math.round(calFromMeters(intervalM, merged)))
          }
          if (old.mapWidth !== null) {
            const widthM = calToMeters(old.mapWidth, old)
            newMapWidth = round1(calFromMeters(widthM, merged))
          }
        }

        const preCustomUnit = newType === 'custom' ? merged.preCustomUnit : null

        set({
          elevationCalibration: { ...merged, realMin: newRealMin, realMax: newRealMax, realInterval: newRealInterval, mapWidth: newMapWidth, preCustomUnit },
          isDirty: true,
          contoursDirty: true,
          ...(heightmap ? { hillshadeDirty: true } : {}),
        })
      },

      setHillshadeDirty: (val) => set({ hillshadeDirty: val }),

      setContoursDirty: (val) => set({ contoursDirty: val }),

      setContoursGenerating: (val) => set({ contoursGenerating: val }),

      triggerHillshade: () =>
        set((state) => ({
          hillshadeVersion: state.hillshadeVersion + 1,
          hillshadeDirty: false,
          snapshotParams: state.parameters,
          snapshotStyle: state.style,
          snapshotHillshadeParams: state.hillshadeParams,
          snapshotElevationCalibration: state.elevationCalibration,
        })),

      triggerContours: () =>
        set((state) => ({
          contoursVersion: state.contoursVersion + 1,
          contoursDirty: false,
          contoursGenerating: true,
          snapshotParams: state.parameters,
          snapshotStyle: state.style,
          snapshotHillshadeParams: state.hillshadeParams,
          snapshotElevationCalibration: state.elevationCalibration,
        })),

      finalizeCustomConversion: () => {
        const { elevationCalibration: cal, heightmap } = get()
        if (cal.unitType !== 'custom' || cal.preCustomUnit === null || cal.customRatio <= 0) return

        const src: ElevationCalibration = { ...cal, unitType: cal.preCustomUnit }
        const conv = (v: number | null): number | null =>
          v !== null ? round1(calFromMeters(calToMeters(v, src), cal)) : null
        const convInterval = (v: number | null): number | null =>
          v !== null ? Math.max(1, Math.round(calFromMeters(calToMeters(v, src), cal))) : null

        set({
          elevationCalibration: {
            ...cal,
            realMin: conv(cal.realMin),
            realMax: conv(cal.realMax),
            mapWidth: conv(cal.mapWidth),
            realInterval: convInterval(cal.realInterval),
            preCustomUnit: null,
          },
          isDirty: true,
          contoursDirty: true,
          ...(heightmap ? { hillshadeDirty: true } : {}),
        })
      },

      addElevationFlag: (flag) =>
        set((state) => ({ elevationFlags: [...state.elevationFlags, flag], isDirty: true })),

      updateElevationFlag: (id, updates) =>
        set((state) => ({
          elevationFlags: state.elevationFlags.map((f) => f.id === id ? { ...f, ...updates } : f),
          isDirty: true,
        })),

      removeElevationFlag: (id) =>
        set((state) => ({
          elevationFlags: state.elevationFlags.filter((f) => f.id !== id),
          isDirty: true,
        })),

      addSlopeArrow: (arrow) =>
        set((state) => ({ slopeArrows: [...state.slopeArrows, arrow], isDirty: true })),

      updateSlopeArrow: (id, updates) =>
        set((state) => ({
          slopeArrows: state.slopeArrows.map((a) => a.id === id ? { ...a, ...updates } : a),
          isDirty: true,
        })),

      removeSlopeArrow: (id) =>
        set((state) => ({
          slopeArrows: state.slopeArrows.filter((a) => a.id !== id),
          isDirty: true,
        })),

      addRuggednessFlag: (flag) =>
        set((state) => ({ ruggednessFlags: [...state.ruggednessFlags, flag], isDirty: true })),

      updateRuggednessFlag: (id, updates) =>
        set((state) => ({
          ruggednessFlags: state.ruggednessFlags.map((f) => f.id === id ? { ...f, ...updates } : f),
          isDirty: true,
        })),

      removeRuggednessFlag: (id) =>
        set((state) => ({
          ruggednessFlags: state.ruggednessFlags.filter((f) => f.id !== id),
          isDirty: true,
        })),

      setRuggednessColorBySeverity: (val) => set({ ruggednessColorBySeverity: val }),

      addSwampMarker: (marker) =>
        set((state) => ({ swampMarkers: [...state.swampMarkers, marker], isDirty: true })),

      updateSwampMarker: (id, updates) =>
        set((state) => ({
          swampMarkers: state.swampMarkers.map((m) => m.id === id ? { ...m, ...updates } : m),
          isDirty: true,
        })),

      removeSwampMarker: (id) =>
        set((state) => ({
          swampMarkers: state.swampMarkers.filter((m) => m.id !== id),
          isDirty: true,
        })),

      updateElevationFlagDefaults: (d) =>
        set((state) => ({ elevationFlagDefaults: { ...state.elevationFlagDefaults, ...d } })),

      updateSlopeArrowDefaults: (d) =>
        set((state) => ({ slopeArrowDefaults: { ...state.slopeArrowDefaults, ...d } })),

      updateRuggednessFlagDefaults: (d) =>
        set((state) => ({ ruggednessFlagDefaults: { ...state.ruggednessFlagDefaults, ...d } })),

      updateSwampMarkerDefaults: (d) =>
        set((state) => ({
          swampMarkerDefaults: { ...state.swampMarkerDefaults, ...d },
          ...(d.color !== undefined
            ? { swampMarkers: state.swampMarkers.map((m) => ({ ...m, color: d.color! })) }
            : {}),
        })),

      setElevationFlagsVisible: (v) => set({ elevationFlagsVisible: v }),
      setSlopeArrowsVisible: (v) => set({ slopeArrowsVisible: v }),
      setRuggednessFlagsVisible: (v) => set({ ruggednessFlagsVisible: v }),
      setSwampMarkersVisible: (v) => set({ swampMarkersVisible: v }),

      addRoad: (road) => set((state) => ({ roads: [...state.roads, road], isDirty: true })),
      updateRoad: (id, updates) => set((state) => ({
        roads: state.roads.map((r) => r.id === id ? { ...r, ...updates } : r), isDirty: true,
      })),
      removeRoad: (id) => set((state) => ({
        roads: state.roads.filter((r) => r.id !== id), isDirty: true,
        selectedRoadId: state.selectedRoadId === id ? null : state.selectedRoadId,
      })),
      setRoadsVisible: (v) => set({ roadsVisible: v }),
      updateRoadDefaults: (d) => set((state) => ({ roadDefaults: { ...state.roadDefaults, ...d } })),
      setSelectedRoadId: (id) => set({ selectedRoadId: id }),

      addBuilding: (b) => set((state) => ({ buildings: [...state.buildings, b], isDirty: true })),
      updateBuilding: (id, updates) => set((state) => ({
        buildings: state.buildings.map((b) => b.id === id ? { ...b, ...updates } : b), isDirty: true,
      })),
      removeBuilding: (id) => set((state) => ({
        buildings: state.buildings.filter((b) => b.id !== id), isDirty: true,
      })),
      setBuildingsVisible: (v) => set({ buildingsVisible: v }),
      updateBuildingDefaults: (d) => set((state) => ({ buildingDefaults: { ...state.buildingDefaults, ...d } })),

      addPoi: (p) => set((state) => ({ pois: [...state.pois, p], isDirty: true })),
      updatePoi: (id, updates) => set((state) => ({
        pois: state.pois.map((p) => p.id === id ? { ...p, ...updates } : p), isDirty: true,
      })),
      removePoi: (id) => set((state) => ({
        pois: state.pois.filter((p) => p.id !== id), isDirty: true,
        selectedPoiId: state.selectedPoiId === id ? null : state.selectedPoiId,
      })),
      setPoisVisible: (v) => set({ poisVisible: v }),
      updatePoiNewMarker: (d) => set((state) => ({ poiNewMarker: { ...state.poiNewMarker, ...d } })),
      setSelectedPoiId: (id) => set({ selectedPoiId: id }),

      setRuggednessSeverityColor: (index, color) =>
        set((state) => ({
          ruggednessSeverityColors: state.ruggednessSeverityColors.map((c, i) => i === index ? color : c),
        })),

      setMapTool: (tool) => set({ mapTool: tool }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      setMapZoom: (zoom) => set({ mapZoom: zoom }),

      setMapDisplaySize: (size) => set({ mapDisplaySize: size }),

      setOverlayOnly: (val) => set({ overlayOnly: val }),

      setOverlayBrightness: (brightness) => set({ overlayBrightness: brightness }),

      updateFrame: (f) =>
        set((state) => ({ frame: { ...state.frame, ...f } })),

      updateTitle: (t) =>
        set((state) => ({ title: { ...state.title, ...t } })),

      updateCompass: (c) =>
        set((state) => ({ compass: { ...state.compass, ...c } })),

      updateLegend: (l) =>
        set((state) => ({ legend: { ...state.legend, ...l } })),

      updateMeasureBar: (m) =>
        set((state) => ({ measureBar: { ...state.measureBar, ...m } })),

      updateGrid: (updates) =>
        set((s) => ({ grid: { ...s.grid, ...updates } })),

      setPrecisionSetting: (s) =>
        set({ precisionSetting: s, sagittalExceptionAcknowledged: false }),

      setSagittalExceptionAcknowledged: (v) =>
        set({ sagittalExceptionAcknowledged: v }),

      clearPendingChanges: () =>
        set((state) => ({
          parameters: state.snapshotParams ?? state.parameters,
          style: state.snapshotStyle ?? state.style,
          hillshadeParams: state.snapshotHillshadeParams ?? state.hillshadeParams,
          elevationCalibration: state.snapshotElevationCalibration ?? state.elevationCalibration,
          hillshadeDirty: false,
          contoursDirty: false,
        })),

      markClean: () => set({ isDirty: false }),

      reset: () => {
        localStorage.removeItem('topocrafter-state')
        set(initialState)
      },
    }),
    {
      name: 'topocrafter-state',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: unknown, version: number) => {
        const ps = persistedState as Record<string, unknown>
        if (version < 1) {
          // Migrate PoiEntry objects: old fields → new unified fields
          if (Array.isArray(ps.pois)) {
            ps.pois = (ps.pois as Record<string, unknown>[]).map((p) => {
              if ('type' in p && !('typeId' in p)) {
                return {
                  id: p.id, x: p.x, y: p.y,
                  typeId: p.type,
                  color: (p.color as string) ?? '#2C2C2C',
                  sizeM: (p.mineSize as number) ?? (p.caveSize as number) ?? 8,
                  strokeWeight: (p.bridgeStrokeWeight as number) ?? 2.5,
                  bridgeLengthM: p.bridgeLength,
                  bridgeSeparationM: p.bridgeSeparation,
                  bridgeRotation: p.bridgeRotation,
                  fontFamily: p.caveFontFamily,
                  label: p.label,
                  labelColor: p.labelColor,
                  labelSizeM: p.labelSizeM,
                  labelFontFamily: p.labelFontFamily,
                }
              }
              return p
            })
          }
          // Migrate poiDefaults → poiNewMarker
          if (ps.poiDefaults && !ps.poiNewMarker) {
            const d = ps.poiDefaults as Record<string, unknown>
            ps.poiNewMarker = {
              typeId: (d.type as string) ?? 'mine',
              color: (d.mineColor as string) ?? '#2C2C2C',
              sizeM: (d.mineSizeM as number) ?? 8,
              strokeWeight: (d.bridgeStrokeWeight as number) ?? 1.5,
              bridgeLengthM: (d.bridgeLengthM as number) ?? 30,
              bridgeSeparationM: (d.bridgeSeparationM as number) ?? 6,
              bridgeRotation: (d.bridgeRotation as number) ?? 0,
              fontFamily: (d.caveFontFamily as string) ?? 'serif',
              label: (d.label as string) ?? '',
              labelColor: (d.labelColor as string) ?? '#2E2412',
              labelSizeM: (d.labelSizeM as number) ?? 8,
              labelFontFamily: (d.labelFontFamily as string) ?? 'serif',
            }
            delete ps.poiDefaults
          }
        }
        if (version < 2) {
          // New fields — defaults applied via merge()
          ps.precisionSetting = ps.precisionSetting ?? 'medium'
          ps.sagittalExceptionAcknowledged = ps.sagittalExceptionAcknowledged ?? false
        }
        return ps
      },
      // Deep-merge so that new fields added to nested config objects (legend, frame, etc.)
      // are backfilled from defaults when loading an older persisted state.
      merge: (persisted, current) => {
        const ps = persisted as Partial<ProjectState>
        const merge = <T extends object>(def: T, stored: Partial<T> | undefined): T =>
          stored ? { ...def, ...stored } : def
        return {
          ...current,
          ...ps,
          parameters:             merge(current.parameters,             ps.parameters),
          style:                  merge(current.style,                  ps.style),
          hillshadeParams:        merge(current.hillshadeParams,        ps.hillshadeParams),
          elevationCalibration:   merge(current.elevationCalibration,   ps.elevationCalibration),
          frame:                  merge(current.frame,                  ps.frame),
          title:                  merge(current.title,                  ps.title),
          compass:                merge(current.compass,                ps.compass),
          legend:                 merge(current.legend,                 ps.legend),
          measureBar:             merge(current.measureBar,             ps.measureBar),
          elevationFlagDefaults:  merge(current.elevationFlagDefaults,  ps.elevationFlagDefaults),
          slopeArrowDefaults:     merge(current.slopeArrowDefaults,     ps.slopeArrowDefaults),
          ruggednessFlagDefaults: merge(current.ruggednessFlagDefaults, ps.ruggednessFlagDefaults),
          swampMarkerDefaults:    merge(current.swampMarkerDefaults,    ps.swampMarkerDefaults),
          roadDefaults:           merge(current.roadDefaults,           ps.roadDefaults),
          buildingDefaults:       merge(current.buildingDefaults,       ps.buildingDefaults),
          poiNewMarker:           merge(current.poiNewMarker,           ps.poiNewMarker),
          grid:                   merge(current.grid,                   ps.grid),
          precisionSetting:              ps.precisionSetting              ?? current.precisionSetting,
          sagittalExceptionAcknowledged: ps.sagittalExceptionAcknowledged ?? current.sagittalExceptionAcknowledged,
        }
      },
      partialize: (state) => ({
        heightmapPath: state.heightmapPath,
        terrainImagePath: state.terrainImagePath,
        parameters: state.parameters,
        style: state.style,
        hillshadeParams: state.hillshadeParams,
        elevationCalibration: state.elevationCalibration,
        activeTab: state.activeTab,
        mapZoom: state.mapZoom,
        overlayOnly: state.overlayOnly,
        overlayBrightness: state.overlayBrightness,
        frame: state.frame,
        title: state.title,
        compass: state.compass,
        legend: state.legend,
        measureBar: state.measureBar,
        elevationFlags: state.elevationFlags,
        slopeArrows: state.slopeArrows,
        ruggednessFlags: state.ruggednessFlags,
        swampMarkers: state.swampMarkers,
        ruggednessColorBySeverity: state.ruggednessColorBySeverity,
        ruggednessSeverityColors: state.ruggednessSeverityColors,
        elevationFlagsVisible: state.elevationFlagsVisible,
        slopeArrowsVisible: state.slopeArrowsVisible,
        ruggednessFlagsVisible: state.ruggednessFlagsVisible,
        swampMarkersVisible: state.swampMarkersVisible,
        elevationFlagDefaults: state.elevationFlagDefaults,
        slopeArrowDefaults: state.slopeArrowDefaults,
        ruggednessFlagDefaults: state.ruggednessFlagDefaults,
        swampMarkerDefaults: state.swampMarkerDefaults,
        roads: state.roads,
        roadsVisible: state.roadsVisible,
        roadDefaults: state.roadDefaults,
        buildings: state.buildings,
        buildingsVisible: state.buildingsVisible,
        buildingDefaults: state.buildingDefaults,
        pois: state.pois,
        poisVisible: state.poisVisible,
        poiNewMarker: state.poiNewMarker,
        grid: state.grid,
        precisionSetting: state.precisionSetting,
        sagittalExceptionAcknowledged: state.sagittalExceptionAcknowledged,
      }),
    }
  )
)
