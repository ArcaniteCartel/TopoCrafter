import { create } from 'zustand'
import { DEFAULT_THEME_ID, getThemeById, type AppTheme } from '../themes'

interface ThemeState {
  themeId: string
  theme: AppTheme
  setTheme: (id: string) => void
}

const STORAGE_KEY = 'topocrafter-theme'
const savedId = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID

export const useThemeStore = create<ThemeState>((set) => ({
  themeId: savedId,
  theme: getThemeById(savedId),
  setTheme: (id) => {
    localStorage.setItem(STORAGE_KEY, id)
    set({ themeId: id, theme: getThemeById(id) })
  },
}))
