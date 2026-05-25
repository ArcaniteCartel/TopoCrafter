import { createTheme } from '@mantine/core'
import type { CSSVariablesResolver } from '@mantine/core'

export interface AppTheme {
  id: string
  name: string
  description: string
  colorScheme: 'light' | 'dark'
  previewColors: [string, string, string]
  mantineTheme: ReturnType<typeof createTheme>
  cssVariablesResolver: CSSVariablesResolver
}

export const THEMES: AppTheme[] = [
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Antique atlas — warm yellowed paper',
    colorScheme: 'light',
    previewColors: ['#f2e5c8', '#c2762a', '#3d2b1f'],
    mantineTheme: createTheme({
      primaryColor: 'orange',
      defaultRadius: 'sm',
      fontFamily: 'Georgia, serif',
    }),
    cssVariablesResolver: () => ({
      variables: {},
      light: {
        '--mantine-color-body': '#f2e5c8',
        '--mantine-color-gray-0': '#f8f0e0',
        '--mantine-color-gray-1': '#f0e4ca',
        '--mantine-color-gray-2': '#e6d8b8',
        '--mantine-color-gray-3': '#d8c8a0',
        '--mantine-color-gray-4': '#c4b088',
      },
      dark: {},
    }),
  },
  {
    id: 'nautical',
    name: 'Nautical',
    description: 'Maritime hydrographic chart — deep ocean navy',
    colorScheme: 'dark',
    previewColors: ['#0c1a2e', '#0e7490', '#b8d4e8'],
    mantineTheme: createTheme({
      primaryColor: 'cyan',
      defaultRadius: 'sm',
    }),
    cssVariablesResolver: () => ({
      variables: {},
      light: {},
      dark: {
        '--mantine-color-body': '#0c1a2e',
        '--mantine-color-dark-9': '#060d1a',
        '--mantine-color-dark-8': '#08101e',
        '--mantine-color-dark-7': '#0c1a2e',
        '--mantine-color-dark-6': '#14283f',
        '--mantine-color-dark-5': '#1a304e',
        '--mantine-color-dark-4': '#234060',
        '--mantine-color-dark-3': '#305878',
        '--mantine-color-dark-2': '#5a8aaa',
        '--mantine-color-dark-1': '#9ac0d8',
        '--mantine-color-dark-0': '#d0e8f4',
      },
    }),
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Default dark workbench — the original TopoCrafter look',
    colorScheme: 'dark',
    previewColors: ['#1a1b1e', '#0d9488', '#a6a7ab'],
    mantineTheme: createTheme({
      primaryColor: 'teal',
      defaultRadius: 'sm',
    }),
    cssVariablesResolver: () => ({
      variables: {},
      light: {},
      dark: {},
    }),
  },
  {
    id: 'survey',
    name: 'Survey',
    description: 'USGS topo survey — military field map',
    colorScheme: 'dark',
    previewColors: ['#111a09', '#4d7c0f', '#a8c890'],
    mantineTheme: createTheme({
      primaryColor: 'lime',
      defaultRadius: 'sm',
    }),
    cssVariablesResolver: () => ({
      variables: {},
      light: {},
      dark: {
        '--mantine-color-body': '#111a09',
        '--mantine-color-dark-9': '#080e05',
        '--mantine-color-dark-8': '#0c1408',
        '--mantine-color-dark-7': '#111a09',
        '--mantine-color-dark-6': '#182610',
        '--mantine-color-dark-5': '#1e3014',
        '--mantine-color-dark-4': '#263d18',
        '--mantine-color-dark-3': '#325020',
        '--mantine-color-dark-2': '#587838',
        '--mantine-color-dark-1': '#8cb060',
        '--mantine-color-dark-0': '#bcd898',
      },
    }),
  },
]

export const DEFAULT_THEME_ID = 'nautical'

export function getThemeById(id: string): AppTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[1]
}
