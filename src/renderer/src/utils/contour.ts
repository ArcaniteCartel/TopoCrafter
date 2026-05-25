import { contours } from 'd3-contour'
import type { ContourMultiPolygon } from 'd3-contour'
import type { HeightmapInfo, ContourParameters } from '../types'

export interface ContourSet {
  paths: ContourMultiPolygon[]
  thresholds: number[]
  majorIndices: Set<number>
}

export function generateContours(heightmap: HeightmapInfo, params: ContourParameters): ContourSet {
  const { data, width, height, minValue, maxValue } = heightmap
  const { interval, minElevation, maxElevation, majorEvery } = params

  const low = Math.max(minElevation, minValue)
  const high = Math.min(maxElevation, maxValue)

  const thresholds: number[] = []
  for (let t = low; t <= high + 1e-9; t += interval) {
    thresholds.push(parseFloat(t.toFixed(6)))
  }

  const generator = contours().size([width, height]).thresholds(thresholds)
  const paths = generator(Array.from(data))

  const majorIndices = new Set<number>()
  thresholds.forEach((_, i) => {
    if (i % majorEvery === 0) majorIndices.add(i)
  })

  return { paths, thresholds, majorIndices }
}

export function contourToSvgPath(polygon: ContourMultiPolygon): string {
  return polygon.coordinates
    .flatMap((rings) =>
      rings.map((ring) => {
        const d = ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
        return `${d} Z`
      })
    )
    .join(' ')
}
