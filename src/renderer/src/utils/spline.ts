export interface SplinePoint { x: number; y: number }

function gp(pts: SplinePoint[], i: number, closed: boolean): SplinePoint {
  const n = pts.length
  if (closed) return pts[((i % n) + n) % n]
  return pts[Math.max(0, Math.min(i, n - 1))]
}

export function catmullRomPath(pts: SplinePoint[], closed: boolean): string {
  const n = pts.length
  if (n < 2) return ''
  let d = `M ${pts[0].x},${pts[0].y}`
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const p0 = gp(pts, i - 1, closed), p1 = gp(pts, i, closed)
    const p2 = gp(pts, i + 1, closed), p3 = gp(pts, i + 2, closed)
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  if (closed) d += ' Z'
  return d
}

export function catmullRomOffsetPath(
  pts: SplinePoint[], closed: boolean, offset: number, samplesPerSeg = 20
): string {
  const n = pts.length
  if (n < 2) return ''
  const samples: SplinePoint[] = []
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const p0 = gp(pts, i - 1, closed), p1 = gp(pts, i, closed)
    const p2 = gp(pts, i + 1, closed), p3 = gp(pts, i + 2, closed)
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6
    for (let j = 0; j < samplesPerSeg; j++) {
      const t = j / samplesPerSeg, mt = 1 - t
      samples.push({
        x: mt*mt*mt*p1.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*p2.x,
        y: mt*mt*mt*p1.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*p2.y,
      })
    }
  }
  if (!closed) samples.push(pts[n - 1])
  const ns = samples.length
  const offPts = samples.map((pt, i) => {
    const prev = closed ? samples[(i - 1 + ns) % ns] : (i > 0 ? samples[i - 1] : pt)
    const next = closed ? samples[(i + 1) % ns] : (i < ns - 1 ? samples[i + 1] : pt)
    const tx = next.x - prev.x, ty = next.y - prev.y
    const len = Math.sqrt(tx * tx + ty * ty)
    if (len < 0.001) return pt
    return { x: pt.x + (-ty / len) * offset, y: pt.y + (tx / len) * offset }
  })
  return offPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ') + (closed ? ' Z' : '')
}
