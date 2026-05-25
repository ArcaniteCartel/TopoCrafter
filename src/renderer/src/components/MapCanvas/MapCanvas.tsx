import { useMemo } from 'react'
import { Center, Text, Stack, Loader, Overlay } from '@mantine/core'
import { useStore } from '../../store/useStore'
import { generateContours, contourToSvgPath } from '../../utils/contour'

export function MapCanvas(): JSX.Element {
  const { terrainImageUrl, heightmap, parameters, style, hillshadeGenerating, fileLoadingMessage } = useStore()

  const contourSet = useMemo(() => {
    if (!heightmap) return null
    return generateContours(heightmap, parameters)
  }, [heightmap, parameters])

  const showPlaceholder = !terrainImageUrl && !heightmap && !hillshadeGenerating && !fileLoadingMessage

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
