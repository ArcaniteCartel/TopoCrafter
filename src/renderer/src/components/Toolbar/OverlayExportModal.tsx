import { useState } from 'react'
import {
  Modal, SegmentedControl, Slider, NumberInput, ColorInput,
  Radio, Group, Stack, Text, Button, Divider, Switch,
} from '@mantine/core'
import { ElevationCalibration, FrameConfig } from '../../types'
import { OverlayExportConfig, OverlayBackgroundMode, OverlayGridType } from '../../utils/export'

interface Props {
  opened: boolean
  onClose: () => void
  onExport: (config: OverlayExportConfig) => Promise<void>
  elevationCalibration: ElevationCalibration
  hasGroundResolution: boolean
  frame: FrameConfig
}

export function OverlayExportModal({
  opened,
  onClose,
  onExport,
  elevationCalibration,
  hasGroundResolution,
  frame,
}: Props): JSX.Element {
  const unitAbbr = hasGroundResolution
    ? (elevationCalibration.unitType === 'custom'
        ? (elevationCalibration.customAbbr || 'units')
        : (elevationCalibration.unitType ?? 'units'))
    : '% of width'

  const defaultInterval = hasGroundResolution && elevationCalibration.mapWidth
    ? Math.max(1, Math.round(elevationCalibration.mapWidth / 20))
    : 5

  const [mode, setMode] = useState<OverlayBackgroundMode>('transparent')
  const [overlayOpacity, setOverlayOpacity] = useState(100)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [bgOpacity, setBgOpacity] = useState(100)
  const [gridType, setGridType] = useState<OverlayGridType>('hex-flat')
  const [gridInterval, setGridInterval] = useState<number>(defaultInterval)
  const [gridColor, setGridColor] = useState('#000000')
  const [gridThickness, setGridThickness] = useState<number>(1)
  const [gridOpacity, setGridOpacity] = useState(100)
  const [includeFrame, setIncludeFrame] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showBg = mode === 'colored' || mode === 'grid'
  const showGrid = mode === 'grid'

  const handleExport = async () => {
    setError(null)
    setExporting(true)
    try {
      const ref = document.getElementById('annotation-svg') ?? document.getElementById('contour-svg')
      const svgWidth = ref ? Math.round(ref.getBoundingClientRect().width) : 1000

      let gridIntervalPx: number
      if (hasGroundResolution && elevationCalibration.mapWidth) {
        gridIntervalPx = Math.max(1, Math.round((gridInterval / elevationCalibration.mapWidth) * svgWidth))
      } else {
        gridIntervalPx = Math.max(1, Math.round((gridInterval / 100) * svgWidth))
      }

      await onExport({
        overlayOpacity: overlayOpacity / 100,
        mode,
        bgColor,
        bgOpacity: bgOpacity / 100,
        gridType,
        gridIntervalPx,
        gridColor,
        gridThickness,
        gridOpacity: gridOpacity / 100,
        frame,
        includeFrame: frame.enabled && includeFrame,
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
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(v) => setMode(v as OverlayBackgroundMode)}
          data={[
            { label: 'Transparent', value: 'transparent' },
            { label: 'White', value: 'white' },
            { label: 'Colored', value: 'colored' },
            { label: 'Grid', value: 'grid' },
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
          <>
            <Divider label="Background" labelPosition="left" />
            <Group gap="md" align="flex-end" grow>
              <ColorInput
                label="Color"
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
          </>
        )}

        {showGrid && (
          <>
            <Divider label="Grid" labelPosition="left" />

            <Radio.Group
              label="Grid type"
              value={gridType}
              onChange={(v) => setGridType(v as OverlayGridType)}
            >
              <Group gap="md" mt={4} wrap="wrap">
                <Radio value="square" label="Square" />
                <Radio value="hex-flat" label="Hex (flat-top)" />
                <Radio value="hex-pointy" label="Hex (pointy-top)" />
                <Radio value="hex-rotated" label="Hex (rotated 45°)" />
              </Group>
            </Radio.Group>

            <Group gap="md" align="flex-end" grow>
              <NumberInput
                label={`Interval (${unitAbbr})`}
                description={
                  hasGroundResolution && elevationCalibration.mapWidth
                    ? `Map width: ${elevationCalibration.mapWidth} ${unitAbbr}`
                    : 'Percentage of map width'
                }
                value={gridInterval}
                onChange={(v) => { if (typeof v === 'number' && v > 0) setGridInterval(v) }}
                min={0.1}
                step={hasGroundResolution ? 1 : 0.5}
                decimalScale={2}
                allowDecimal
              />
              <ColorInput
                label="Line color"
                value={gridColor}
                onChange={setGridColor}
                format="hex"
              />
            </Group>

            <Group gap="md" align="flex-start" grow>
              <NumberInput
                label="Line thickness (px)"
                value={gridThickness}
                onChange={(v) => { if (typeof v === 'number' && v > 0) setGridThickness(v) }}
                min={0.5}
                step={0.5}
                decimalScale={1}
                allowDecimal
              />
              <div>
                <Text size="sm" fw={500} mb={4}>Line opacity</Text>
                <Group gap="xs" align="center">
                  <Slider
                    min={0} max={100} step={1}
                    value={gridOpacity}
                    onChange={setGridOpacity}
                    label={(v) => `${v}%`}
                    style={{ flex: 1 }}
                  />
                  <Text size="xs" c="dimmed" style={{ width: 36, textAlign: 'right' }}>{gridOpacity}%</Text>
                </Group>
              </div>
            </Group>
          </>
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
          </>
        )}

        {error && <Text size="xs" c="red">{error}</Text>}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} loading={exporting}>Export</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
