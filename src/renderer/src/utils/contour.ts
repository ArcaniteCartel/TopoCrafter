import { contours } from 'd3-contour'
import type { ContourMultiPolygon } from 'd3-contour'
import type { HeightmapInfo, ContourParameters } from '../types'

export interface ContourSet {
  paths: ContourMultiPolygon[]
  thresholds: number[]
  majorIndices: Set<number>
}

// Separable box blur — two passes (horizontal then vertical) over the elevation data.
// Blurring the terrain before contouring produces naturally smooth, rounded lines.
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const temp = new Float32Array(src.length)
  const dst  = new Float32Array(src.length)

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)
      for (let dx = x0; dx <= x1; dx++) { sum += src[row + dx]; count++ }
      temp[row + x] = sum / count
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0, count = 0
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(height - 1, y + radius)
      for (let dy = y0; dy <= y1; dy++) { sum += temp[dy * width + x]; count++ }
      dst[y * width + x] = sum / count
    }
  }

  return dst
}

export function generateContours(heightmap: HeightmapInfo, params: ContourParameters): ContourSet {
  const { data, width, height, minValue, maxValue } = heightmap
  const { interval, minElevation, maxElevation, majorEvery, smoothing } = params

  const low  = Math.max(minElevation, minValue)
  const high = Math.min(maxElevation, maxValue)

  const thresholds: number[] = []
  for (let t = low; t <= high + 1e-9; t += interval) {
    thresholds.push(parseFloat(t.toFixed(6)))
  }

  // Apply terrain blur when smoothing > 0 (radius 1–8 pixels)
  const radius = Math.round(smoothing * 8)
  const effectiveData = radius > 0 ? boxBlur(data, width, height, radius) : data

  const generator = contours().size([width, height]).thresholds(thresholds)
  const paths = generator(Array.from(effectiveData))

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
