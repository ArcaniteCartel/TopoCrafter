import type { HeightmapInfo, HillshadeParameters } from '../types'

export function generateHillshade(
  heightmap: HeightmapInfo,
  params: HillshadeParameters
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Yield one frame so any loading indicator can paint before the CPU work blocks the thread
    requestAnimationFrame(() => {
      try {
        const { data, width, height } = heightmap
        const { azimuth, altitude, zFactor, intensity, brightness } = params

        const azRad = (azimuth * Math.PI) / 180
        const altRad = (altitude * Math.PI) / 180

        // Light direction in image coordinate space (x=east, y=north/-up, z=up)
        const lx = Math.cos(altRad) * Math.sin(azRad)
        const ly = -Math.cos(altRad) * Math.cos(azRad)
        const lz = Math.sin(altRad)

        // Dot product for a perfectly flat surface = lz; we center output at 0.5
        // so flat terrain renders as mid-grey and intensity scales deviations linearly

        const output = new Uint8ClampedArray(width * height * 4)

        const sample = (x: number, y: number): number =>
          data[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))]

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            // Sobel gradient — smoother than central differences on noisy heightmaps
            const dzdx = (
              (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1)) -
              (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1))
            ) / 8

            const dzdy = (
              (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1)) -
              (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1))
            ) / 8

            const nx = -dzdx * zFactor
            const ny = -dzdy * zFactor
            const nz = 1
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz)

            const dot = (nx * lx + ny * ly + nz * lz) / len
            const value = Math.round(Math.max(0, Math.min(1, brightness + (dot - lz) * intensity)) * 255)

            const i = (y * width + x) * 4
            output[i] = value
            output[i + 1] = value
            output[i + 2] = value
            output[i + 3] = 255
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.putImageData(new ImageData(output, width, height), 0, 0)
        canvas.toBlob((blob) => resolve(URL.createObjectURL(blob!)), 'image/png')
      } catch (err) {
        reject(err)
      }
    })
  })
}
