import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { generateHillshade } from '../utils/hillshade'

const DEBOUNCE_MS = 300

export function useHillshade(): void {
  const heightmap = useStore((s) => s.heightmap)
  const terrainIsHillshade = useStore((s) => s.terrainIsHillshade)
  const hillshadeParams = useStore((s) => s.hillshadeParams)
  const setTerrainHillshade = useStore((s) => s.setTerrainHillshade)
  const setHillshadeGenerating = useStore((s) => s.setHillshadeGenerating)
  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!heightmap || !terrainIsHillshade) return

    let cancelled = false
    setHillshadeGenerating(true)

    const timer = setTimeout(() => {
      generateHillshade(heightmap, hillshadeParams)
        .then((url) => {
          if (cancelled) { URL.revokeObjectURL(url); return }
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
          prevUrlRef.current = url
          setTerrainHillshade(url) // also clears hillshadeGenerating
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
  }, [heightmap, hillshadeParams, terrainIsHillshade])
}
