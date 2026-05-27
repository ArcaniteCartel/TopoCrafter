import { useState } from 'react'
import { Stack, Text, Button, Paper, Badge, Divider, Group, Alert } from '@mantine/core'
import { useStore } from '../../store/useStore'
import { loadHeightmapFromPath, loadTerrainImageUrl } from '../../utils/heightmap'

export function FilePanel(): JSX.Element {
  const {
    terrainImagePath, heightmapPath, terrainIsHillshade, heightmap,
    hillshadeGenerating, hillshadeDirty, contoursDirty, contoursGenerating,
    setTerrainImage, setHeightmap, setTerrainIsHillshade, updateParameters,
    setFileLoading, setHillshadeDirty, setContoursDirty,
    triggerHillshade, triggerContours,
  } = useStore()

  const [loadingTerrain, setLoadingTerrain] = useState(false)
  const [loadingHeightmap, setLoadingHeightmap] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoadTerrain = async () => {
    const path = await window.electronAPI.openFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tiff', 'tif'] },
    ])
    if (!path) return
    setLoadingTerrain(true)
    setFileLoading('Loading terrain image…')
    setError(null)
    try {
      const url = await loadTerrainImageUrl(path)
      setTerrainImage(path, url)
    } catch (err) {
      setError(`Could not load terrain image: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingTerrain(false)
      setFileLoading(null)
    }
  }

  const handleLoadHeightmap = async () => {
    const path = await window.electronAPI.openFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tiff', 'tif'] },
    ])
    if (!path) return
    setLoadingHeightmap(true)
    setFileLoading('Loading heightmap…')
    setError(null)
    try {
      const info = await loadHeightmapFromPath(path)
      setHeightmap(path, info)
      const range = info.maxValue - info.minValue
      const interval = parseFloat(Math.max(0.001, range / 20).toFixed(4))
      updateParameters({
        minElevation: parseFloat(info.minValue.toFixed(4)),
        maxElevation: parseFloat(info.maxValue.toFixed(4)),
        interval,
      })
      if (!terrainImagePath || terrainIsHillshade) {
        setTerrainIsHillshade(true)
      }
      // Clear dirty flags — both operations were just auto-triggered by the load
      setHillshadeDirty(false)
      setContoursDirty(false)
    } catch (err) {
      setError(`Could not load heightmap: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingHeightmap(false)
      setFileLoading(null)
    }
  }

  const terrainLoaded = !!terrainImagePath || terrainIsHillshade

  return (
    <Stack gap="xs" mb="md">
      <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
        Source Files
      </Text>

      {error && (
        <Alert color="red" title="Load Error" withCloseButton onClose={() => setError(null)}>
          <Text size="xs">{error}</Text>
        </Alert>
      )}

      <Paper p="xs" withBorder>
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" fw={500}>Heightmap ★</Text>
            {heightmapPath && <Badge size="xs" color="teal">Loaded</Badge>}
          </Group>
          {heightmapPath && (
            <Text size="xs" c="dimmed" lineClamp={1} title={heightmapPath}>
              {heightmapPath}
            </Text>
          )}
          <Button size="xs" variant="light" onClick={handleLoadHeightmap} loading={loadingHeightmap}>
            {heightmapPath ? 'Replace Heightmap' : 'Load Heightmap'}
          </Button>
        </Stack>
      </Paper>

      <Paper p="xs" withBorder>
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" fw={500}>Terrain Image</Text>
            {terrainIsHillshade && <Badge size="xs" color="violet">Hillshade</Badge>}
            {terrainImagePath && !terrainIsHillshade && <Badge size="xs" color="teal">Loaded</Badge>}
          </Group>
          {terrainImagePath && !terrainIsHillshade && (
            <Text size="xs" c="dimmed" lineClamp={1} title={terrainImagePath}>
              {terrainImagePath}
            </Text>
          )}
          {terrainIsHillshade && (
            <Text size="xs" c="dimmed">Auto-generated from heightmap</Text>
          )}
          <Button size="xs" variant="light" onClick={handleLoadTerrain} loading={loadingTerrain}>
            {terrainLoaded ? 'Load Custom Terrain Image' : 'Load Terrain Image'}
          </Button>
        </Stack>
      </Paper>

      {terrainIsHillshade && (
        <Paper p="xs" withBorder>
          <Stack gap={6}>
            <Text size="xs" fw={500}>Hillshading</Text>
            <Button
              size="xs"
              variant="light"
              disabled={!hillshadeDirty || hillshadeGenerating}
              loading={hillshadeGenerating}
              onClick={triggerHillshade}
            >
              Rerun Hillshading
            </Button>
          </Stack>
        </Paper>
      )}

      <Paper p="xs" withBorder>
        <Stack gap={6}>
          <Text size="xs" fw={500}>Contours</Text>
          <Button
            size="xs"
            variant="light"
            disabled={!contoursDirty || !heightmap || contoursGenerating}
            loading={contoursGenerating}
            onClick={triggerContours}
          >
            Recalculate Contours
          </Button>
        </Stack>
      </Paper>

      <Divider my="xs" />
    </Stack>
  )
}
