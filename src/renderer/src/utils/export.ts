export interface ExportLayerConfig {
  baseImageUrl: string | null
  includeContours: boolean
  includeAnnotations: boolean
  contourOpacity: number
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
