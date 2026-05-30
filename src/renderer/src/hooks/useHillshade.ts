import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { generateHillshade } from '../utils/hillshade'

const DEBOUNCE_MS = 300

export function useHillshade(): void {
  const heightmap = useStore((s) => s.heightmap)
  const hillshadeVersion = useStore((s) => s.hillshadeVersion)
  const hillshadeParams = useStore((s) => s.hillshadeParams)
  const elevationCalibration = useStore((s) => s.elevationCalibration)
  const setTerrainHillshade = useStore((s) => s.setTerrainHillshade)
  const setHillshadeGenerating = useStore((s) => s.setHillshadeGenerating)

  const hillshadeParamsRef = useRef(hillshadeParams)
  hillshadeParamsRef.current = hillshadeParams
  const elevationCalibrationRef = useRef(elevationCalibration)
  elevationCalibrationRef.current = elevationCalibration

  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!heightmap) {
      setHillshadeGenerating(false)
      return
    }

    let cancelled = false
    setHillshadeGenerating(true)

    const timer = setTimeout(() => {
      const params = hillshadeParamsRef.current
      const cal = elevationCalibrationRef.current

      let effectiveZFactor = params.zFactor
      if (cal.mapWidth && cal.mapWidth > 0 && cal.realMin !== null && cal.realMax !== null) {
        const elevRange = Math.abs(cal.realMax - cal.realMin)
        const groundRes = cal.mapWidth / heightmap.width
        if (elevRange > 0 && groundRes > 0) {
          effectiveZFactor = (elevRange / groundRes) * params.verticalExaggeration
        }
      }

      generateHillshade(heightmap, { ...params, zFactor: effectiveZFactor })
        .then((url) => {
          if (cancelled) { URL.revokeObjectURL(url); return }
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
          prevUrlRef.current = url
          setTerrainHillshade(url)
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('Hillshade generation failed:', err)
            setHillshadeGenerating(false)
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hillshadeVersion, heightmap])
}
