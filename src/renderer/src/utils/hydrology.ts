import { contours } from 'd3-contour'
import type { WaterLake, WaterRiver, WaterDetectionParams } from '../types'

// D8 direction arrays: E, SE, S, SW, W, NW, N, NE
const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]
const DD = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2]

// ── MinHeap ──────────────────────────────────────────────────────────────────

class MinHeap<T> {
  private data: T[] = []
  constructor(private cmp: (a: T, b: T) => number) {}

  push(item: T): void {
    this.data.push(item)
    this.siftUp(this.data.length - 1)
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length > 0) { this.data[0] = last; this.siftDown(0) }
    return top
  }

  get size(): number { return this.data.length }

  private siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.cmp(this.data[i], this.data[p]) < 0) {
        const tmp = this.data[i]; this.data[i] = this.data[p]; this.data[p] = tmp
        i = p
      } else break
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length
    while (true) {
      let m = i
      const l = 2 * i + 1, r = 2 * i + 2
      if (l < n && this.cmp(this.data[l], this.data[m]) < 0) m = l
      if (r < n && this.cmp(this.data[r], this.data[m]) < 0) m = r
      if (m === i) break
      const tmp = this.data[i]; this.data[i] = this.data[m]; this.data[m] = tmp
      i = m
    }
  }
}

// ── Priority-Flood depression filling (Barnes et al. 2014) ───────────────────

function priorityFlood(data: Float32Array, w: number, h: number): Float32Array {
  const filled = new Float32Array(data)
  const visited = new Uint8Array(w * h)
  const heap = new MinHeap<[number, number]>((a, b) => a[1] - b[1])

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        const idx = y * w + x
        heap.push([idx, data[idx]])
        visited[idx] = 1
      }
    }
  }

  while (heap.size > 0) {
    const [idx, elev] = heap.pop()!
    const px = idx % w, py = (idx / w) | 0
    for (let d = 0; d < 8; d++) {
      const nx = px + DX[d], ny = py + DY[d]
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const nidx = ny * w + nx
      if (visited[nidx]) continue
      visited[nidx] = 1
      filled[nidx] = Math.max(data[nidx], elev)
      heap.push([nidx, filled[nidx]])
    }
  }

  return filled
}

// ── D8 flow direction (steepest descent) ────────────────────────────────────

function computeFlowDir(filled: Float32Array, w: number, h: number): Int8Array {
  const dir = new Int8Array(w * h).fill(-1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      let maxSlope = 0, bestD = -1
      const elev = filled[idx]
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d], ny = y + DY[d]
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const slope = (elev - filled[ny * w + nx]) / DD[d]
        if (slope > maxSlope) { maxSlope = slope; bestD = d }
      }
      dir[idx] = bestD
    }
  }
  return dir
}

// ── Flow accumulation (BFS topological sort) ─────────────────────────────────

function computeFlowAccum(dir: Int8Array, w: number, h: number): Float32Array {
  const accum = new Float32Array(w * h).fill(1)
  const inDeg = new Uint8Array(w * h)

  for (let idx = 0; idx < w * h; idx++) {
    const d = dir[idx]
    if (d < 0) continue
    const x = idx % w, y = (idx / w) | 0
    const nx = x + DX[d], ny = y + DY[d]
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) inDeg[ny * w + nx]++
  }

  const queue: number[] = []
  for (let idx = 0; idx < w * h; idx++) {
    if (inDeg[idx] === 0) queue.push(idx)
  }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const d = dir[idx]
    if (d < 0) continue
    const x = idx % w, y = (idx / w) | 0
    const nx = x + DX[d], ny = y + DY[d]
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
    const nidx = ny * w + nx
    accum[nidx] += accum[idx]
    if (--inDeg[nidx] === 0) queue.push(nidx)
  }

  return accum
}

// ── Strahler order (BFS on stream subgraph) ──────────────────────────────────

function computeStrahler(
  dir: Int8Array, streamCells: Set<number>, w: number, h: number
): Float32Array {
  const strahler = new Float32Array(w * h)
  const inDeg = new Map<number, number>()
  for (const idx of streamCells) inDeg.set(idx, 0)

  for (const idx of streamCells) {
    const d = dir[idx]
    if (d < 0) continue
    const x = idx % w, y = (idx / w) | 0
    const nx = x + DX[d], ny = y + DY[d]
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
    const nidx = ny * w + nx
    if (streamCells.has(nidx)) inDeg.set(nidx, (inDeg.get(nidx) ?? 0) + 1)
  }

  const maxUp = new Map<number, number>()
  const cntAtMax = new Map<number, number>()
  for (const idx of streamCells) { maxUp.set(idx, 0); cntAtMax.set(idx, 0) }

  const queue: number[] = []
  for (const idx of streamCells) {
    if (inDeg.get(idx) === 0) { strahler[idx] = 1; queue.push(idx) }
  }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const d = dir[idx]
    if (d < 0) continue
    const x = idx % w, y = (idx / w) | 0
    const nx = x + DX[d], ny = y + DY[d]
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
    const nidx = ny * w + nx
    if (!streamCells.has(nidx)) continue

    const myOrd = strahler[idx]
    const curMax = maxUp.get(nidx) ?? 0
    if (myOrd > curMax) { maxUp.set(nidx, myOrd); cntAtMax.set(nidx, 1) }
    else if (myOrd === curMax) cntAtMax.set(nidx, (cntAtMax.get(nidx) ?? 0) + 1)

    const deg = (inDeg.get(nidx) ?? 0) - 1
    inDeg.set(nidx, deg)
    if (deg === 0) {
      const mx = maxUp.get(nidx) ?? 1
      strahler[nidx] = (cntAtMax.get(nidx) ?? 0) >= 2 ? mx + 1 : mx
      queue.push(nidx)
    }
  }

  return strahler
}

// ── Douglas-Peucker polyline simplification ──────────────────────────────────

function douglasPeucker(
  pts: { x: number; y: number }[], eps: number
): { x: number; y: number }[] {
  if (pts.length <= 2) return pts
  const start = pts[0], end = pts[pts.length - 1]
  const dx = end.x - start.x, dy = end.y - start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  let maxDist = 0, maxIdx = -1
  for (let i = 1; i < pts.length - 1; i++) {
    const dist = len === 0
      ? Math.sqrt((pts[i].x - start.x) ** 2 + (pts[i].y - start.y) ** 2)
      : Math.abs(dy * pts[i].x - dx * pts[i].y + end.x * start.y - end.y * start.x) / len
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist <= eps) return [start, end]
  return [
    ...douglasPeucker(pts.slice(0, maxIdx + 1), eps).slice(0, -1),
    ...douglasPeucker(pts.slice(maxIdx), eps),
  ]
}

// ── Connected-component grouping of stream cells ─────────────────────────────

function findComponents(streamCells: Set<number>, w: number, h: number): number[][] {
  const visited = new Set<number>()
  const components: number[][] = []

  for (const start of streamCells) {
    if (visited.has(start)) continue
    const component: number[] = []
    const queue = [start]
    let head = 0
    while (head < queue.length) {
      const idx = queue[head++]
      if (visited.has(idx)) continue
      visited.add(idx)
      component.push(idx)
      const x = idx % w, y = (idx / w) | 0
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d], ny = y + DY[d]
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const nidx = ny * w + nx
        if (streamCells.has(nidx) && !visited.has(nidx)) queue.push(nidx)
      }
    }
    components.push(component)
  }

  return components
}

// ── Topological sort for stream subgraph ────────────────────────────────────

function topoSort(
  systemCells: Set<number>, dir: Int8Array, w: number, h: number
): number[] {
  const inDeg = new Map<number, number>()
  for (const idx of systemCells) inDeg.set(idx, 0)
  for (const idx of systemCells) {
    const d = dir[idx]
    if (d < 0) continue
    const x = idx % w, y = (idx / w) | 0
    const nx = x + DX[d], ny = y + DY[d]
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
    const nidx = ny * w + nx
    if (systemCells.has(nidx)) inDeg.set(nidx, (inDeg.get(nidx) ?? 0) + 1)
  }

  const order: number[] = []
  const queue = [...systemCells].filter((idx) => inDeg.get(idx) === 0)
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    order.push(idx)
    const d = dir[idx]
    if (d < 0) continue
    const x = idx % w, y = (idx / w) | 0
    const nx = x + DX[d], ny = y + DY[d]
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
    const nidx = ny * w + nx
    if (!systemCells.has(nidx)) continue
    const deg = (inDeg.get(nidx) ?? 0) - 1
    inDeg.set(nidx, deg)
    if (deg === 0) queue.push(nidx)
  }

  return order
}

// ── Segment tracing from topological order ───────────────────────────────────

function buildSegments(
  topoOrder: number[], dir: Int8Array, strahler: Float32Array, accum: Float32Array,
  streamCells: Set<number>, w: number, h: number
): Array<{ points: { x: number; y: number }[]; strahlerOrder: number; flowAccum: number }> {
  // Build explicit upstream list per cell (flows INTO each cell)
  const upstream = new Map<number, number[]>()
  for (const idx of topoOrder) upstream.set(idx, [])
  for (const idx of topoOrder) {
    const x = idx % w, y = (idx / w) | 0
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d]
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const nidx = ny * w + nx
      if (!streamCells.has(nidx)) continue
      if (dir[nidx] === ((d + 4) % 8)) upstream.get(idx)!.push(nidx)
    }
  }

  const openSeg = new Map<number, { x: number; y: number }[]>()
  const segments: Array<{ points: { x: number; y: number }[]; strahlerOrder: number; flowAccum: number }> = []

  function closeSeg(lastCell: number): void {
    const pts = openSeg.get(lastCell)
    if (!pts) return
    openSeg.delete(lastCell)
    if (pts.length >= 2) {
      segments.push({ points: douglasPeucker(pts, 1.5), strahlerOrder: strahler[lastCell] || 1, flowAccum: accum[lastCell] })
    }
  }

  for (const idx of topoOrder) {
    const upList = upstream.get(idx) ?? []
    const pt = { x: idx % w, y: (idx / w) | 0 }
    let pts: { x: number; y: number }[]

    if (upList.length === 1) {
      const upCell = upList[0]
      if (openSeg.has(upCell) && strahler[upCell] === strahler[idx]) {
        pts = openSeg.get(upCell)!
        openSeg.delete(upCell)
        pts.push(pt)
      } else {
        closeSeg(upCell)
        pts = [pt]
      }
    } else {
      for (const upCell of upList) closeSeg(upCell)
      pts = [pt]
    }

    const d = dir[idx]
    let hasDownstream = false
    if (d >= 0) {
      const x = idx % w, y = (idx / w) | 0
      const nx = x + DX[d], ny = y + DY[d]
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && streamCells.has(ny * w + nx)) {
        hasDownstream = true
      }
    }

    if (hasDownstream) {
      openSeg.set(idx, pts)
    } else if (pts.length >= 2) {
      segments.push({ points: douglasPeucker(pts, 1.5), strahlerOrder: strahler[idx] || 1, flowAccum: accum[idx] })
    }
  }

  for (const [lastCell, pts] of openSeg) {
    if (pts.length >= 2) {
      segments.push({ points: douglasPeucker(pts, 1.5), strahlerOrder: strahler[lastCell] || 1, flowAccum: accum[lastCell] })
    }
  }

  return segments
}

// ── Label placement helpers ──────────────────────────────────────────────────

function placeLakeLabel(polygon: { x: number; y: number }[]): { x: number; y: number }[] | null {
  if (polygon.length < 6) return null
  let topIdx = 0
  for (let i = 1; i < polygon.length; i++) {
    if (polygon[i].y < polygon[topIdx].y) topIdx = i
  }
  const n = polygon.length
  const step = Math.max(2, Math.floor(n / 6))
  return [
    polygon[(topIdx - step + n) % n],
    polygon[topIdx],
    polygon[(topIdx + step) % n],
  ]
}

function placeRiverLabel(mainStem: { x: number; y: number }[]): { x: number; y: number }[] | null {
  if (mainStem.length < 6) return null
  const n = mainStem.length
  return [
    mainStem[Math.floor(n * 0.3)],
    mainStem[Math.floor(n * 0.5)],
    mainStem[Math.floor(n * 0.7)],
  ]
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function detectWaterFeatures(
  data: Float32Array,
  width: number,
  height: number,
  params: WaterDetectionParams,
  minValue: number,
  maxValue: number
): { lakes: WaterLake[]; rivers: WaterRiver[] } {
  const elevRange = Math.max(maxValue - minValue, 1e-6)
  const minDepth = (params.minDepthPct / 100) * elevRange

  // 1. Fill depressions
  const filled = priorityFlood(data, width, height)

  // 2. Lake detection via contour extraction on depression mask
  const mask = new Float64Array(width * height)
  for (let i = 0; i < data.length; i++) {
    mask[i] = filled[i] - data[i] > minDepth ? 1 : 0
  }

  const contourGen = contours().size([width, height]).thresholds([0.5])
  const lakeFeatures = contourGen(mask as unknown as number[])
  const lakes: WaterLake[] = []

  for (const feature of lakeFeatures) {
    for (const polygon of feature.coordinates) {
      const outerRing = polygon[0]
      if (!outerRing || outerRing.length < 4) continue

      // Shoelace area
      let area = 0
      for (let i = 0; i < outerRing.length - 1; i++) {
        area += outerRing[i][0] * outerRing[i + 1][1] - outerRing[i + 1][0] * outerRing[i][1]
      }
      area = Math.abs(area) / 2
      if (area < params.minAreaPx) continue

      const rawPts = outerRing.map(([x, y]) => ({ x, y }))
      const pts = douglasPeucker(rawPts, 1.5)

      // Average surface elevation and depth from sampled interior points
      let sumElev = 0, sumDepth = 0, count = 0
      for (const [x, y] of outerRing) {
        const px = Math.min(width - 1, Math.max(0, Math.round(x)))
        const py = Math.min(height - 1, Math.max(0, Math.round(y)))
        const idx = py * width + px
        sumElev += filled[idx]
        sumDepth += filled[idx] - data[idx]
        count++
      }
      const surfaceElevNorm = count > 0 ? sumElev / count : 0
      const depthNorm = count > 0 ? sumDepth / count / elevRange : 0

      lakes.push({
        id: crypto.randomUUID(),
        polygon: pts,
        areaPx: area,
        surfaceElevNorm,
        depthNorm,
        color: '#5b9bd5',
        opacity: 0.65,
        label: '',
        labelColor: '#1a3a5c',
        labelFontSize: 14,
        labelFontFamily: 'serif',
        labelBold: false,
        labelItalic: true,
        labelStrokeColor: '#ffffff',
        labelStrokeWidth: 0,
        labelPoints: placeLakeLabel(pts),
      })
    }
  }

  // 3. River detection
  const dir = computeFlowDir(filled, width, height)
  const accum = computeFlowAccum(dir, width, height)

  const threshold = (params.accumulationPct / 100) * width * height
  const streamCells = new Set<number>()
  for (let i = 0; i < accum.length; i++) {
    if (accum[i] >= threshold) streamCells.add(i)
  }

  if (streamCells.size === 0) return { lakes, rivers: [] }

  const strahler = computeStrahler(dir, streamCells, width, height)
  const components = findComponents(streamCells, width, height)

  const sorted = components
    .map((cells) => ({ cells, maxAccum: Math.max(...cells.map((i) => accum[i])) }))
    .sort((a, b) => b.maxAccum - a.maxAccum)

  const keep = params.maxRiverSystems > 0
    ? sorted.slice(0, params.maxRiverSystems)
    : sorted

  const rivers: WaterRiver[] = keep.map(({ cells, maxAccum }, rank) => {
    const sysSet = new Set(cells)
    const topo = topoSort(sysSet, dir, width, height)
    const segments = buildSegments(topo, dir, strahler, accum, streamCells, width, height)

    // Main stem = topo-ordered cells with max Strahler order
    const maxOrd = Math.max(...cells.map((i) => strahler[i]))
    const mainStemPts = topo
      .filter((i) => strahler[i] === maxOrd)
      .map((i) => ({ x: i % width, y: (i / width) | 0 }))

    return {
      id: crypto.randomUUID(),
      systemId: rank,
      systemRank: rank + 1,
      segments,
      maxAccumulation: maxAccum,
      color: '#2060a0',
      opacity: 0.8,
      label: '',
      labelColor: '#1a3a5c',
      labelFontSize: 14,
      labelFontFamily: 'serif',
      labelBold: false,
      labelItalic: true,
      labelStrokeColor: '#ffffff',
      labelStrokeWidth: 0,
      labelPoints: placeRiverLabel(mainStemPts),
    }
  })

  return { lakes, rivers }
}
