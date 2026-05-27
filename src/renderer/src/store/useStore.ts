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
  triggerHillshade: () => void
  triggerContours: () => void
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
      hillshadeDirty: true,
    })),

  updateElevationCalibration: (cal) =>
    set((state) => ({
      elevationCalibration: { ...state.elevationCalibration, ...cal },
      isDirty: true,
      contoursDirty: true,
    })),

  setElevationUnits: (newType, customData) => {
    const { elevationCalibration: old } = get()
    const merged: ElevationCalibration = { ...old, ...customData, unitType: newType }

    let newRealMin = old.realMin
    let newRealMax = old.realMax
    let newRealInterval = old.realInterval
    if (old.unitType && old.unitType !== newType) {
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
    }

    set({
      elevationCalibration: { ...merged, realMin: newRealMin, realMax: newRealMax, realInterval: newRealInterval },
      isDirty: true,
      contoursDirty: true,
    })
  },

  setHillshadeDirty: (val) => set({ hillshadeDirty: val }),

  setContoursDirty: (val) => set({ contoursDirty: val }),

  triggerHillshade: () =>
    set((state) => ({
      hillshadeVersion: state.hillshadeVersion + 1,
      hillshadeDirty: false,
    })),

  triggerContours: () =>
    set((state) => ({
      contoursVersion: state.contoursVersion + 1,
      contoursDirty: false,
    })),

  markClean: () => set({ isDirty: false }),

  reset: () => set(initialState),
}))
