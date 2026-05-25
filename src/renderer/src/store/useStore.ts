import { create } from 'zustand'
import type {
  ProjectState, ContourParameters, ContourStyle,
  HeightmapInfo, HillshadeParameters,
} from '../types'
import { defaultParameters, defaultStyle, defaultHillshadeParameters } from '../types'

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
  isDirty: false,
}

export const useStore = create<ProjectState & AppActions>((set) => ({
  ...initialState,

  setTerrainImage: (path, url) =>
    set({ terrainImagePath: path, terrainImageUrl: url, terrainIsHillshade: false, hillshadeGenerating: false, isDirty: true }),

  setTerrainHillshade: (url) =>
    set({ terrainImageUrl: url, terrainIsHillshade: true, hillshadeGenerating: false, isDirty: true }),

  setTerrainIsHillshade: (val) =>
    set({ terrainIsHillshade: val, hillshadeGenerating: val }),

  setHillshadeGenerating: (val) =>
    set({ hillshadeGenerating: val }),

  setFileLoading: (message) =>
    set({ fileLoadingMessage: message }),

  setHeightmap: (path, info) =>
    set({ heightmapPath: path, heightmap: info, isDirty: true }),

  updateParameters: (params) =>
    set((state) => ({
      parameters: { ...state.parameters, ...params },
      isDirty: true,
    })),

  updateStyle: (style) =>
    set((state) => ({
      style: { ...state.style, ...style },
      isDirty: true,
    })),

  updateHillshadeParams: (params) =>
    set((state) => ({
      hillshadeParams: { ...state.hillshadeParams, ...params },
    })),

  markClean: () => set({ isDirty: false }),

  reset: () => set(initialState),
}))
