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

export function MapCanvas(): JSX.Element {
  const terrainImageUrl = useStore((s) => s.terrainImageUrl)
  const heightmap = useStore((s) => s.heightmap)
  const parameters = useStore((s) => s.parameters)
  const style = useStore((s) => s.style)
  const hillshadeGenerating = useStore((s) => s.hillshadeGenerating)
  const fileLoadingMessage = useStore((s) => s.fileLoadingMessage)
  const elevationCalibration = useStore((s) => s.elevationCalibration)
  const contoursVersion = useStore((s) => s.contoursVersion)

  // Ref so the effect always reads the latest parameters without being in deps
  const parametersRef = useRef(parameters)
  parametersRef.current = parameters

  const [contourSet, setContourSet] = useState<ContourSet | null>(null)

  // Only recompute contours when a new heightmap is loaded or Recalculate is clicked
  useEffect(() => {
    if (!heightmap) { setContourSet(null); return }
    setContourSet(generateContours(heightmap, parametersRef.current))
  }, [heightmap, contoursVersion])

  const showPlaceholder = !terrainImageUrl && !heightmap && !hillshadeGenerating && !fileLoadingMessage

  const { realMin, realMax } = elevationCalibration
  const showLabels = style.showLabels && realMin !== null && realMax !== null

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

      {contourSet && heightmap && !hillshadeGenerating && (
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
          {contourSet.paths.map((polygon, i) => {
            const isMajor = contourSet.majorIndices.has(i)
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

          {showLabels && contourSet.paths.map((polygon, i) => {
            if (!contourSet.majorIndices.has(i)) return null
            const pt = getLabelPoint(polygon)
            if (!pt) return null
            const { realInterval } = elevationCalibration
            const normMin = parameters.minElevation
            const normSpan = parameters.maxElevation - normMin
            const elev = (realInterval !== null)
              ? realMin! + i * realInterval
              : normSpan > 0
                ? Math.round(realMin! + (contourSet.thresholds[i] - normMin) / normSpan * (realMax! - realMin!))
                : realMin!
            return (
              <text
                key={`lbl-${i}`}
                x={pt[0]}
                y={pt[1]}
                fontSize={labelFontSize}
                fill={style.majorColor}
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
