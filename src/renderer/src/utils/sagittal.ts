import type { PrecisionSetting } from '../types'

export type { PrecisionSetting }

export const PRECISION_CAPS: Record<PrecisionSetting, number> = {
  high: 2,
  medium: 10,
  low: 30,
}

export const PRECISION_LABELS: Record<PrecisionSetting, string> = {
  high: 'High — ≤ 2 m',
  medium: 'Medium — ≤ 10 m',
  low: 'Low — ≤ 30 m',
}

export function computeSagittalErrorM(
  mapWidthUnits: number,
  pixelW: number,
  pixelH: number,
  unitType: 'feet' | 'meters' | 'custom' | null,
  planetRadiusKm: number
): number | null {
  let widthM: number
  if (unitType === 'feet') widthM = mapWidthUnits * 0.3048
  else if (unitType === 'meters') widthM = mapWidthUnits
  else return null
  const heightM = widthM * (pixelH / pixelW)
  const D = Math.sqrt(widthM * widthM + heightM * heightM)
  const R = planetRadiusKm * 1000
  const half = D / 2
  if (half >= R) return null
  return R - Math.sqrt(R * R - half * half)
}

// Returns a Mantine color token
export function sagittalColor(errorM: number): string {
  if (errorM <= 2) return 'green.7'
  if (errorM <= 10) return 'yellow.7'
  if (errorM <= 30) return 'orange.7'
  return 'red.7'
}

export function formatSagittalError(errorM: number): string {
  if (errorM < 100) return `${errorM.toFixed(1)} m`
  if (errorM < 1000) return `${Math.round(errorM)} m`
  return `${(errorM / 1000).toFixed(2)} km`
}
