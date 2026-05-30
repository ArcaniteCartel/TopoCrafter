import { useState } from 'react'
import { Stack, Text, Button, Paper, Badge, Divider, Group, Alert } from '@mantine/core'
import { useStore } from '../../store/useStore'
import { loadHeightmapFromPath, loadTerrainImageUrl } from '../../utils/heightmap'

export function FilePanel(): JSX.Element {
  const {
    terrainImagePath, heightmapPath, heightmap,
    hillshadeGenerating, hillshadeDirty, contoursDirty, contoursGenerating,
    setTerrainImage, setHeightmap, updateParameters,
    setFileLoading, triggerHillshade, triggerContours, clearPendingChanges,
  } = useStore()

  const isRecalculating = hillshadeGenerating || contoursGenerating
  const canRecalculate = (hillshadeDirty || contoursDirty) && !!heightmap
  const hasPendingChanges = (hillshadeDirty || contoursDirty) && !!heightmap

  const handleRecalculate = () => {
    if (hillshadeDirty) triggerHillshade()
    if (contoursDirty) triggerContours()
  }

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
      { name: 'Images', extensions: ['png', 'tiff', 'tif', 'exr'] },
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
    } catch (err) {
      setError(`Could not load heightmap: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingHeightmap(false)
      setFileLoading(null)
    }
  }

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
            {terrainImagePath && <Badge size="xs" color="teal">Loaded</Badge>}
          </Group>
          {terrainImagePath && (
            <Text size="xs" c="dimmed" lineClamp={1} title={terrainImagePath}>
              {terrainImagePath}
            </Text>
          )}
          <Button size="xs" variant="light" onClick={handleLoadTerrain} loading={loadingTerrain}>
            {terrainImagePath ? 'Replace Terrain Image' : 'Load Terrain Image'}
          </Button>
        </Stack>
      </Paper>

      <Paper p="xs" withBorder>
        <Stack gap={6}>
          <Button
            size="xs"
            variant="light"
            disabled={!canRecalculate}
            loading={isRecalculating}
            onClick={handleRecalculate}
          >
            Recalculate Map
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="orange"
            disabled={!hasPendingChanges}
            onClick={clearPendingChanges}
          >
            Clear Pending Changes
          </Button>
        </Stack>
      </Paper>

      <Divider my="xs" />
    </Stack>
  )
}
