import { decode as decodePng } from 'fast-png'
import { fromArrayBuffer as tiffFromArrayBuffer } from 'geotiff'
import type { HeightmapInfo } from '../types'

function extOf(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

function mimeTypeFromPath(filePath: string): string {
  switch (extOf(filePath)) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    default: return 'image/png'
  }
}

// Direct PNG decoding via fast-png — handles 8-bit and 16-bit grayscale/RGB/RGBA.
// Bypasses the Canvas API so 16-bit heightmaps (World Machine, Houdini, etc.) work correctly.
function parseHeightmapPng(buffer: Uint8Array): HeightmapInfo {
  const img = decodePng(buffer)
  const { width, height, data, depth, channels } = img
  const maxValue = depth === 16 ? 65535 : 255

  const pixels = new Float32Array(width * height)
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < width * height; i++) {
    let value: number
    switch (channels) {
      case 1: // Grayscale
        value = data[i] / maxValue
        break
      case 2: // Grayscale + alpha
        value = data[i * 2] / maxValue
        break
      case 3: // RGB — compute BT.709 luminance
        value = (0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]) / maxValue
        break
      default: // RGBA
        value = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / maxValue
        break
    }
    pixels[i] = value
    if (value < min) min = value
    if (value > max) max = value
  }

  return { width, height, data: pixels, minValue: min, maxValue: max }
}

// Canvas-based fallback for JPEG (which can never be 16-bit anyway).
async function parseHeightmapCanvas(buffer: Uint8Array, filePath: string): Promise<HeightmapInfo> {
  const blob = new Blob([buffer], { type: mimeTypeFromPath(filePath) })
  const url = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        URL.revokeObjectURL(url)

        const data = new Float32Array(img.width * img.height)
        let min = Infinity
        let max = -Infinity
        for (let i = 0; i < img.width * img.height; i++) {
          const r = imageData.data[i * 4]
          const g = imageData.data[i * 4 + 1]
          const b = imageData.data[i * 4 + 2]
          const value = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          data[i] = value
          if (value < min) min = value
          if (value > max) max = value
        }
        resolve({ width: img.width, height: img.height, data, minValue: min, maxValue: max })
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to decode image: ${filePath}`))
    }
    img.src = url
  })
}

async function parseHeightmapTiff(buffer: Uint8Array): Promise<HeightmapInfo> {
  // Slice to own ArrayBuffer — geotiff takes ownership of it
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const tiff = await tiffFromArrayBuffer(ab)
  const image = await tiff.getImage()
  const width = image.getWidth()
  const height = image.getHeight()

  const rasters = await image.readRasters()
  const band = rasters[0] as Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Float32Array | Float64Array

  // Determine normaliser: uint types use their theoretical max; float/signed use actual range
  const sampleFormat = image.getSampleFormat()   // 1=uint 2=int 3=float
  const bitsPerSample = (image.getBitsPerSample() as number[])[0] ?? 8
  const isFloat = sampleFormat === 3
  const isSigned = sampleFormat === 2

  let rawMin = Infinity
  let rawMax = -Infinity
  for (let i = 0; i < band.length; i++) {
    if (band[i] < rawMin) rawMin = band[i]
    if (band[i] > rawMax) rawMax = band[i]
  }

  let normaliser: number
  let shift = 0
  if (isFloat || isSigned) {
    shift = rawMin
    normaliser = rawMax - rawMin || 1
  } else {
    normaliser = (1 << bitsPerSample) - 1  // e.g. 65535 for 16-bit uint
  }

  const pixels = new Float32Array(width * height)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < width * height; i++) {
    const v = (band[i] - shift) / normaliser
    pixels[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }

  return { width, height, data: pixels, minValue: min, maxValue: max }
}

export async function loadHeightmapFromPath(filePath: string): Promise<HeightmapInfo> {
  const buffer = await window.electronAPI.readFile(filePath)
  const ext = extOf(filePath)
  if (ext === 'png') return parseHeightmapPng(buffer)
  if (ext === 'tif' || ext === 'tiff') return parseHeightmapTiff(buffer)
  return parseHeightmapCanvas(buffer, filePath)
}

export async function loadTerrainImageUrl(filePath: string): Promise<string> {
  const buffer = await window.electronAPI.readFile(filePath)
  const blob = new Blob([buffer], { type: mimeTypeFromPath(filePath) })
  return URL.createObjectURL(blob)
}
