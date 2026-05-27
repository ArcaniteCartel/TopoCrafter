import { useEffect, useRef, useState } from 'react'
import { Center, Text, Stack, Loader, Overlay } from '@mantine/core'
import type { ContourMultiPolygon } from 'd3-contour'
import { useStore } from '../../store/useStore'
import { generateContours, contourToSvgPath } from '../../utils/contour'
import type { ContourSet } from '../../utils/contour'

function getLabelPoint(poly: ContourMultiPolygon): [number, number] | null {
  let best: [number, number][] | null = null
  for (const polygon of poly.coordinates) {
    for (const ring of polygon) {
      if (!best || ring.length > best.length) best = ring as [number, number][]
    }
  }
  if (!best || best.length === 0) return null
  return best[Math.floor(best.length / 2)]
}

// Snapshot of calibration values captured at recalculate time so labels stay
// in sync with the contour lines they annotate, not live parameter edits.
interface ContourState {
  contourSet: ContourSet
  realMin: number | null
  realMax: number | null
  realInterval: number | null
  minElevation: number
  maxElevation: number
}

export function MapCanvas(): JSX.Element {
  const terrainImageUrl = useStore((s) => s.terrainImageUrl)
  const heightmap = useStore((s) => s.heightmap)
  const parameters = useStore((s) => s.parameters)
  const style = useStore((s) => s.style)
  const hillshadeGenerating = useStore((s) => s.hillshadeGenerating)
  const fileLoadingMessage = useStore((s) => s.fileLoadingMessage)
  const elevationCalibration = useStore((s) => s.elevationCalibration)
  const contoursVersion = useStore((s) => s.contoursVersion)
  const setContoursGenerating = useStore((s) => s.setContoursGenerating)

  // Refs so effects always read the latest values without being reactive deps
  const parametersRef = useRef(parameters)
  parametersRef.current = parameters
  const elevationCalibrationRef = useRef(elevationCalibration)
  elevationCalibrationRef.current = elevationCalibration

  const [contourState, setContourState] = useState<ContourState | null>(null)

  // Only recompute contours when a new heightmap is loaded or Recalculate is clicked.
  // 300ms delay gives the browser time to paint the spinner before the synchronous
  // computation runs. Calibration values are snapshotted here so labels match the
  // contour lines they annotate, not whatever is currently in the parameter fields.
  useEffect(() => {
    if (!heightmap) { setContourState(null); setContoursGenerating(false); return }
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const params = parametersRef.current
      const cal = elevationCalibrationRef.current
      setContourState({
        contourSet: generateContours(heightmap, params),
        realMin: cal.realMin,
        realMax: cal.realMax,
        realInterval: cal.realInterval,
        minElevation: params.minElevation,
        maxElevation: params.maxElevation,
      })
      setContoursGenerating(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [heightmap, contoursVersion])

  const showPlaceholder = !terrainImageUrl && !heightmap && !hillshadeGenerating && !fileLoadingMessage

  const showLabels = style.showLabels
    && contourState !== null
    && contourState.realMin !== null
    && contourState.realMax !== null

  const labelFontSize = heightmap ? heightmap.width * style.labelFontSize / 500 : 10

  return (
    <div style={{ position: 'relative', width: '100%', flex: 1, overflow: 'auto' }}>
      {showPlaceholder && (
        <Center style={{ height: '100%', minHeight: 200 }}>
          <Text c="dimmed" size="sm">Load a terrain image and heightmap to get started</Text>
        </Center>
      )}

      {terrainImageUrl && (
        <img
          src={terrainImageUrl}
          alt="Terrain"
          style={{ display: 'block', maxWidth: '100%' }}
        />
      )}

      {contourState && heightmap && !hillshadeGenerating && (
        <svg
          viewBox={`0 0 ${heightmap.width} ${heightmap.height}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: style.opacity,
            pointerEvents: 'none',
          }}
        >
          {contourState.contourSet.paths.map((polygon, i) => {
            const isMajor = contourState.contourSet.majorIndices.has(i)
            return (
              <path
                key={i}
                d={contourToSvgPath(polygon)}
                fill="none"
                stroke={isMajor ? style.majorColor : style.minorColor}
                strokeWidth={isMajor ? style.majorWidth : style.minorWidth}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {showLabels && contourState.contourSet.paths.map((polygon, i) => {
            if (!contourState.contourSet.majorIndices.has(i)) return null
            const pt = getLabelPoint(polygon)
            if (!pt) return null
            const { realMin, realMax, realInterval, minElevation, maxElevation } = contourState
            const normSpan = maxElevation - minElevation
            const elev = (realInterval !== null)
              ? realMin! + i * realInterval
              : normSpan > 0
                ? Math.round(realMin! + (contourState.contourSet.thresholds[i] - minElevation) / normSpan * (realMax! - realMin!))
                : realMin!
            return (
              <text
                key={`lbl-${i}`}
                x={pt[0]}
                y={pt[1]}
                fontSize={labelFontSize}
                fontFamily={style.labelFont}
                fontWeight={style.labelBold ? 'bold' : 'normal'}
                fontStyle={style.labelItalic ? 'italic' : 'normal'}
                fill={style.labelColor}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {elev}
              </text>
            )
          })}
        </svg>
      )}

      {(hillshadeGenerating || fileLoadingMessage) && (
        <Overlay backgroundOpacity={0.5} style={{ position: 'absolute', inset: 0 }}>
          <Center style={{ height: '100%' }}>
            <Stack align="center" gap="xs">
              <Loader size="lg" />
              <Text size="sm" c="white">
                {fileLoadingMessage ?? 'Generating hillshade…'}
              </Text>
            </Stack>
          </Center>
        </Overlay>
      )}
    </div>
  )
}
