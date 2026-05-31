export interface ExportLayerConfig {
  baseImageUrl: string | null
  includeContours: boolean
  includeAnnotations: boolean
  contourOpacity: number
}

export type OverlayBackgroundMode = 'transparent' | 'white' | 'colored' | 'grid'
export type OverlayGridType = 'square' | 'hex'

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
}

export async function exportOverlayToBlob(config: OverlayExportConfig): Promise<Blob> {
  const contourSvg = document.getElementById('contour-svg') as SVGSVGElement | null
  const annotSvg = document.getElementById('annotation-svg') as SVGSVGElement | null

  const ref = annotSvg ?? contourSvg
  if (!ref) throw new Error('No SVG layer found — nothing to export')

  const rect = ref.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  if (width === 0 || height === 0) throw new Error('Map area has zero size')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  if (config.mode === 'white') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  } else if (config.mode === 'colored') {
    ctx.globalAlpha = config.bgOpacity
    ctx.fillStyle = config.bgColor
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  } else if (config.mode === 'grid') {
    if (config.bgOpacity > 0) {
      ctx.globalAlpha = config.bgOpacity
      ctx.fillStyle = config.bgColor
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1
    }
    if (config.gridType === 'square') {
      drawSquareGrid(ctx, width, height, config.gridIntervalPx, config.gridColor, config.gridThickness, config.gridOpacity)
    } else {
      drawHexGrid(ctx, width, height, config.gridIntervalPx, config.gridColor, config.gridThickness, config.gridOpacity)
    }
  }

  if (config.overlayOpacity > 0) {
    if (contourSvg) {
      const url = svgToDataUrl(contourSvg, width, height)
      const img = await loadImage(url)
      ctx.globalAlpha = config.overlayOpacity
      ctx.drawImage(img, 0, 0, width, height)
      ctx.globalAlpha = 1
    }
    if (annotSvg) {
      const url = svgToDataUrl(annotSvg, width, height)
      const img = await loadImage(url)
      ctx.globalAlpha = config.overlayOpacity
      ctx.drawImage(img, 0, 0, width, height)
      ctx.globalAlpha = 1
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas export failed'))
    }, 'image/png')
  })
}

function drawSquareGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intervalPx: number,
  color: string,
  thickness: number,
  opacity: number,
): void {
  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tc = temp.getContext('2d')!
  tc.strokeStyle = color
  tc.lineWidth = thickness
  for (let x = 0; x <= width; x += intervalPx) {
    tc.beginPath(); tc.moveTo(x, 0); tc.lineTo(x, height); tc.stroke()
  }
  for (let y = 0; y <= height; y += intervalPx) {
    tc.beginPath(); tc.moveTo(0, y); tc.lineTo(width, y); tc.stroke()
  }
  ctx.globalAlpha = opacity
  ctx.drawImage(temp, 0, 0)
  ctx.globalAlpha = 1
}

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intervalPx: number,
  color: string,
  thickness: number,
  opacity: number,
): void {
  // intervalPx = flat-to-flat distance (hex height for flat-top orientation)
  const R = intervalPx / Math.sqrt(3)   // circumradius (center to vertex)
  const colStep = 1.5 * R               // horizontal distance between column centers
  const rowStep = intervalPx            // vertical distance between hex centers in a column
  const rowOffset = intervalPx / 2      // odd-column vertical offset

  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tc = temp.getContext('2d')!
  tc.strokeStyle = color
  tc.lineWidth = thickness

  const numCols = Math.ceil(width / colStep) + 2
  const numRows = Math.ceil(height / rowStep) + 2

  for (let col = -1; col < numCols; col++) {
    const cx = col * colStep
    const yOff = col % 2 !== 0 ? rowOffset : 0
    for (let row = -1; row < numRows; row++) {
      const cy = row * rowStep + yOff
      tc.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i   // 0°, 60°, 120°, 180°, 240°, 300° → flat-top
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
  ctx.drawImage(temp, 0, 0)
  ctx.globalAlpha = 1
}

export async function exportToBlob(config: ExportLayerConfig): Promise<Blob> {
  const contourSvg = document.getElementById('contour-svg') as SVGSVGElement | null
  const annotSvg = document.getElementById('annotation-svg') as SVGSVGElement | null

  const ref = annotSvg ?? contourSvg
  if (!ref) throw new Error('No SVG layer found — nothing to export')

  const rect = ref.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  if (width === 0 || height === 0) throw new Error('Map area has zero size')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  if (config.baseImageUrl) {
    const img = await loadImage(config.baseImageUrl)
    ctx.drawImage(img, 0, 0, width, height)
  }

  if (config.includeContours && contourSvg && config.contourOpacity > 0) {
    const url = svgToDataUrl(contourSvg, width, height)
    const img = await loadImage(url)
    ctx.globalAlpha = config.contourOpacity
    ctx.drawImage(img, 0, 0, width, height)
    ctx.globalAlpha = 1
  }

  if (config.includeAnnotations && annotSvg) {
    const url = svgToDataUrl(annotSvg, width, height)
    const img = await loadImage(url)
    ctx.drawImage(img, 0, 0, width, height)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas export failed'))
    }, 'image/png')
  })
}

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
