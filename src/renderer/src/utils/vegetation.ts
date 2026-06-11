import type { VegetationLayer, WaterLake, WaterRiver } from '../types'

// ---------------------------------------------------------------------------
// Water mask rasterization helpers
// ---------------------------------------------------------------------------

function rasterizePolygon(
  poly: { x: number; y: number }[],
  mask: Uint8Array,
  w: number,
  h: number,
): void {
  if (poly.length < 3) return
  const minY = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))))
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...poly.map((p) => p.y))))
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = []
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i].y, yj = poly[j].y
      if ((yi > y) !== (yj > y)) {
        xs.push(poly[i].x + ((y - yi) / (yj - yi)) * (poly[j].x - poly[i].x))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.floor(xs[k]))
      const x1 = Math.min(w - 1, Math.ceil(xs[k + 1]))
      for (let x = x0; x <= x1; x++) mask[y * w + x] = 1
    }
  }
}

function rasterizeLine(
  pts: { x: number; y: number }[],
  mask: Uint8Array,
  w: number,
  h: number,
  thick: number,
): void {
  const r = Math.ceil(thick / 2)
  const rr = (thick / 2) * (thick / 2)
  for (let i = 0; i + 1 < pts.length; i++) {
    let x0 = Math.round(pts[i].x), y0 = Math.round(pts[i].y)
    const x1 = Math.round(pts[i + 1].x), y1 = Math.round(pts[i + 1].y)
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (ox * ox + oy * oy <= rr) {
            const nx = x0 + ox, ny = y0 + oy
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) mask[ny * w + nx] = 1
          }
        }
      }
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x0 += sx }
      if (e2 < dx) { err += dx; y0 += sy }
    }
  }
}

// ---------------------------------------------------------------------------
// BFS distance transform (returns float32 array of distances in pixels)
// ---------------------------------------------------------------------------

function bfsDistance(seedMask: Uint8Array, w: number, h: number): Float32Array {
  const dist = new Float32Array(w * h).fill(Infinity)
  const queue: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (seedMask[i]) { dist[i] = 0; queue.push(i) }
  }
  const N4 = [-w, w, -1, 1]
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const d1 = dist[idx] + 1
    for (const nb of N4) {
      const ni = idx + nb
      if (ni < 0 || ni >= w * h) continue
      const nx = ni % w, ny = (ni - nx) / w
      const px = idx % w, py = (idx - px) / w
      if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue
      if (dist[ni] > d1) { dist[ni] = d1; queue.push(ni) }
    }
  }
  return dist
}

// ---------------------------------------------------------------------------
// Noise utilities
// ---------------------------------------------------------------------------

// Simple value noise (hash-based, no external deps)
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const h00 = hash2(xi, yi, seed)
  const h10 = hash2(xi + 1, yi, seed)
  const h01 = hash2(xi, yi + 1, seed)
  const h11 = hash2(xi + 1, yi + 1, seed)
  const ux = xf * xf * (3 - 2 * xf)
  const uy = yf * yf * (3 - 2 * yf)
  return h00 + (h10 - h00) * ux + (h01 - h00) * uy + (h00 - h10 - h01 + h11) * ux * uy
}

function hash2(x: number, y: number, seed: number): number {
  let n = (x * 1619 + y * 31337 + seed * 1013904223) | 0
  n = ((n >> 8) ^ n) * 0x45d9f3b | 0
  n = ((n >> 8) ^ n) * 0x45d9f3b | 0
  return ((n >> 8) ^ n) / 0xffffffff + 0.5
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let v = 0, amp = 0.5, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * freq, y * freq, seed + i) * amp
    max += amp; amp *= 0.5; freq *= 2
  }
  return v / max
}

// Worley (cellular) noise — F1 distance
function worley(x: number, y: number, jitter: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  let minD = Infinity
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy
      const hx = hash2(cx, cy, seed)
      const hy = hash2(cx + 9301, cy + 49297, seed)
      const px = cx + hx * jitter, py = cy + hy * jitter
      const dx = x - px, dy = y - py
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minD) minD = d
    }
  }
  return Math.min(minD, 1)
}

// Bayer 8×8 dither matrix (normalized 0–1)
const BAYER8: number[] = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => v / 64)

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export interface VegetationGenInput {
  heightData: Float32Array
  mapWidth: number
  mapHeight: number
  minValue: number
  maxValue: number
  waterLakes: WaterLake[]
  waterRivers: WaterRiver[]
  layer: VegetationLayer
  pixelsPerUnit: number  // 1 when uncalibrated (spread already in px), else px / display-unit
}

export function generateVegetation(input: VegetationGenInput): string {
  const { heightData, mapWidth: w, mapHeight: h, minValue, maxValue, waterLakes, waterRivers, layer, pixelsPerUnit } = input

  const lakeSpreadPx  = Math.max(0, Math.round(layer.lakeSpread  * pixelsPerUnit))
  const riverSpreadPx = Math.max(0, Math.round(layer.riverSpread * pixelsPerUnit))

  // ---- 1. Build water mask ----
  const lakeMask = new Uint8Array(w * h)
  const riverMask = new Uint8Array(w * h)

  for (const lake of waterLakes) {
    rasterizePolygon(lake.polygon, lakeMask, w, h)
  }

  for (const river of waterRivers) {
    for (const seg of river.segments) {
      const thick = Math.max(2, river.strokeWidth * (seg.strahlerOrder / 4))
      rasterizeLine(seg.points, riverMask, w, h, thick)
    }
  }

  // ---- 2. BFS distance transforms ----
  const lakeDist  = lakeSpreadPx  > 0 ? bfsDistance(lakeMask,  w, h) : null
  const riverDist = riverSpreadPx > 0 ? bfsDistance(riverMask, w, h) : null

  // ---- 3. Base density from water proximity ----
  const elRange = maxValue - minValue || 1
  const textSeed = Array.from(layer.id).reduce((a, c) => a + c.charCodeAt(0), 0)
  const ns = layer.noiseScale * 0.01   // scale into normalized coord space

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const d = img.data

  // parse hex color → rgb
  const r_col = parseInt(layer.color.slice(1, 3), 16)
  const g_col = parseInt(layer.color.slice(3, 5), 16)
  const b_col = parseInt(layer.color.slice(5, 7), 16)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x

      // -- proximity density --
      let density = 0
      if (lakeDist && lakeDist[i] < lakeSpreadPx) {
        density = Math.max(density, Math.exp(-3 * lakeDist[i] / lakeSpreadPx))
      }
      if (riverDist && riverDist[i] < riverSpreadPx) {
        density = Math.max(density, Math.exp(-3 * riverDist[i] / riverSpreadPx))
      }
      if (density === 0) continue

      // -- texture modulation --
      const nx = x * ns, ny = y * ns
      let texVal: number
      switch (layer.textureStyle) {
        case 'gradient':
          texVal = 1
          break
        case 'organic':
          texVal = fbm(nx, ny, layer.organicOctaves, textSeed)
          break
        case 'stipple': {
          const bayerVal = BAYER8[(y % 8) * 8 + (x % 8)]
          texVal = fbm(nx * 0.5, ny * 0.5, 2, textSeed) > (bayerVal * (1 - layer.stippleDensity * 0.8) + 0.1) ? 1 : 0
          break
        }
        case 'hatch': {
          const angle = (layer.hatchAngle * Math.PI) / 180
          const proj = x * Math.cos(angle) + y * Math.sin(angle)
          const period = proj % layer.hatchSpacing
          texVal = period < layer.hatchSpacing * 0.4 ? 1 : 0
          break
        }
        case 'cellular':
          texVal = 1 - worley(nx, ny, layer.cellularJitter, textSeed)
          break
        default:
          texVal = 1
      }

      // blend base texture with noisiness-modulated fBm
      const noiseVal = fbm(nx * 1.5, ny * 1.5, 3, textSeed + 99)
      const modulated = texVal * (1 - layer.noisiness) + noiseVal * layer.noisiness
      density *= Math.max(0, Math.min(1, modulated))

      if (density < 0.02) continue

      // -- elevation thinning --
      const elev = (heightData[i] - minValue) / elRange * 100  // 0–100 %
      const elevStart = layer.elevStartPct
      const elevEnd = elevStart + layer.elevThinRangePct

      if (elev > elevStart) {
        // water attenuation: close to water → suppress thinning
        const waterProximity = Math.max(
          lakeDist  ? Math.max(0, 1 - lakeDist[i]  / Math.max(lakeSpreadPx  * 1.5, 1)) : 0,
          riverDist ? Math.max(0, 1 - riverDist[i] / Math.max(riverSpreadPx * 1.5, 1)) : 0,
        )
        const attenuatedStart = elevStart + (elevEnd - elevStart) * waterProximity * layer.waterAttenuation

        // variation noise on cutoff
        const varNoise = fbm(nx * 0.3, ny * 0.3, 2, textSeed + 777) * 2 - 1
        const varOffset = varNoise * layer.elevVariation * (elevEnd - elevStart)
        const effectiveStart = attenuatedStart + varOffset
        const effectiveEnd = effectiveStart + layer.elevThinRangePct

        if (elev >= effectiveEnd) {
          density = 0
        } else if (elev > effectiveStart) {
          density *= 1 - (elev - effectiveStart) / (effectiveEnd - effectiveStart)
        }
      }

      if (density < 0.02) continue

      const alpha = Math.round(density * layer.opacity * 255)
      const pi = i * 4
      d[pi]     = r_col
      d[pi + 1] = g_col
      d[pi + 2] = b_col
      d[pi + 3] = alpha
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}
