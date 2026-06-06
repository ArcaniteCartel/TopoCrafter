import type { GridConfig, GridLinePattern, MeasureBarConfig, ElevationCalibration } from '../types'

export function getLineDash(pattern: GridLinePattern, lw: number): number[] {
  switch (pattern) {
    case 'dashed':   return [Math.max(4, 4 * lw), Math.max(3, 3 * lw)]
    case 'dotted':   return [Math.max(1, lw), Math.max(3, 3 * lw)]
    case 'dot-dash': return [Math.max(1, lw), Math.max(3, 3 * lw), Math.max(5, 5 * lw), Math.max(3, 3 * lw)]
    default:         return []
  }
}

export function drawGridOnCanvas(
  ctx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  grid: GridConfig,
  measureBar?: MeasureBarConfig,
  calibration?: ElevationCalibration,
): void {
  ctx.clearRect(0, 0, mapW, mapH)
  if (!grid.enabled) return

  const pixelsPerUnit = (calibration?.mapWidth && calibration.mapWidth > 0 && mapW > 0)
    ? mapW / calibration.mapWidth : 1

  if (grid.type === 'measured') {
    if (!measureBar?.enabled || !calibration?.mapWidth || calibration.mapWidth <= 0) return
    const intervalPx = measureBar.majorInterval * pixelsPerUnit
    if (intervalPx < 2) return

    // showBottom||showTop → vertical lines; showLeft||showRight → horizontal lines
    const drawV = measureBar.showBottom || measureBar.showTop
    const drawH = measureBar.showLeft || measureBar.showRight

    if (grid.showMinor && measureBar.minorDivisions > 1) {
      const minorPx = intervalPx / measureBar.minorDivisions
      ctx.strokeStyle = grid.minorColor
      ctx.lineWidth = grid.minorLineWidth
      ctx.globalAlpha = grid.minorOpacity
      ctx.setLineDash(getLineDash(grid.minorPattern, grid.minorLineWidth))
      ctx.beginPath()
      if (drawV) for (let i = 0; i * minorPx <= mapW + 0.5; i++) { const x = i * minorPx; ctx.moveTo(x, 0); ctx.lineTo(x, mapH) }
      if (drawH) for (let i = 0; i * minorPx <= mapH + 0.5; i++) { const y = mapH - i * minorPx; ctx.moveTo(0, y); ctx.lineTo(mapW, y) }
      ctx.stroke()
    }

    ctx.strokeStyle = grid.color; ctx.lineWidth = grid.lineWidth
    ctx.globalAlpha = grid.opacity
    ctx.setLineDash(getLineDash(grid.pattern, grid.lineWidth))
    ctx.beginPath()
    if (drawV) for (let i = 0; i * intervalPx <= mapW + 0.5; i++) { const x = i * intervalPx; ctx.moveTo(x, 0); ctx.lineTo(x, mapH) }
    if (drawH) for (let i = 0; i * intervalPx <= mapH + 0.5; i++) { const y = mapH - i * intervalPx; ctx.moveTo(0, y); ctx.lineTo(mapW, y) }
    ctx.stroke()
    ctx.setLineDash([]); ctx.globalAlpha = 1
    return
  }

  if (grid.type === 'square') {
    const intervalPx = grid.interval * pixelsPerUnit
    if (intervalPx < 2) return

    if (grid.showMinor && grid.minorDivisions > 1) {
      const minorPx = intervalPx / grid.minorDivisions
      ctx.strokeStyle = grid.minorColor; ctx.lineWidth = grid.minorLineWidth
      ctx.globalAlpha = grid.minorOpacity
      ctx.setLineDash(getLineDash(grid.minorPattern, grid.minorLineWidth))
      ctx.beginPath()
      for (let x = 0; x <= mapW + 0.5; x += minorPx) { ctx.moveTo(x, 0); ctx.lineTo(x, mapH) }
      for (let y = 0; y <= mapH + 0.5; y += minorPx) { ctx.moveTo(0, y); ctx.lineTo(mapW, y) }
      ctx.stroke()
    }

    ctx.strokeStyle = grid.color; ctx.lineWidth = grid.lineWidth
    ctx.globalAlpha = grid.opacity
    ctx.setLineDash(getLineDash(grid.pattern, grid.lineWidth))
    ctx.beginPath()
    for (let x = 0; x <= mapW + 0.5; x += intervalPx) { ctx.moveTo(x, 0); ctx.lineTo(x, mapH) }
    for (let y = 0; y <= mapH + 0.5; y += intervalPx) { ctx.moveTo(0, y); ctx.lineTo(mapW, y) }
    ctx.stroke()
    ctx.setLineDash([]); ctx.globalAlpha = 1
    return
  }

  // Hex grids (hex-flat, hex-pointy, hex-rotated)
  const rotation =
    grid.type === 'hex-flat'   ? 0 :
    grid.type === 'hex-pointy' ? Math.PI / 6 :
    /* hex-rotated */            Math.PI / 4

  const intervalPx = grid.interval * pixelsPerUnit
  if (intervalPx < 2) return

  const R = intervalPx / Math.sqrt(3)
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  const b1x = R * (1.5 * cos - (Math.sqrt(3) / 2) * sin)
  const b1y = R * (1.5 * sin + (Math.sqrt(3) / 2) * cos)
  const b2x = R * (-Math.sqrt(3) * sin)
  const b2y = R * (Math.sqrt(3) * cos)
  const originX = mapW / 2, originY = mapH / 2
  const N = Math.ceil(Math.sqrt(mapW * mapW + mapH * mapH) / intervalPx) + 2

  ctx.strokeStyle = grid.color; ctx.lineWidth = grid.lineWidth
  ctx.globalAlpha = grid.opacity
  ctx.setLineDash(getLineDash(grid.pattern, grid.lineWidth))
  ctx.beginPath()
  for (let n = -N; n <= N; n++) {
    for (let m = -N; m <= N; m++) {
      const cx = originX + n * b1x + m * b2x
      const cy = originY + n * b1y + m * b2y
      if (cx < -2 * R || cx > mapW + 2 * R || cy < -2 * R || cy > mapH + 2 * R) continue
      for (let i = 0; i < 6; i++) {
        const angle = rotation + (Math.PI / 3) * i
        const vx = cx + R * Math.cos(angle), vy = cy + R * Math.sin(angle)
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
    }
  }
  ctx.stroke()
  ctx.setLineDash([]); ctx.globalAlpha = 1
}

export function drawGridIntoContext(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  mapW: number,
  mapH: number,
  grid: GridConfig,
  measureBar?: MeasureBarConfig,
  calibration?: ElevationCalibration,
): void {
  const temp = document.createElement('canvas')
  temp.width = mapW; temp.height = mapH
  const tc = temp.getContext('2d')!
  drawGridOnCanvas(tc, mapW, mapH, grid, measureBar, calibration)
  ctx.drawImage(temp, offsetX, offsetY)
}
