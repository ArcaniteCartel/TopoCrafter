import { create } from 'zustand'
import type {
  ProjectState, ContourParameters, ContourStyle,
  HeightmapInfo, HillshadeParameters, ElevationCalibration,
} from '../types'
import { defaultParameters, defaultStyle, defaultHillshadeParameters, defaultElevationCalibration } from '../types'

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
  setTerrainHillshade: (url: string) => void
  setTerrainIsHillshade: (val: boolean) => void
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
  markClean: () => void
  reset: () => void
}

const initialState: ProjectState = {
  terrainImagePath: null,
  heightmapPath: null,
  terrainImageUrl: null,
  terrainIsHillshade: false,
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
}

export const useStore = create<ProjectState & AppActions>((set, get) => ({
  ...initialState,

  setTerrainImage: (path, url) =>
    set({ terrainImagePath: path, terrainImageUrl: url, terrainIsHillshade: false, hillshadeGenerating: false, isDirty: true }),

  setTerrainHillshade: (url) =>
    set({ terrainImageUrl: url, terrainIsHillshade: true, hillshadeGenerating: false, isDirty: true }),

  setTerrainIsHillshade: (val) =>
    set((state) => ({
      terrainIsHillshade: val,
      hillshadeGenerating: val,
      ...(val ? { hillshadeVersion: state.hillshadeVersion + 1 } : {}),
    })),

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
      ...(state.terrainIsHillshade ? { hillshadeDirty: true } : {}),
    })),

  updateElevationCalibration: (cal) =>
    set((state) => {
      const affectsHillshade = 'realMin' in cal || 'realMax' in cal || 'mapWidth' in cal
      return {
        elevationCalibration: { ...state.elevationCalibration, ...cal },
        isDirty: true,
        contoursDirty: true,
        ...(state.terrainIsHillshade && affectsHillshade ? { hillshadeDirty: true } : {}),
      }
    }),

  setElevationUnits: (newType, customData) => {
    const { elevationCalibration: old, terrainIsHillshade } = get()
    const merged: ElevationCalibration = { ...old, ...customData, unitType: newType }

    let newRealMin = old.realMin
    let newRealMax = old.realMax
    let newRealInterval = old.realInterval
    let newMapWidth = old.mapWidth

    if (newType === 'custom') {
      // Keep existing values — they'll be converted once the user enters the ratio (onBlur).
      // Record the source unit so finalizeCustomConversion knows how to convert.
      merged.preCustomUnit = (old.unitType === 'feet' || old.unitType === 'meters')
        ? old.unitType
        : null
    } else if (old.unitType && old.unitType !== newType) {
      // Known-to-known conversion (feet ↔ meters, or custom → feet/meters)
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

    // When switching away from custom, clear the pending-conversion flag
    const preCustomUnit = newType === 'custom' ? merged.preCustomUnit : null

    set({
      elevationCalibration: { ...merged, realMin: newRealMin, realMax: newRealMax, realInterval: newRealInterval, mapWidth: newMapWidth, preCustomUnit },
      isDirty: true,
      contoursDirty: true,
      ...(terrainIsHillshade ? { hillshadeDirty: true } : {}),
    })
  },

  setHillshadeDirty: (val) => set({ hillshadeDirty: val }),

  setContoursDirty: (val) => set({ contoursDirty: val }),

  setContoursGenerating: (val) => set({ contoursGenerating: val }),

  triggerHillshade: () =>
    set((state) => ({
      hillshadeVersion: state.hillshadeVersion + 1,
      hillshadeDirty: false,
    })),

  triggerContours: () =>
    set((state) => ({
      contoursVersion: state.contoursVersion + 1,
      contoursDirty: false,
      contoursGenerating: true,
    })),

  finalizeCustomConversion: () => {
    const { elevationCalibration: cal, terrainIsHillshade } = get()
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
      ...(terrainIsHillshade ? { hillshadeDirty: true } : {}),
    })
  },

  markClean: () => set({ isDirty: false }),

  reset: () => set(initialState),
}))
