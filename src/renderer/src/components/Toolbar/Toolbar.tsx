import { useState } from 'react'
import {
  Group, Title, Button, Menu, UnstyledButton,
  Modal, SimpleGrid, Paper, Text, Stack, Box,
  Popover, Tooltip, ActionIcon, Slider,
} from '@mantine/core'
import { useStore } from '../../store/useStore'
import { useThemeStore } from '../../store/useThemeStore'
import { THEMES } from '../../themes'
import { exportToBlob, exportOverlayToBlob, OverlayExportConfig } from '../../utils/export'
import { OverlayExportModal } from './OverlayExportModal'

function CrosshairIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="5.5" />
      <line x1="8" y1="1" x2="8" y2="3.5" />
      <line x1="8" y1="12.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3.5" y2="8" />
      <line x1="12.5" y1="8" x2="15" y2="8" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  )
}

function FlagIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <polygon points="4,2 13,5.5 4,9" />
    </svg>
  )
}

function ArrowIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <polygon points="14,8 9.5,5.5 9.5,10.5" />
    </svg>
  )
}

export function Toolbar(): JSX.Element {
  const heightmap = useStore((s) => s.heightmap)
  const mapZoom = useStore((s) => s.mapZoom)
  const setMapZoom = useStore((s) => s.setMapZoom)
  const terrainImageUrl = useStore((s) => s.terrainImageUrl)
  const hillshadeImageUrl = useStore((s) => s.hillshadeImageUrl)
  const activeTab = useStore((s) => s.activeTab)
  const style = useStore((s) => s.style)
  const reset = useStore((s) => s.reset)
  const mapTool = useStore((s) => s.mapTool)
  const setMapTool = useStore((s) => s.setMapTool)
  const elevationCalibration = useStore((s) => s.elevationCalibration)
  const { themeId, setTheme } = useThemeStore()
  const [themeModalOpen, setThemeModalOpen] = useState(false)
  const [toolPanelOpen, setToolPanelOpen] = useState(false)
  const [overlayModalOpen, setOverlayModalOpen] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const { unitType, customAbbr, customRatio, realMin, realMax, mapWidth } = elevationCalibration
  const calReady = (unitType === 'feet' || unitType === 'meters'
    || (unitType === 'custom' && !!customAbbr && customRatio > 0))
    && realMin !== null && realMax !== null && realMax !== realMin
  const hasGroundResolution = calReady && mapWidth !== null && mapWidth > 0

  const canExport = !!heightmap
  const baseImageUrl = activeTab === 'terrain' ? terrainImageUrl : hillshadeImageUrl

  const handleExport = async (type: 'merged-terrain' | 'merged-hillshade' | 'unmarked-hillshade' | 'visible-map') => {
    setExportError(null)
    try {
      let blob: Blob
      switch (type) {
        case 'merged-terrain':
          blob = await exportToBlob({ baseImageUrl: terrainImageUrl, includeContours: true, includeAnnotations: true, contourOpacity: 1 })
          break
        case 'merged-hillshade':
          blob = await exportToBlob({ baseImageUrl: hillshadeImageUrl, includeContours: true, includeAnnotations: true, contourOpacity: 1 })
          break
        case 'unmarked-hillshade':
          blob = await exportToBlob({ baseImageUrl: hillshadeImageUrl, includeContours: false, includeAnnotations: false, contourOpacity: 1 })
          break
        case 'visible-map':
          blob = await exportToBlob({ baseImageUrl, includeContours: true, includeAnnotations: true, contourOpacity: style.opacity })
          break
        default:
          return
      }

      const savePath = await window.electronAPI.saveFile([{ name: 'PNG Image', extensions: ['png'] }])
      if (!savePath) return
      const buf = await blob.arrayBuffer()
      await window.electronAPI.writeFile(savePath, new Uint8Array(buf))
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleOverlayExport = async (config: OverlayExportConfig) => {
    const blob = await exportOverlayToBlob(config)
    const savePath = await window.electronAPI.saveFile([{ name: 'PNG Image', extensions: ['png'] }])
    if (!savePath) return
    const buf = await blob.arrayBuffer()
    await window.electronAPI.writeFile(savePath, new Uint8Array(buf))
  }

  return (
    <>
      <Group h="100%" px="md" justify="space-between">
        <Group gap="xs">
          <Popover
            opened={toolPanelOpen}
            onChange={setToolPanelOpen}
            position="bottom-start"
            shadow="md"
            withArrow
          >
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => setToolPanelOpen((o) => !o)}
                aria-label="Map Tools"
              >
                <CrosshairIcon />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown p="xs">
              <Group gap="xs">
                <Tooltip label="Add an elevation flag to the map" position="bottom" withArrow>
                  <ActionIcon
                    variant={mapTool === 'elevation-flag' ? 'filled' : 'subtle'}
                    size="md"
                    disabled={!calReady}
                    onClick={() => setMapTool(mapTool === 'elevation-flag' ? 'none' : 'elevation-flag')}
                    aria-label="Elevation flag tool"
                  >
                    <FlagIcon />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Add angle of steepest ascent to the map" position="bottom" withArrow>
                  <ActionIcon
                    variant={mapTool === 'slope-arrow' ? 'filled' : 'subtle'}
                    size="md"
                    disabled={!hasGroundResolution}
                    onClick={() => setMapTool(mapTool === 'slope-arrow' ? 'none' : 'slope-arrow')}
                    aria-label="Slope arrow tool"
                  >
                    <ArrowIcon />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Popover.Dropdown>
          </Popover>

          <Menu shadow="md" width={160}>
            <Menu.Target>
              <UnstyledButton>
                <Title
                  order={4}
                  style={{ color: 'var(--mantine-primary-color-filled)', cursor: 'pointer' }}
                >
                  TopoCrafter
                </Title>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => setThemeModalOpen(true)}>
                Themes
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Group>
          <Group gap={6} align="center">
            <Slider
              min={-100}
              max={100}
              step={5}
              value={Math.round(50 * Math.log2(mapZoom / 100))}
              onChange={(v) => setMapZoom(Math.round(100 * Math.pow(2, v / 50)))}
              label={(v) => `${Math.round(100 * Math.pow(2, v / 50))}%`}
              size="xs"
              style={{ width: 120 }}
            />
            <Text
              size="xs"
              c="dimmed"
              style={{ width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', cursor: 'default' }}
              title="Double-click to reset to 100%"
              onDoubleClick={() => setMapZoom(100)}
            >
              {mapZoom}%
            </Text>
          </Group>

          <Menu shadow="md" width={220} disabled={!canExport}>
            <Menu.Target>
              <Button size="xs" variant="light" disabled={!canExport}>
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                disabled={!terrainImageUrl}
                onClick={() => handleExport('merged-terrain')}
              >
                Export merged Terrain image
              </Menu.Item>
              <Menu.Item
                disabled={!hillshadeImageUrl}
                onClick={() => handleExport('merged-hillshade')}
              >
                Export merged Hillshade image
              </Menu.Item>
              <Menu.Item
                disabled={!heightmap}
                onClick={() => setOverlayModalOpen(true)}
              >
                Export overlay layer image
              </Menu.Item>
              <Menu.Item
                disabled={!hillshadeImageUrl}
                onClick={() => handleExport('unmarked-hillshade')}
              >
                Export unmarked Hillshade
              </Menu.Item>
              <Menu.Item
                disabled={!baseImageUrl}
                onClick={() => handleExport('visible-map')}
              >
                Export visible map
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          {exportError && (
            <Text size="xs" c="red" style={{ maxWidth: 200 }} lineClamp={1} title={exportError}>
              {exportError}
            </Text>
          )}
          <Button size="xs" variant="subtle" color="red" onClick={reset}>
            Reset
          </Button>
        </Group>
      </Group>

      {overlayModalOpen && (
        <OverlayExportModal
          opened={overlayModalOpen}
          onClose={() => setOverlayModalOpen(false)}
          onExport={handleOverlayExport}
          elevationCalibration={elevationCalibration}
          hasGroundResolution={hasGroundResolution}
        />
      )}

      <Modal
        opened={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        title="Choose Theme"
        size="md"
        centered
      >
        <SimpleGrid cols={4} spacing="sm">
          {THEMES.map((t) => {
            const isActive = themeId === t.id
            return (
              <Paper
                key={t.id}
                p="sm"
                withBorder
                style={{
                  cursor: 'pointer',
                  borderColor: isActive ? 'var(--mantine-primary-color-filled)' : undefined,
                  borderWidth: isActive ? 2 : 1,
                }}
                onClick={() => {
                  setTheme(t.id)
                  setThemeModalOpen(false)
                }}
              >
                <Stack gap={6} align="center">
                  <Group gap={4}>
                    {t.previewColors.map((color) => (
                      <Box
                        key={color}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          backgroundColor: color,
                          border: '1px solid rgba(128,128,128,0.3)',
                        }}
                      />
                    ))}
                  </Group>
                  <Text size="xs" fw={700} ta="center">{t.name}</Text>
                  <Text size="xs" c="dimmed" ta="center" lineClamp={2}>{t.description}</Text>
                </Stack>
              </Paper>
            )
          })}
        </SimpleGrid>
      </Modal>
    </>
  )
}
