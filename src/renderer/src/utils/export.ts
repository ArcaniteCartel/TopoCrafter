import type { FrameConfig, TitleConfig, CompassConfig, ContourStyle, LegendConfig, FramePosition, MeasureBarConfig, ElevationCalibration, HeightmapInfo, GridConfig } from '../types'
import { TRI_COLORS, TRI_LABELS, triRangeLabel } from '../types'
import { drawGridIntoContext } from './grid'

export interface ExportLayerConfig {
  baseImageUrl: string | null
  includeContours: boolean
  includeAnnotations: boolean
  contourOpacity: number
  frame?: FrameConfig
  includeFrame?: boolean
  title?: TitleConfig
  compass?: CompassConfig
  legend?: LegendConfig
  contourStyle?: ContourStyle
  hasElevationFlags?: boolean
  hasSlopeArrows?: boolean
  hasRuggednessFlags?: boolean
  hasSwampMarkers?: boolean
  swampMarkerColor?: string
  roadTypeSummary?: Array<{ type: string; color: string }>
  ruggednessSeverityColors?: string[]
  measureBar?: MeasureBarConfig
  calibration?: ElevationCalibration
  heightmap?: HeightmapInfo
  includeGrid?: boolean
  grid?: GridConfig
}

export type OverlayBackgroundMode = 'transparent' | 'white' | 'colored'

export type FrameBackgroundMode = 'transparent' | 'white' | 'colored'

export interface OverlayExportConfig {
  overlayOpacity: number
  mode: OverlayBackgroundMode
  bgColor: string
  bgOpacity: number
  frameBackground: FrameBackgroundMode
  frameBgColor: string
  frame?: FrameConfig
  includeFrame?: boolean
  title?: TitleConfig
  compass?: CompassConfig
  legend?: LegendConfig
  contourStyle?: ContourStyle
  hasElevationFlags?: boolean
  hasSlopeArrows?: boolean
  hasRuggednessFlags?: boolean
  hasSwampMarkers?: boolean
  swampMarkerColor?: string
  roadTypeSummary?: Array<{ type: string; color: string }>
  ruggednessSeverityColors?: string[]
  measureBar?: MeasureBarConfig
  calibration?: ElevationCalibration
  heightmap?: HeightmapInfo
  includeGrid?: boolean
  grid?: GridConfig
}

// ---------------------------------------------------------------------------
// Frame position helpers
// ---------------------------------------------------------------------------

// Returns center point for a symmetric element (compass) at the given position
function getPositionCenter(
  pos: FramePosition,
  frame: FrameConfig,
  totalW: number,
  totalH: number,
  edgeGap: number,
): [number, number] {
  const ml = frame.marginLeft, mr = frame.marginRight
  const mt = frame.marginTop, mb = frame.marginBottom
  const mapH = totalH - mt - mb
  switch (pos) {
    case 'top-left':     return [edgeGap,             mt / 2]
    case 'top-center':   return [totalW / 2,           mt / 2]
    case 'top-right':    return [totalW - edgeGap,     mt / 2]
    case 'right-top':    return [totalW - mr / 2,      mt + edgeGap]
    case 'right-middle': return [totalW - mr / 2,      mt + mapH / 2]
    case 'right-bottom': return [totalW - mr / 2,      totalH - mb - edgeGap]
    case 'bottom-right': return [totalW - edgeGap,     totalH - mb / 2]
    case 'bottom-center':return [totalW / 2,           totalH - mb / 2]
    case 'bottom-left':  return [edgeGap,              totalH - mb / 2]
    case 'left-bottom':  return [ml / 2,               totalH - mb - edgeGap]
    case 'left-middle':  return [ml / 2,               mt + mapH / 2]
    case 'left-top':     return [ml / 2,               mt + edgeGap]
  }
}

// Returns top-left corner for a rectangular element (legend box) at the given position
function getBoxOrigin(
  pos: FramePosition,
  frame: FrameConfig,
  totalW: number,
  totalH: number,
  boxW: number,
  boxH: number,
  edgeGap: number,
): [number, number] {
  const ml = frame.marginLeft, mr = frame.marginRight
  const mt = frame.marginTop, mb = frame.marginBottom
  const mapH = totalH - mt - mb
  switch (pos) {
    case 'top-left':     return [edgeGap,                   mt / 2 - boxH / 2]
    case 'top-center':   return [totalW / 2 - boxW / 2,     mt / 2 - boxH / 2]
    case 'top-right':    return [totalW - edgeGap - boxW,   mt / 2 - boxH / 2]
    case 'right-top':    return [totalW - mr / 2 - boxW / 2, mt + edgeGap]
    case 'right-middle': return [totalW - mr / 2 - boxW / 2, mt + mapH / 2 - boxH / 2]
    case 'right-bottom': return [totalW - mr / 2 - boxW / 2, totalH - mb - edgeGap - boxH]
    case 'bottom-right': return [totalW - edgeGap - boxW,   totalH - mb / 2 - boxH / 2]
    case 'bottom-center':return [totalW / 2 - boxW / 2,     totalH - mb / 2 - boxH / 2]
    case 'bottom-left':  return [edgeGap,                   totalH - mb / 2 - boxH / 2]
    case 'left-bottom':  return [ml / 2 - boxW / 2,         totalH - mb - edgeGap - boxH]
    case 'left-middle':  return [ml / 2 - boxW / 2,         mt + mapH / 2 - boxH / 2]
    case 'left-top':     return [ml / 2 - boxW / 2,         mt + edgeGap]
  }
}

// ---------------------------------------------------------------------------
// Measure bar drawing on canvas
// ---------------------------------------------------------------------------

function drawMeasureBars(
  ctx: CanvasRenderingContext2D,
  measureBar: MeasureBarConfig,
  calibration: ElevationCalibration,
  heightmap: HeightmapInfo,
  frame: FrameConfig,
  totalW: number,
  totalH: number,
): void {
  if (!calibration.mapWidth || calibration.mapWidth <= 0 || !calibration.unitType) return

  const ml = frame.marginLeft, mr = frame.marginRight
  const mt = frame.marginTop, mb = frame.marginBottom
  const mapW = totalW - ml - mr
  const mapH = totalH - mt - mb
  if (mapW <= 0 || mapH <= 0) return

  const pixelsPerUnit = mapW / calibration.mapWidth
  const tickSpacing = measureBar.majorInterval * pixelsPerUnit
  if (tickSpacing < 2) return

  const unitAbbr = calibration.unitType === 'feet' ? 'ft'
    : calibration.unitType === 'meters' ? 'm'
    : calibration.customAbbr || ''

  const metersPerUnit = calibration.unitType === 'feet' ? 0.3048
    : calibration.unitType === 'meters' ? 1
    : calibration.customRatio * (calibration.customBase === 'feet' ? 0.3048 : 1)
  const metersPerPixel = metersPerUnit * (calibration.mapWidth / mapW)

  const anchorX_eff = measureBar.anchorX ?? 0
  const anchorY_eff = measureBar.anchorY ?? (heightmap.height - 1)
  const anchorScreenX = ml + anchorX_eff * (mapW / heightmap.width)
  const anchorScreenY = mt + anchorY_eff * (mapH / heightmap.height)

  const R_m = measureBar.planetRadius * 1000
  const anchorLatRad = measureBar.anchorLat * Math.PI / 180
  const cosLat = Math.max(0.001, Math.cos(anchorLatRad))

  function geoLabelH(screenX: number): string {
    const dist_m = (screenX - anchorScreenX) * metersPerPixel
    if (!measureBar.horizontalAxisIsLat) {
      return toDMS(measureBar.anchorLon + (dist_m / (R_m * cosLat)) * (180 / Math.PI), false)
    } else {
      return toDMS(measureBar.anchorLat + (dist_m / R_m) * (180 / Math.PI), true)
    }
  }

  function geoLabelV(screenY: number): string {
    const dist_m = (anchorScreenY - screenY) * metersPerPixel
    if (!measureBar.horizontalAxisIsLat) {
      return toDMS(measureBar.anchorLat + (dist_m / R_m) * (180 / Math.PI), true)
    } else {
      return toDMS(measureBar.anchorLon + (dist_m / (R_m * cosLat)) * (180 / Math.PI), false)
    }
  }

  const { color, lineWidth: lw, tickLength: tl, minorTickLength: mtl, fontSize: fs } = measureBar
  const minorDiv = Math.max(1, Math.floor(measureBar.minorDivisions))
  const geo = measureBar.geoEnabled

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw

  const drawTickLabelH = (x: number, baseY: number, dir: 1 | -1, dist: number) => {
    const distLabel = `${dist}${unitAbbr}`
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = dir > 0 ? 'top' : 'alphabetic'
    ctx.fillText(distLabel, x, baseY)
    if (geo) {
      ctx.font = `${fs * 0.85}px sans-serif`
      ctx.fillText(geoLabelH(x), x, dir > 0 ? baseY + fs + 2 : baseY - fs - 2)
    }
  }

  const drawTickLabelV = (baseX: number, y: number, dir: 1 | -1, dist: number) => {
    const distLabel = `${dist}${unitAbbr}`
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = dir < 0 ? 'right' : 'left'
    if (!geo) {
      ctx.textBaseline = 'middle'
      ctx.fillText(distLabel, baseX, y)
    } else {
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(distLabel, baseX, y - fs * 0.15)
      ctx.font = `${fs * 0.85}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(geoLabelV(y), baseX, y + fs * 0.2)
    }
  }

  const drawMinorH = (x: number, y0: number, dir: 1 | -1) => {
    ctx.lineWidth = lw * 0.7
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + dir * mtl); ctx.stroke()
    ctx.lineWidth = lw
  }

  const drawMinorV = (y: number, x0: number, dir: 1 | -1) => {
    ctx.lineWidth = lw * 0.7
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + dir * mtl, y); ctx.stroke()
    ctx.lineWidth = lw
  }

  if (measureBar.showBottom) {
    const y0 = totalH - mb
    ctx.beginPath(); ctx.moveTo(ml, y0); ctx.lineTo(ml + mapW, y0); ctx.stroke()
    for (let i = 0; i * tickSpacing <= mapW + 0.5; i++) {
      const x = Math.min(ml + i * tickSpacing, ml + mapW)
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + tl); ctx.stroke()
      drawTickLabelH(x, y0 + tl + 2, 1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const mx = ml + i * tickSpacing + j * tickSpacing / minorDiv
        if (mx > ml + mapW) break
        drawMinorH(mx, y0, 1)
      }
    }
  }

  if (measureBar.showTop) {
    const y0 = mt
    ctx.beginPath(); ctx.moveTo(ml, y0); ctx.lineTo(ml + mapW, y0); ctx.stroke()
    for (let i = 0; i * tickSpacing <= mapW + 0.5; i++) {
      const x = Math.min(ml + i * tickSpacing, ml + mapW)
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - tl); ctx.stroke()
      drawTickLabelH(x, y0 - tl - 2, -1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const mx = ml + i * tickSpacing + j * tickSpacing / minorDiv
        if (mx > ml + mapW) break
        drawMinorH(mx, y0, -1)
      }
    }
  }

  if (measureBar.showLeft) {
    const x0 = ml
    ctx.beginPath(); ctx.moveTo(x0, mt); ctx.lineTo(x0, mt + mapH); ctx.stroke()
    for (let i = 0; i * tickSpacing <= mapH + 0.5; i++) {
      const y = Math.max((totalH - mb) - i * tickSpacing, mt)
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - tl, y); ctx.stroke()
      drawTickLabelV(x0 - tl - 2, y, -1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const my = (totalH - mb) - (i * tickSpacing + j * tickSpacing / minorDiv)
        if (my < mt) break
        drawMinorV(my, x0, -1)
      }
    }
  }

  if (measureBar.showRight) {
    const x0 = totalW - mr
    ctx.beginPath(); ctx.moveTo(x0, mt); ctx.lineTo(x0, mt + mapH); ctx.stroke()
    for (let i = 0; i * tickSpacing <= mapH + 0.5; i++) {
      const y = Math.max((totalH - mb) - i * tickSpacing, mt)
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + tl, y); ctx.stroke()
      drawTickLabelV(x0 + tl + 2, y, 1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const my = (totalH - mb) - (i * tickSpacing + j * tickSpacing / minorDiv)
        if (my < mt) break
        drawMinorV(my, x0, 1)
      }
    }
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Frame border drawing on canvas
// ---------------------------------------------------------------------------

function drawFrameBorder(
  ctx: CanvasRenderingContext2D,
  frame: FrameConfig,
  totalW: number,
  totalH: number,
): void {
  const { borderStyle, borderColor, borderWidth: bw } = frame
  const inset = bw / 2
  ctx.strokeStyle = borderColor
  ctx.lineWidth = bw

  if (borderStyle === 'single') {
    ctx.strokeRect(inset, inset, totalW - bw, totalH - bw)
    return
  }

  if (borderStyle === 'double') {
    ctx.strokeRect(inset, inset, totalW - bw, totalH - bw)
    const gap = bw * 1.5
    const inner = inset + bw + gap
    ctx.strokeRect(inner, inner, totalW - inner * 2, totalH - inner * 2)
    return
  }

  if (borderStyle === 'cartographic') {
    ctx.strokeRect(inset, inset, totalW - bw, totalH - bw)
    const gap = bw * 2
    const inner = inset + bw + gap
    const innerBw = Math.max(1, bw * 0.6)
    ctx.save()
    ctx.lineWidth = innerBw
    ctx.setLineDash([bw * 3, bw * 2])
    ctx.strokeRect(inner, inner, totalW - inner * 2, totalH - inner * 2)
    ctx.restore()
    return
  }

  if (borderStyle === 'shadow') {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = bw * 2
    ctx.shadowOffsetX = bw * 1.5
    ctx.shadowOffsetY = bw * 1.5
    ctx.strokeRect(inset, inset, totalW - bw, totalH - bw)
    ctx.restore()
    return
  }

  if (borderStyle === 'ornate') {
    ctx.strokeRect(inset, inset, totalW - bw, totalH - bw)
    const gap = bw * 1.5
    const inner = inset + bw + gap
    ctx.strokeRect(inner, inner, totalW - inner * 2, totalH - inner * 2)
    const cSize = bw * 3
    const cornerOff = inner - bw / 2
    ctx.fillStyle = borderColor
    ctx.fillRect(cornerOff,              cornerOff,              cSize, cSize)
    ctx.fillRect(totalW - cornerOff - cSize, cornerOff,              cSize, cSize)
    ctx.fillRect(cornerOff,              totalH - cornerOff - cSize, cSize, cSize)
    ctx.fillRect(totalW - cornerOff - cSize, totalH - cornerOff - cSize, cSize, cSize)
  }
}

// ---------------------------------------------------------------------------
// Title drawing
// ---------------------------------------------------------------------------

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: TitleConfig,
  frame: FrameConfig,
  totalW: number,
  totalH: number,
): void {
  if (!title.enabled || !title.text.trim()) return
  const edgeGap = 4
  const parts: string[] = []
  if (title.bold) parts.push('bold')
  if (title.italic) parts.push('italic')
  parts.push(`${title.size}px`)
  parts.push(title.font)
  ctx.font = parts.join(' ')
  ctx.fillStyle = title.color

  const pos = title.position
  const text = title.text.trim()
  const [cx, cy] = getPositionCenter(pos, frame, totalW, totalH, edgeGap)

  const isLeft = pos.startsWith('left-')
  const isRight = pos.startsWith('right-')

  if (isLeft || isRight) {
    const angle = isLeft ? -Math.PI / 2 : Math.PI / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)
    ctx.restore()
  } else {
    ctx.textBaseline = 'middle'
    if (pos === 'top-left' || pos === 'bottom-left')      ctx.textAlign = 'left'
    else if (pos === 'top-right' || pos === 'bottom-right') ctx.textAlign = 'right'
    else                                                    ctx.textAlign = 'center'
    ctx.fillText(text, cx, cy)
  }
}

// ---------------------------------------------------------------------------
// Compass rose drawing — shared helpers
// ---------------------------------------------------------------------------

function rLabel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string,
  color: string, fs: number, dx: number, dy: number,
): void {
  if (!text.trim()) return
  ctx.fillStyle = color
  ctx.font = `${fs}px serif`
  ctx.textAlign    = dx > 0 ? 'left'  : dx < 0 ? 'right'      : 'center'
  ctx.textBaseline = dy > 0 ? 'top'   : dy < 0 ? 'alphabetic' : 'middle'
  ctx.fillText(text.trim(), x, y)
}

function cardinalLabels(
  ctx: CanvasRenderingContext2D,
  s: number, gap: number, fs: number, color: string,
  compass: CompassConfig, nExtra = 0,
): void {
  rLabel(ctx,  0,       -(s+gap+nExtra), compass.topLabel,    color, fs,  0, -1)
  rLabel(ctx,  s+gap,    0,              compass.rightLabel,  color, fs,  1,  0)
  rLabel(ctx,  0,        s+gap,          compass.bottomLabel, color, fs,  0,  1)
  rLabel(ctx, -(s+gap),  0,              compass.leftLabel,   color, fs, -1,  0)
}

// ---------------------------------------------------------------------------
// Plain
// ---------------------------------------------------------------------------

function drawPlain(ctx: CanvasRenderingContext2D, s: number, color: string, lw: number, gap: number, fs: number, compass: CompassConfig): void {
  const hl = s * 0.3, hw = s * 0.14
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(0, 0, lw * 1.5, 0, Math.PI * 2); ctx.fill()
  const arms = [
    { dx:  0, dy: -1, label: compass.topLabel,    arrow: compass.topArrow    },
    { dx:  1, dy:  0, label: compass.rightLabel,  arrow: compass.rightArrow  },
    { dx:  0, dy:  1, label: compass.bottomLabel, arrow: compass.bottomArrow },
    { dx: -1, dy:  0, label: compass.leftLabel,   arrow: compass.leftArrow   },
  ]
  for (const { dx, dy, label, arrow } of arms) {
    const tx = dx*s, ty = dy*s, bx = dx*(s-hl), by = dy*(s-hl)
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(arrow ? bx : tx, arrow ? by : ty); ctx.stroke()
    if (arrow) {
      ctx.fillStyle = color; ctx.beginPath()
      ctx.moveTo(tx, ty); ctx.lineTo(bx-dy*hw, by+dx*hw); ctx.lineTo(bx+dy*hw, by-dx*hw)
      ctx.closePath(); ctx.fill()
    }
    rLabel(ctx, dx*(s+gap), dy*(s+gap), label, color, fs, dx, dy)
  }
}

// ---------------------------------------------------------------------------
// Compass Star
// ---------------------------------------------------------------------------

function drawCompassStar(ctx: CanvasRenderingContext2D, s: number, color: string, lw: number, gap: number, fs: number, compass: CompassConfig): void {
  const ir = s * 0.22
  const is_ = s * 0.65, ir2 = is_ * 0.22
  const sq = Math.SQRT2 / 2

  const fillPoly = (pts: number[][], fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath(); ctx.fill()
  }
  const strokePoly = (pts: number[][], stroke: string, lw2: number) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = lw2; ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath(); ctx.stroke()
  }

  const cardPts = [[0,-s],[ir,-ir],[s,0],[ir,ir],[0,s],[-ir,ir],[-s,0],[-ir,-ir]]
  const icPts   = [[is_*sq,-is_*sq],[ir2,0],[is_*sq,is_*sq],[0,ir2],[-is_*sq,is_*sq],[-ir2,0],[-is_*sq,-is_*sq],[0,-ir2]]
  const nPts    = [[0,-s],[ir,-ir],[0,0],[-ir,-ir]]

  fillPoly(icPts, color)
  fillPoly(cardPts, color)
  fillPoly(nPts, 'white')
  strokePoly(nPts, color, lw * 0.5)
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, lw * 2, 0, Math.PI * 2); ctx.fill()
  cardinalLabels(ctx, s, gap, fs, color, compass)
}

// ---------------------------------------------------------------------------
// Nautical
// ---------------------------------------------------------------------------

function drawNautical(ctx: CanvasRenderingContext2D, s: number, color: string, lw: number, gap: number, fs: number, compass: CompassConfig): void {
  const fr = s * 0.2

  // Inner ring
  ctx.strokeStyle = color; ctx.lineWidth = lw
  ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2); ctx.stroke()

  // 16 diamonds
  for (let i = 0; i < 16; i++) {
    const θ = i * 22.5 * Math.PI / 180
    const dx = Math.sin(θ), dy = -Math.cos(θ), px = Math.cos(θ), py = Math.sin(θ)
    const isC = i % 4 === 0, isIC = i % 4 === 2
    const tl = isC ? s : isIC ? s*0.72 : s*0.48
    const hw = isC ? s*0.18 : isIC ? s*0.13 : s*0.06
    const isN = i === 0
    ctx.fillStyle = isN ? 'white' : color
    ctx.beginPath()
    ctx.moveTo(dx*tl, dy*tl)
    ctx.lineTo(px*hw, py*hw)
    ctx.lineTo(0, 0)
    ctx.lineTo(-px*hw, -py*hw)
    ctx.closePath(); ctx.fill()
    if (isN) {
      ctx.strokeStyle = color; ctx.lineWidth = lw * 0.5
      ctx.beginPath()
      ctx.moveTo(0, -tl); ctx.lineTo(px*hw, py*hw); ctx.lineTo(0, 0); ctx.lineTo(-px*hw, -py*hw); ctx.closePath()
      ctx.stroke()
    }
  }

  // Fleur-de-lis
  ctx.strokeStyle = color; ctx.lineWidth = lw * 0.9; ctx.lineCap = 'round'
  const lines: [number,number,number,number][] = [
    [0, -s, 0, -(s+fr)],
    [0, -s, -fr*0.55, -(s+fr*0.5)],
    [0, -s, fr*0.55, -(s+fr*0.5)],
    [-fr*0.65, -s+fr*0.15, fr*0.65, -s+fr*0.15],
  ]
  for (const [x1,y1,x2,y2] of lines) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }

  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, lw * 2, 0, Math.PI * 2); ctx.fill()
  cardinalLabels(ctx, s, gap, fs, color, compass, fr * 0.8)
}

// ---------------------------------------------------------------------------
// Celtic
// ---------------------------------------------------------------------------

function drawCeltic(ctx: CanvasRenderingContext2D, s: number, color: string, lw: number, gap: number, fs: number, compass: CompassConfig): void {
  const aw = s * 0.22, ah = aw / 2, rr = s * 0.40, gw = aw * 0.38
  const termR = ah * 0.85

  // Arms (filled rects — canvas lacks rounded rect stroke so we use fillRect)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.rect(-ah, -s, aw, s*2)
  ctx.fill()
  ctx.beginPath()
  ctx.rect(-s, -ah, s*2, aw)
  ctx.fill()

  // Ring
  ctx.strokeStyle = color; ctx.lineWidth = aw
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke()

  // Groove channels
  ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = 'white'; ctx.lineCap = 'round'
  ctx.lineWidth = gw
  ctx.beginPath(); ctx.moveTo(0, -(rr+ah)); ctx.lineTo(0, -(s-termR)); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, rr+ah);    ctx.lineTo(0, s-termR);    ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-(rr+ah), 0); ctx.lineTo(-(s-termR), 0); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(rr+ah, 0);    ctx.lineTo(s-termR, 0);    ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  // Terminal knot circles
  for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]] as [number,number][]) {
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(dx*s, dy*s, termR, 0, Math.PI * 2); ctx.fill()
    ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = 'white'; ctx.lineWidth = gw * 0.65
    ctx.beginPath(); ctx.arc(dx*s, dy*s, termR * 0.52, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, ah * 0.55, 0, Math.PI * 2); ctx.fill()
  cardinalLabels(ctx, s, gap + termR, fs, color, compass)
}

// ---------------------------------------------------------------------------
// Dragon (Vegvisir-inspired)
// ---------------------------------------------------------------------------

function drawDragon(ctx: CanvasRenderingContext2D, s: number, color: string, lw: number, gap: number, fs: number, compass: CompassConfig): void {
  const forkLen = s * 0.15, forkAngle = Math.PI / 6
  const cosF = Math.cos(forkAngle), sinF = Math.sin(forkAngle)

  ctx.strokeStyle = color; ctx.lineCap = 'round'

  for (let i = 0; i < 8; i++) {
    const θ = i * Math.PI / 4
    const dx = Math.sin(θ), dy = -Math.cos(θ), px = Math.cos(θ), py = Math.sin(θ)
    const isCardinal = i % 2 === 0
    const tl = isCardinal ? s : s * 0.76

    ctx.lineWidth = lw * 1.2
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx*tl, dy*tl); ctx.stroke()

    ctx.lineWidth = lw
    if (isCardinal) {
      for (const [frac, hr] of [[0.60, 0.21],[0.80, 0.14]] as [number,number][]) {
        const bx = dx*tl*frac, by = dy*tl*frac
        ctx.beginPath(); ctx.moveTo(bx-px*s*hr, by-py*s*hr); ctx.lineTo(bx+px*s*hr, by+py*s*hr); ctx.stroke()
      }
    } else {
      const bx = dx*tl*0.65, by = dy*tl*0.65
      ctx.beginPath(); ctx.moveTo(bx-px*s*0.13, by-py*s*0.13); ctx.lineTo(bx+px*s*0.13, by+py*s*0.13); ctx.stroke()
    }

    const f1dx = dx*cosF - dy*sinF, f1dy = dx*sinF + dy*cosF
    const f2dx = dx*cosF + dy*sinF, f2dy = -dx*sinF + dy*cosF
    ctx.beginPath(); ctx.moveTo(dx*tl, dy*tl); ctx.lineTo(dx*tl+f1dx*forkLen, dy*tl+f1dy*forkLen); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(dx*tl, dy*tl); ctx.lineTo(dx*tl+f2dx*forkLen, dy*tl+f2dy*forkLen); ctx.stroke()
  }

  const cr = lw * 4.5
  ctx.lineWidth = lw * 0.8
  ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, lw * 1.8, 0, Math.PI * 2); ctx.fill()
  cardinalLabels(ctx, s, gap + s * 0.14, fs, color, compass)
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  compass: CompassConfig,
): void {
  if (!compass.enabled) return
  const { size: s, color, lineWidth: lw } = compass
  const fs = Math.max(8, Math.round(s * 0.35))
  const gap = fs * 0.8
  ctx.save()
  ctx.translate(cx, cy)
  switch (compass.compassStyle) {
    case 'compass':  drawCompassStar(ctx, s, color, lw, gap, fs, compass); break
    case 'nautical': drawNautical   (ctx, s, color, lw, gap, fs, compass); break
    case 'celtic':   drawCeltic     (ctx, s, color, lw, gap, fs, compass); break
    case 'dragon':   drawDragon     (ctx, s, color, lw, gap, fs, compass); break
    default:         drawPlain      (ctx, s, color, lw, gap, fs, compass); break
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Coordinate format helper
// ---------------------------------------------------------------------------

function toDMS(degrees: number, isLat: boolean): string {
  const sign = degrees < 0 ? -1 : 1
  const abs = Math.abs(degrees)
  let d = Math.floor(abs)
  const mFrac = (abs - d) * 60
  let m = Math.floor(mFrac)
  let s = Math.round((mFrac - m) * 60)
  if (s >= 60) { s = 0; m += 1 }
  if (m >= 60) { m = 0; d += 1 }
  const dir = isLat ? (sign > 0 ? 'N' : 'S') : (sign > 0 ? 'E' : 'W')
  return `${d}°${m}'${s}"${dir}`
}

// ---------------------------------------------------------------------------
// Legend drawing
// ---------------------------------------------------------------------------

function drawLegend(
  ctx: CanvasRenderingContext2D,
  legend: LegendConfig,
  frame: FrameConfig,
  contourStyle: ContourStyle,
  hasElevationFlags: boolean,
  hasSlopeArrows: boolean,
  totalW: number,
  totalH: number,
  measureBar?: MeasureBarConfig,
  hasRuggednessFlags?: boolean,
  hasSwampMarkers?: boolean,
  swampMarkerColor?: string,
  roadTypeSummary?: Array<{ type: string; color: string }>,
  ruggednessSeverityColors?: string[],
  calibration?: ElevationCalibration,
): void {
  const hasGeoAnchor = legend.showGeoAnchor && !!measureBar?.enabled && !!measureBar?.geoEnabled
  const showColorBar = legend.showRuggednessFlags && !!hasRuggednessFlags
  const elevRange = calibration && calibration.realMin !== null && calibration.realMax !== null
    ? Math.abs(calibration.realMax - calibration.realMin) : undefined
  const unitAbbr = calibration?.unitType === 'feet' ? 'ft'
    : calibration?.unitType === 'meters' ? 'm'
    : calibration?.unitType === 'custom' ? (calibration.customAbbr || '') : undefined

  const roadItems: Array<{ type: string; label: string; color: string }> = []
  if (roadTypeSummary) {
    for (const { type, color } of roadTypeSummary) {
      const show = type === 'dirt' ? legend.showDirtRoads
        : type === 'gravel' ? legend.showGravelRoads
        : type === 'paved' ? legend.showPavedRoads
        : type === 'footpath' ? legend.showFootpaths
        : type === 'trail' ? legend.showTrails : false
      const label = type === 'dirt' ? legend.dirtRoadsLabel
        : type === 'gravel' ? legend.gravelRoadsLabel
        : type === 'paved' ? legend.pavedRoadsLabel
        : type === 'footpath' ? legend.footpathsLabel
        : legend.trailsLabel
      if (show) roadItems.push({ type: `road-${type}`, label, color })
    }
  }

  const items = [
    legend.showMinorContour                             ? { type: 'minor',      label: legend.minorLabel,         color: contourStyle.minorColor }   : null,
    legend.showMajorContour                             ? { type: 'major',      label: legend.majorLabel,         color: contourStyle.majorColor }   : null,
    legend.showSeaLevel && contourStyle.showSeaLevel    ? { type: 'sea-level',  label: legend.seaLevelLabel,      color: contourStyle.seaLevelColor }: null,
    legend.showElevationFlags && hasElevationFlags      ? { type: 'flag',       label: legend.flagLabel,          color: contourStyle.labelColor }   : null,
    legend.showSlopeArrows && hasSlopeArrows            ? { type: 'arrow',      label: legend.arrowLabel,         color: contourStyle.labelColor }   : null,
    hasGeoAnchor ? { type: 'geo-anchor', label: `${legend.geoAnchorLabel}: ${toDMS(measureBar!.anchorLat, true)}, ${toDMS(measureBar!.anchorLon, false)}`, color: legend.color } : null,
    showColorBar  ? { type: 'ruggedness', label: legend.ruggednessFlagLabel, color: legend.color } : null,
    legend.showSwampMarkers && !!hasSwampMarkers ? { type: 'swamp', label: legend.swampMarkerLabel, color: swampMarkerColor ?? '#388E3C' } : null,
    ...roadItems,
  ].filter(Boolean) as { type: string; label: string; color: string }[]

  if (items.length === 0) return

  const fs = legend.fontSize
  const rowH = fs * 1.6
  const sampW = fs * 3
  const gapX = fs * 0.6
  const pad = fs * 0.6
  const colGap = pad
  const barH = fs * 1.2
  const barLabelH = fs * 2.1
  const barTitleH = fs * 0.9
  const barSectionH = showColorBar ? (pad + barTitleH + barH + barLabelH) : 0

  ctx.font = `${fs}px serif`
  const maxLabelW = Math.max(...items.map(i => ctx.measureText(i.label).width))
  const colW = sampW + gapX + maxLabelW

  const cols = Math.max(1, Math.min(legend.columns, items.length))
  const rows = Math.ceil(items.length / cols)

  const minBarW = showColorBar ? 5 * fs * 3.2 : 0
  const boxW = Math.max(pad + cols * colW + (cols - 1) * colGap + pad, minBarW + 2 * pad)
  const boxH_items = pad + rows * rowH + pad
  const boxH = boxH_items + barSectionH
  const edgeGap = Math.max(4, (frame.borderEnabled ? frame.borderWidth * 2 : 0) + 3)

  const [boxX, boxY] = getBoxOrigin(legend.position, frame, totalW, totalH, boxW, boxH, edgeGap)

  ctx.fillStyle = frame.marginColor
  ctx.fillRect(boxX, boxY, boxW, boxH)
  ctx.strokeStyle = legend.color; ctx.lineWidth = 0.5
  ctx.strokeRect(boxX + 0.25, boxY + 0.25, boxW - 0.5, boxH - 0.5)

  ctx.lineCap = 'round'; ctx.setLineDash([])

  for (let i = 0; i < items.length; i++) {
    const { type, label } = items[i]
    const col = Math.floor(i / rows)
    const row = i % rows
    const sx1 = boxX + pad + col * (colW + colGap)
    const sx2 = sx1 + sampW
    const midY = boxY + pad + row * rowH + rowH / 2

    if (type === 'minor') {
      ctx.strokeStyle = contourStyle.minorColor; ctx.lineWidth = contourStyle.minorWidth
      ctx.beginPath(); ctx.moveTo(sx1, midY); ctx.lineTo(sx2, midY); ctx.stroke()
    } else if (type === 'major') {
      ctx.strokeStyle = contourStyle.majorColor; ctx.lineWidth = contourStyle.majorWidth
      ctx.beginPath(); ctx.moveTo(sx1, midY); ctx.lineTo(sx2, midY); ctx.stroke()
    } else if (type === 'sea-level') {
      ctx.strokeStyle = contourStyle.seaLevelColor; ctx.lineWidth = contourStyle.seaLevelWidth
      ctx.setLineDash(contourStyle.seaLevelDash === 'dashed' ? [4, 2] : contourStyle.seaLevelDash === 'dotted' ? [1, 2] : [])
      ctx.beginPath(); ctx.moveTo(sx1, midY); ctx.lineTo(sx2, midY); ctx.stroke()
      ctx.setLineDash([])
    } else if (type === 'flag') {
      const h = rowH * 0.65, fx = sx1 + sampW / 2 - h * 0.2, fy = midY - h / 2
      ctx.strokeStyle = contourStyle.labelColor; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + h); ctx.stroke()
      ctx.fillStyle = contourStyle.labelColor; ctx.beginPath()
      ctx.moveTo(fx, fy); ctx.lineTo(fx + h*0.5, fy + h*0.22); ctx.lineTo(fx, fy + h*0.43)
      ctx.closePath(); ctx.fill()
    } else if (type === 'geo-anchor') {
      const cx_icon = sx1 + sampW / 2
      const r_icon = rowH * 0.3
      ctx.strokeStyle = legend.color; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.moveTo(cx_icon - r_icon * 1.3, midY); ctx.lineTo(cx_icon + r_icon * 1.3, midY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx_icon, midY - r_icon * 1.3); ctx.lineTo(cx_icon, midY + r_icon * 1.3); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx_icon, midY, r_icon, 0, Math.PI * 2); ctx.stroke()
    } else if (type === 'ruggedness') {
      const sc = rowH * 0.45
      const cx = sx1 + sampW / 2
      const cy_tip = midY + sc * 0.825
      ctx.beginPath()
      ctx.moveTo(cx, cy_tip)
      ctx.lineTo(cx - sc*0.48, cy_tip - sc*0.8)
      ctx.lineTo(cx - sc*0.32, cy_tip - sc*1.5)
      ctx.lineTo(cx - sc*0.1,  cy_tip - sc*0.95)
      ctx.lineTo(cx + sc*0.05, cy_tip - sc*1.65)
      ctx.lineTo(cx + sc*0.22, cy_tip - sc*1.05)
      ctx.lineTo(cx + sc*0.38, cy_tip - sc*1.35)
      ctx.lineTo(cx + sc*0.48, cy_tip - sc*0.8)
      ctx.closePath()
      ctx.fillStyle = TRI_COLORS[2]; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.7; ctx.lineJoin = 'round'
      ctx.stroke()
    } else if (type === 'swamp') {
      const color = swampMarkerColor ?? '#388E3C'
      const s = rowH * 0.4
      const sfx = sx1 + sampW / 2
      const sfy = midY + s * 0.15
      ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(sfx, sfy); ctx.lineTo(sfx, sfy - s); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sfx, sfy); ctx.lineTo(sfx - s * 0.22, sfy - s * 0.88); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sfx, sfy); ctx.lineTo(sfx + s * 0.22, sfy - s * 0.88); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sfx, sfy); ctx.quadraticCurveTo(sfx - s * 0.52, sfy - s * 0.62, sfx - s * 0.64, sfy - s * 0.18); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sfx, sfy); ctx.quadraticCurveTo(sfx + s * 0.52, sfy - s * 0.62, sfx + s * 0.64, sfy - s * 0.18); ctx.stroke()
    } else if (type === 'road-dirt' || type === 'road-gravel' || type === 'road-paved') {
      const gap = rowH * 0.22
      ctx.strokeStyle = items[i].color; ctx.lineWidth = 1.2; ctx.lineCap = 'round'
      ctx.setLineDash(type === 'road-dirt' ? [2, 3] : type === 'road-gravel' ? [5, 2] : [])
      ctx.beginPath(); ctx.moveTo(sx1, midY - gap); ctx.lineTo(sx2, midY - gap); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(sx1, midY + gap); ctx.lineTo(sx2, midY + gap); ctx.stroke()
      ctx.setLineDash([])
    } else if (type === 'road-footpath') {
      ctx.strokeStyle = items[i].color; ctx.lineWidth = 1.2; ctx.lineCap = 'round'
      ctx.setLineDash([1, 3])
      ctx.beginPath(); ctx.moveTo(sx1, midY); ctx.lineTo(sx2, midY); ctx.stroke()
      ctx.setLineDash([])
    } else if (type === 'road-trail') {
      ctx.strokeStyle = items[i].color; ctx.lineWidth = 1.2; ctx.lineCap = 'round'
      ctx.setLineDash([1, 2, 5, 2])
      ctx.beginPath(); ctx.moveTo(sx1, midY); ctx.lineTo(sx2, midY); ctx.stroke()
      ctx.setLineDash([])
    } else {
      const w = sampW * 0.6, hw = w * 0.28, hl = w * 0.3
      const ax1 = sx1 + (sampW - w) / 2, ax2 = ax1 + w, ab = ax2 - hl
      ctx.strokeStyle = contourStyle.labelColor; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(ax1, midY); ctx.lineTo(ab, midY); ctx.stroke()
      ctx.fillStyle = contourStyle.labelColor; ctx.beginPath()
      ctx.moveTo(ax2, midY); ctx.lineTo(ab, midY - hw); ctx.lineTo(ab, midY + hw)
      ctx.closePath(); ctx.fill()
    }

    ctx.fillStyle = legend.color; ctx.font = `${fs}px serif`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(label, sx2 + gapX, midY)
  }

  // TRI severity color bar
  if (showColorBar) {
    const barY = boxY + boxH_items
    const barX = boxX + pad
    const barInnerW = boxW - 2 * pad
    const tierW = barInnerW / 5

    ctx.strokeStyle = legend.color; ctx.lineWidth = 0.3; ctx.globalAlpha = 0.4
    ctx.beginPath(); ctx.moveTo(boxX + pad, barY); ctx.lineTo(boxX + boxW - pad, barY); ctx.stroke()
    ctx.globalAlpha = 1

    ctx.fillStyle = legend.color; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    ctx.font = `${fs * 0.75}px sans-serif`
    ctx.fillText(legend.ruggednessFlagLabel, barX, barY + fs * 0.1)

    const triColors = ruggednessSeverityColors ?? [...TRI_COLORS]
    triColors.forEach((color, i) => {
      ctx.fillStyle = color
      ctx.fillRect(barX + i * tierW, barY + pad * 0.5 + barTitleH, tierW, barH)
    })

    ctx.fillStyle = legend.color; ctx.textBaseline = 'top'; ctx.textAlign = 'center'
    TRI_LABELS.forEach((label, i) => {
      ctx.font = `${fs * 0.75}px sans-serif`
      ctx.fillText(label, barX + i * tierW + tierW / 2, barY + pad * 0.5 + barTitleH + barH + fs * 0.15)
      ctx.font = `${fs * 0.6}px sans-serif`
      ctx.fillText(triRangeLabel(i, elevRange, unitAbbr), barX + i * tierW + tierW / 2, barY + pad * 0.5 + barTitleH + barH + fs * 1.05)
    })
  }
}


// ---------------------------------------------------------------------------
// Overlay-only export
// ---------------------------------------------------------------------------

export async function exportOverlayToBlob(config: OverlayExportConfig): Promise<Blob> {
  const contourSvg = document.getElementById('contour-svg') as SVGSVGElement | null
  const annotSvg = document.getElementById('annotation-svg') as SVGSVGElement | null

  const ref = annotSvg ?? contourSvg
  if (!ref) throw new Error('No SVG layer found — nothing to export')

  const rect = ref.getBoundingClientRect()
  const mapW = Math.round(rect.width)
  const mapH = Math.round(rect.height)
  if (mapW === 0 || mapH === 0) throw new Error('Map area has zero size')

  const withFrame = !!(config.includeFrame && config.frame)
  const ml = withFrame ? config.frame!.marginLeft  : 0
  const mt = withFrame ? config.frame!.marginTop    : 0
  const mr = withFrame ? config.frame!.marginRight  : 0
  const mb = withFrame ? config.frame!.marginBottom : 0
  const totalW = mapW + ml + mr
  const totalH = mapH + mt + mb

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')!

  // Margin strips (never touches the map area)
  if (withFrame) {
    const fb = config.frameBackground ?? 'colored'
    const fbColor = fb === 'white' ? '#ffffff' : fb === 'colored' ? (config.frameBgColor || config.frame!.marginColor) : null
    if (fbColor) {
      ctx.fillStyle = fbColor
      if (mt > 0) ctx.fillRect(0, 0, totalW, mt)
      if (mb > 0) ctx.fillRect(0, totalH - mb, totalW, mb)
      if (ml > 0) ctx.fillRect(0, mt, ml, mapH)
      if (mr > 0) ctx.fillRect(totalW - mr, mt, mr, mapH)
    }
  }

  // Map area background (never extends into margins)
  if (config.mode === 'white') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(ml, mt, mapW, mapH)
  } else if (config.mode === 'colored') {
    ctx.globalAlpha = config.bgOpacity
    ctx.fillStyle = config.bgColor
    ctx.fillRect(ml, mt, mapW, mapH)
    ctx.globalAlpha = 1
  }

  // SVG overlay layers
  if (config.overlayOpacity > 0) {
    if (contourSvg) {
      const url = svgToDataUrl(contourSvg, mapW, mapH)
      const img = await loadImage(url)
      ctx.globalAlpha = config.overlayOpacity
      ctx.drawImage(img, ml, mt, mapW, mapH)
      ctx.globalAlpha = 1
    }
    if (annotSvg) {
      const url = svgToDataUrl(annotSvg, mapW, mapH)
      const img = await loadImage(url)
      ctx.globalAlpha = config.overlayOpacity
      ctx.drawImage(img, ml, mt, mapW, mapH)
      ctx.globalAlpha = 1
    }
  }

  // Grid overlay
  if (config.includeGrid && config.grid?.enabled) {
    drawGridIntoContext(ctx, ml, mt, mapW, mapH, config.grid, config.measureBar, config.calibration)
  }

  // Frame border on top of everything
  if (withFrame && config.frame!.borderEnabled) {
    drawFrameBorder(ctx, config.frame!, totalW, totalH)
  }
  if (withFrame && config.title) {
    drawTitle(ctx, config.title, config.frame!, totalW, totalH)
  }
  if (withFrame && config.compass) {
    const cs = config.compass.size
    const cfs = Math.max(8, Math.round(cs * 0.35))
    const compassEdgeGap = cs + cs * 0.22 + cfs * 1.4 + 4
    const [cx, cy] = getPositionCenter(config.compass.position, config.frame!, totalW, totalH, compassEdgeGap)
    drawCompassRose(ctx, cx, cy, config.compass)
  }
  if (withFrame && config.legend && config.contourStyle) {
    drawLegend(ctx, config.legend, config.frame!, config.contourStyle,
      config.hasElevationFlags ?? false, config.hasSlopeArrows ?? false, totalW, totalH, config.measureBar, config.hasRuggednessFlags, config.hasSwampMarkers, config.swampMarkerColor, config.roadTypeSummary, config.ruggednessSeverityColors, config.calibration)
  }
  if (withFrame && config.measureBar?.enabled && config.calibration && config.heightmap) {
    drawMeasureBars(ctx, config.measureBar, config.calibration, config.heightmap, config.frame!, totalW, totalH)
  }

  return canvasToBlob(canvas)
}

// ---------------------------------------------------------------------------
// Full map export (base image + overlays)
// ---------------------------------------------------------------------------

export async function exportToBlob(config: ExportLayerConfig): Promise<Blob> {
  const contourSvg = document.getElementById('contour-svg') as SVGSVGElement | null
  const annotSvg = document.getElementById('annotation-svg') as SVGSVGElement | null

  const ref = annotSvg ?? contourSvg
  if (!ref) throw new Error('No SVG layer found — nothing to export')

  const rect = ref.getBoundingClientRect()
  const mapW = Math.round(rect.width)
  const mapH = Math.round(rect.height)
  if (mapW === 0 || mapH === 0) throw new Error('Map area has zero size')

  const withFrame = !!(config.includeFrame && config.frame)
  const ml = withFrame ? config.frame!.marginLeft  : 0
  const mt = withFrame ? config.frame!.marginTop    : 0
  const mr = withFrame ? config.frame!.marginRight  : 0
  const mb = withFrame ? config.frame!.marginBottom : 0
  const totalW = mapW + ml + mr
  const totalH = mapH + mt + mb

  const canvas = document.createElement('canvas')
  canvas.width = totalW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')!

  if (withFrame) {
    ctx.fillStyle = config.frame!.marginColor
    ctx.fillRect(0, 0, totalW, totalH)
  }

  if (config.baseImageUrl) {
    const img = await loadImage(config.baseImageUrl)
    ctx.drawImage(img, ml, mt, mapW, mapH)
  }

  if (config.includeContours && contourSvg && config.contourOpacity > 0) {
    const url = svgToDataUrl(contourSvg, mapW, mapH)
    const img = await loadImage(url)
    ctx.globalAlpha = config.contourOpacity
    ctx.drawImage(img, ml, mt, mapW, mapH)
    ctx.globalAlpha = 1
  }

  if (config.includeAnnotations && annotSvg) {
    const url = svgToDataUrl(annotSvg, mapW, mapH)
    const img = await loadImage(url)
    ctx.drawImage(img, ml, mt, mapW, mapH)
  }

  if (config.includeGrid && config.grid?.enabled) {
    drawGridIntoContext(ctx, ml, mt, mapW, mapH, config.grid, config.measureBar, config.calibration)
  }

  if (withFrame && config.frame!.borderEnabled) {
    drawFrameBorder(ctx, config.frame!, totalW, totalH)
  }
  if (withFrame && config.title) {
    drawTitle(ctx, config.title, config.frame!, totalW, totalH)
  }
  if (withFrame && config.compass) {
    const cs = config.compass.size
    const cfs = Math.max(8, Math.round(cs * 0.35))
    const compassEdgeGap = cs + cs * 0.22 + cfs * 1.4 + 4
    const [cx, cy] = getPositionCenter(config.compass.position, config.frame!, totalW, totalH, compassEdgeGap)
    drawCompassRose(ctx, cx, cy, config.compass)
  }
  if (withFrame && config.legend && config.contourStyle) {
    drawLegend(ctx, config.legend, config.frame!, config.contourStyle,
      config.hasElevationFlags ?? false, config.hasSlopeArrows ?? false, totalW, totalH, config.measureBar, config.hasRuggednessFlags, config.hasSwampMarkers, config.swampMarkerColor, config.roadTypeSummary, config.ruggednessSeverityColors, config.calibration)
  }
  if (withFrame && config.measureBar?.enabled && config.calibration && config.heightmap) {
    drawMeasureBars(ctx, config.measureBar, config.calibration, config.heightmap, config.frame!, totalW, totalH)
  }

  return canvasToBlob(canvas)
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function svgToDataUrl(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const svgStr = new XMLSerializer().serializeToString(clone)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 60)}`))
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas export failed'))
    }, 'image/png')
  })
}
