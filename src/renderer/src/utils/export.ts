import type { FrameConfig, TitleConfig, CompassConfig } from '../types'

export interface ExportLayerConfig {
  baseImageUrl: string | null
  includeContours: boolean
  includeAnnotations: boolean
  contourOpacity: number
  frame?: FrameConfig
  includeFrame?: boolean
  title?: TitleConfig
  compass?: CompassConfig
}

export type OverlayBackgroundMode = 'transparent' | 'white' | 'colored' | 'grid'
export type OverlayGridType = 'square' | 'hex-flat' | 'hex-pointy' | 'hex-rotated'

export interface OverlayExportConfig {
  overlayOpacity: number
  mode: OverlayBackgroundMode
  bgColor: string
  bgOpacity: number
  gridType: OverlayGridType
  gridIntervalPx: number
  gridColor: string
  gridThickness: number
  gridOpacity: number
  frame?: FrameConfig
  includeFrame?: boolean
  title?: TitleConfig
  compass?: CompassConfig
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
): void {
  if (!title.enabled || !title.text.trim()) return
  const parts: string[] = []
  if (title.bold) parts.push('bold')
  if (title.italic) parts.push('italic')
  parts.push(`${title.size}px`)
  parts.push(title.font)
  ctx.font = parts.join(' ')
  ctx.fillStyle = title.color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(title.text.trim(), frame.marginLeft, frame.marginTop / 2)
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
// Grid helpers — draw into offset region of the destination canvas
// ---------------------------------------------------------------------------

function drawSquareGrid(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  mapW: number,
  mapH: number,
  intervalPx: number,
  color: string,
  thickness: number,
  opacity: number,
): void {
  const temp = document.createElement('canvas')
  temp.width = mapW
  temp.height = mapH
  const tc = temp.getContext('2d')!
  tc.strokeStyle = color
  tc.lineWidth = thickness
  for (let x = 0; x <= mapW; x += intervalPx) {
    tc.beginPath(); tc.moveTo(x, 0); tc.lineTo(x, mapH); tc.stroke()
  }
  for (let y = 0; y <= mapH; y += intervalPx) {
    tc.beginPath(); tc.moveTo(0, y); tc.lineTo(mapW, y); tc.stroke()
  }
  ctx.globalAlpha = opacity
  ctx.drawImage(temp, offsetX, offsetY)
  ctx.globalAlpha = 1
}

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  mapW: number,
  mapH: number,
  intervalPx: number,
  rotationRad: number,
  color: string,
  thickness: number,
  opacity: number,
): void {
  // intervalPx = flat-to-flat distance; R = circumradius (center to vertex)
  const R = intervalPx / Math.sqrt(3)
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)

  // Hexagonal Bravais lattice basis vectors for flat-top (rotationRad=0):
  //   b1 = (3R/2,  R√3/2)   b2 = (0, R√3)
  // Rotated by rotationRad via 2D rotation matrix:
  const b1x = R * (1.5 * cos - (Math.sqrt(3) / 2) * sin)
  const b1y = R * (1.5 * sin + (Math.sqrt(3) / 2) * cos)
  const b2x = R * (-Math.sqrt(3) * sin)
  const b2y = R * (Math.sqrt(3) * cos)

  const originX = mapW / 2
  const originY = mapH / 2
  const N = Math.ceil(Math.sqrt(mapW * mapW + mapH * mapH) / intervalPx) + 2

  const temp = document.createElement('canvas')
  temp.width = mapW
  temp.height = mapH
  const tc = temp.getContext('2d')!
  tc.strokeStyle = color
  tc.lineWidth = thickness

  for (let n = -N; n <= N; n++) {
    for (let m = -N; m <= N; m++) {
      const cx = originX + n * b1x + m * b2x
      const cy = originY + n * b1y + m * b2y
      if (cx < -2 * R || cx > mapW + 2 * R || cy < -2 * R || cy > mapH + 2 * R) continue
      tc.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = rotationRad + (Math.PI / 3) * i
        const vx = cx + R * Math.cos(angle)
        const vy = cy + R * Math.sin(angle)
        if (i === 0) tc.moveTo(vx, vy)
        else tc.lineTo(vx, vy)
      }
      tc.closePath()
      tc.stroke()
    }
  }

  ctx.globalAlpha = opacity
  ctx.drawImage(temp, offsetX, offsetY)
  ctx.globalAlpha = 1
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

  // Margin background
  if (withFrame) {
    ctx.fillStyle = config.frame!.marginColor
    ctx.fillRect(0, 0, totalW, totalH)
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
  } else if (config.mode === 'grid') {
    if (config.bgOpacity > 0) {
      ctx.globalAlpha = config.bgOpacity
      ctx.fillStyle = config.bgColor
      ctx.fillRect(ml, mt, mapW, mapH)
      ctx.globalAlpha = 1
    }
    // Grid drawn onto a temp canvas sized for the map area, then composited at map offset
    // — ensures grid lines never bleed into the frame margins
    if (config.gridType === 'square') {
      drawSquareGrid(ctx, ml, mt, mapW, mapH, config.gridIntervalPx, config.gridColor, config.gridThickness, config.gridOpacity)
    } else {
      const rotation =
        config.gridType === 'hex-flat'   ? 0 :
        config.gridType === 'hex-pointy' ? Math.PI / 6 :
        /* hex-rotated */                  Math.PI / 4
      drawHexGrid(ctx, ml, mt, mapW, mapH, config.gridIntervalPx, rotation, config.gridColor, config.gridThickness, config.gridOpacity)
    }
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

  // Frame border on top of everything
  if (withFrame && config.frame!.borderEnabled) {
    drawFrameBorder(ctx, config.frame!, totalW, totalH)
  }
  if (withFrame && config.title) {
    drawTitle(ctx, config.title, config.frame!)
  }
  if (withFrame && config.compass) {
    drawCompassRose(ctx, totalW / 2, totalH - config.frame!.marginBottom / 2, config.compass)
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

  if (withFrame && config.frame!.borderEnabled) {
    drawFrameBorder(ctx, config.frame!, totalW, totalH)
  }
  if (withFrame && config.title) {
    drawTitle(ctx, config.title, config.frame!)
  }
  if (withFrame && config.compass) {
    drawCompassRose(ctx, totalW / 2, totalH - config.frame!.marginBottom / 2, config.compass)
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
