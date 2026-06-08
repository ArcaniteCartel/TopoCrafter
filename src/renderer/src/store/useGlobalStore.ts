import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CustomMarkerDef } from '../types'

interface GlobalState {
  customMarkerDefs: CustomMarkerDef[]
}

interface GlobalActions {
  addCustomMarkerDef: (def: CustomMarkerDef) => void
  removeCustomMarkerDef: (id: string) => void
}

export const useGlobalStore = create<GlobalState & GlobalActions>()(
  persist(
    (set) => ({
      customMarkerDefs: [],
      addCustomMarkerDef: (def) =>
        set((s) => ({ customMarkerDefs: [...s.customMarkerDefs, def] })),
      removeCustomMarkerDef: (id) =>
        set((s) => ({ customMarkerDefs: s.customMarkerDefs.filter((d) => d.id !== id) })),
    }),
    {
      name: 'topocrafter-global',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
