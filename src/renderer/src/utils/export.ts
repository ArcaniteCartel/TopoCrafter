export interface ExportLayerConfig {
  baseImageUrl: string | null
  includeContours: boolean
  includeAnnotations: boolean
  contourOpacity: number
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
      const rotation =
        config.gridType === 'hex-flat'    ? 0 :
        config.gridType === 'hex-pointy'  ? Math.PI / 6 :
        /* hex-rotated */                   Math.PI / 4
      drawHexGrid(ctx, width, height, config.gridIntervalPx, rotation, config.gridColor, config.gridThickness, config.gridOpacity)
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

  // Grid centred on canvas so it is symmetric for all rotation angles
  const originX = width / 2
  const originY = height / 2
  const N = Math.ceil(Math.sqrt(width * width + height * height) / intervalPx) + 2

  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tc = temp.getContext('2d')!
  tc.strokeStyle = color
  tc.lineWidth = thickness

  for (let n = -N; n <= N; n++) {
    for (let m = -N; m <= N; m++) {
      const cx = originX + n * b1x + m * b2x
      const cy = originY + n * b1y + m * b2y
      if (cx < -2 * R || cx > width + 2 * R || cy < -2 * R || cy > height + 2 * R) continue
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
