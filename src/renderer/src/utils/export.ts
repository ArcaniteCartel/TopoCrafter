import type { FrameConfig } from '../types'

export interface ExportLayerConfig {
  baseImageUrl: string | null
  includeContours: boolean
  includeAnnotations: boolean
  contourOpacity: number
  frame?: FrameConfig
  includeFrame?: boolean
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
