import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { generateHillshade } from '../utils/hillshade'

const DEBOUNCE_MS = 300

export function useHillshade(): void {
  const heightmap = useStore((s) => s.heightmap)
  const terrainIsHillshade = useStore((s) => s.terrainIsHillshade)
  const hillshadeVersion = useStore((s) => s.hillshadeVersion)
  const hillshadeParams = useStore((s) => s.hillshadeParams)
  const setTerrainHillshade = useStore((s) => s.setTerrainHillshade)
  const setHillshadeGenerating = useStore((s) => s.setHillshadeGenerating)

  // Always-current ref so the async callback reads the latest params, not stale closure values
  const hillshadeParamsRef = useRef(hillshadeParams)
  hillshadeParamsRef.current = hillshadeParams

  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!heightmap || !terrainIsHillshade) {
      setHillshadeGenerating(false)
      return
    }

    let cancelled = false
    setHillshadeGenerating(true)

    const timer = setTimeout(() => {
      generateHillshade(heightmap, hillshadeParamsRef.current)
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
  }, [hillshadeVersion, terrainIsHillshade, heightmap])
}
