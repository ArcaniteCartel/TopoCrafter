import { useState } from 'react'
import {
  Modal, SegmentedControl, Slider, ColorInput,
  Group, Stack, Text, Button, Divider, Switch,
} from '@mantine/core'
import type { ElevationCalibration, FrameConfig, TitleConfig, CompassConfig, LegendConfig, ContourStyle, MeasureBarConfig, HeightmapInfo, GridConfig } from '../../types'
import type { OverlayExportConfig, OverlayBackgroundMode, FrameBackgroundMode } from '../../utils/export'

interface Props {
  opened: boolean
  onClose: () => void
  onExport: (config: OverlayExportConfig) => Promise<void>
  elevationCalibration: ElevationCalibration
  hasGroundResolution: boolean
  frame: FrameConfig
  title: TitleConfig
  compass: CompassConfig
  legend: LegendConfig
  contourStyle: ContourStyle
  hasElevationFlags: boolean
  hasSlopeArrows: boolean
  hasRuggednessFlags?: boolean
  hasSwampMarkers?: boolean
  swampMarkerColor?: string
  hasRoads?: boolean
  roadColor?: string
  ruggednessSeverityColors?: string[]
  measureBar?: MeasureBarConfig
  heightmap?: HeightmapInfo
  grid?: GridConfig
}

export function OverlayExportModal({
  opened,
  onClose,
  onExport,
  elevationCalibration,
  frame,
  title,
  compass,
  legend,
  contourStyle,
  hasElevationFlags,
  hasSlopeArrows,
  hasRuggednessFlags,
  hasSwampMarkers,
  swampMarkerColor,
  hasRoads,
  roadColor,
  ruggednessSeverityColors,
  measureBar,
  heightmap,
  grid,
}: Props): JSX.Element {
  const [mode, setMode] = useState<OverlayBackgroundMode>('transparent')
  const [overlayOpacity, setOverlayOpacity] = useState(100)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [bgOpacity, setBgOpacity] = useState(100)
  const [frameBackground, setFrameBackground] = useState<FrameBackgroundMode>('white')
  const [frameBgColor, setFrameBgColor] = useState(frame.marginColor)
  const [includeFrame, setIncludeFrame] = useState(true)
  const [includeGrid, setIncludeGrid] = useState(grid?.enabled ?? false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showBg = mode === 'colored'
  const showFrameColorPicker = includeFrame && frame.enabled && frameBackground === 'colored'

  const handleExport = async () => {
    setError(null)
    setExporting(true)
    try {
      await onExport({
        overlayOpacity: overlayOpacity / 100,
        mode,
        bgColor,
        bgOpacity: bgOpacity / 100,
        frameBackground,
        frameBgColor,
        frame,
        includeFrame: frame.enabled && includeFrame,
        title,
        compass,
        legend,
        contourStyle,
        hasElevationFlags,
        hasSlopeArrows,
        hasRuggednessFlags,
        hasSwampMarkers,
        swampMarkerColor,
        hasRoads,
        roadColor,
        ruggednessSeverityColors,
        measureBar,
        calibration: elevationCalibration,
        heightmap,
        includeGrid,
        grid,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Export Overlay" centered size="md">
      <Stack gap="md">
        <Divider label="Map area background" labelPosition="left" />

        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(v) => setMode(v as OverlayBackgroundMode)}
          data={[
            { label: 'Transparent', value: 'transparent' },
            { label: 'White', value: 'white' },
            { label: 'Colored', value: 'colored' },
          ]}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>Overlay opacity</Text>
          <Group gap="xs" align="center">
            <Slider
              min={0} max={100} step={1}
              value={overlayOpacity}
              onChange={setOverlayOpacity}
              label={(v) => `${v}%`}
              style={{ flex: 1 }}
            />
            <Text size="xs" c="dimmed" style={{ width: 36, textAlign: 'right' }}>{overlayOpacity}%</Text>
          </Group>
        </div>

        {showBg && (
          <Group gap="md" align="flex-end" grow>
            <ColorInput
              label="Background color"
              value={bgColor}
              onChange={setBgColor}
              format="hex"
            />
            <div>
              <Text size="sm" fw={500} mb={4}>Opacity</Text>
              <Group gap="xs" align="center">
                <Slider
                  min={0} max={100} step={1}
                  value={bgOpacity}
                  onChange={setBgOpacity}
                  label={(v) => `${v}%`}
                  style={{ flex: 1 }}
                />
                <Text size="xs" c="dimmed" style={{ width: 36, textAlign: 'right' }}>{bgOpacity}%</Text>
              </Group>
            </div>
          </Group>
        )}

        {frame.enabled && (
          <>
            <Divider label="Frame" labelPosition="left" />
            <Switch
              label="Include frame in export"
              size="sm"
              checked={includeFrame}
              onChange={(e) => setIncludeFrame(e.currentTarget.checked)}
            />
            {includeFrame && (
              <>
                <Text size="xs" fw={500}>Frame margin background</Text>
                <SegmentedControl
                  fullWidth
                  size="xs"
                  value={frameBackground}
                  onChange={(v) => setFrameBackground(v as FrameBackgroundMode)}
                  data={[
                    { label: 'Transparent', value: 'transparent' },
                    { label: 'White', value: 'white' },
                    { label: 'Colored', value: 'colored' },
                  ]}
                />
                {showFrameColorPicker && (
                  <ColorInput
                    label="Frame margin color"
                    size="xs"
                    value={frameBgColor}
                    onChange={setFrameBgColor}
                    format="hex"
                  />
                )}
              </>
            )}
          </>
        )}

        <Divider label="Grid" labelPosition="left" />
        <Switch
          label="Include grid in export"
          size="sm"
          checked={includeGrid}
          onChange={(e) => setIncludeGrid(e.currentTarget.checked)}
          disabled={!grid?.enabled}
          description={!grid?.enabled ? 'Enable grid in Grids panel first' : undefined}
        />

        {error && <Text size="xs" c="red">{error}</Text>}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} loading={exporting}>Export</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
