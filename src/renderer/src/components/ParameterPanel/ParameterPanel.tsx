import { useEffect, useRef, useState } from 'react'
import { Stack, Text, Slider, NumberInput, ColorInput, Switch, Divider, Group, Select, TextInput, Collapse, Checkbox, SegmentedControl } from '@mantine/core'
import { useStore } from '../../store/useStore'
import type { FrameBorderStyle, TitleConfig, CompassConfig, FramePosition } from '../../types'

const DASH_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

const FONT_OPTIONS = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'monospace', label: 'Monospace' },
]

const POSITION_OPTIONS: { value: FramePosition; label: string }[] = [
  { value: 'top-left',      label: 'Top — left corner' },
  { value: 'top-center',    label: 'Top — center' },
  { value: 'top-right',     label: 'Top — right corner' },
  { value: 'right-top',     label: 'Right — near top' },
  { value: 'right-middle',  label: 'Right — middle' },
  { value: 'right-bottom',  label: 'Right — near bottom' },
  { value: 'bottom-right',  label: 'Bottom — right corner' },
  { value: 'bottom-center', label: 'Bottom — center' },
  { value: 'bottom-left',   label: 'Bottom — left corner' },
  { value: 'left-bottom',   label: 'Left — near bottom' },
  { value: 'left-middle',   label: 'Left — middle' },
  { value: 'left-top',      label: 'Left — near top' },
]

const UNIT_OPTIONS = [
  { value: 'feet', label: 'Feet (ft)' },
  { value: 'meters', label: 'Meters (m)' },
  { value: 'custom', label: 'Custom…' },
]

// Non-linear shadow depth stops: fine control at low end, coarser at high end
// 0–1: step 0.1 (10 intervals), 1–5: step 0.25 (4 per unit), 5–10: step 0.5 (2 per unit)
const INTENSITY_STOPS: number[] = [
  ...Array.from({ length: 11 }, (_, i) => parseFloat((i * 0.1).toFixed(1))),   // 0.0–1.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((1.25 + i * 0.25).toFixed(2))), // 1.25–2.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((2.25 + i * 0.25).toFixed(2))), // 2.25–3.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((3.25 + i * 0.25).toFixed(2))), // 3.25–4.0
  ...Array.from({ length: 4  }, (_, i) => parseFloat((4.25 + i * 0.25).toFixed(2))), // 4.25–5.0
  ...Array.from({ length: 10 }, (_, i) => parseFloat((5.5  + i * 0.5 ).toFixed(1))), // 5.5–10.0
]

function intensityToIndex(v: number): number {
  return INTENSITY_STOPS.reduce((best, val, i) =>
    Math.abs(val - v) < Math.abs(INTENSITY_STOPS[best] - v) ? i : best, 0)
}

function formatIntensity(v: number): string {
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(v < 1 ? 1 : 2)}×`
}

// Subtle dashed style for read-only informational fields
const roStyle = {
  input: {
    borderStyle: 'dashed' as const,
    cursor: 'default' as const,
    opacity: 0.65,
  },
}

// Highlighted border for editable fields so they're visually distinct at rest
const activeStyle = {
  input: {
    borderColor: 'var(--mantine-color-blue-5)',
  },
}

export function ParameterPanel(): JSX.Element {
  const {
    parameters, style, hillshadeParams, elevationCalibration, heightmap,
    updateParameters, updateStyle, updateHillshadeParams,
    updateElevationCalibration, setElevationUnits, finalizeCustomConversion,
  } = useStore()

  const activeTab = useStore((s) => s.activeTab)
  const hillshadeDisabled = activeTab !== 'hillshade'
  const frame = useStore((s) => s.frame)
  const updateFrame = useStore((s) => s.updateFrame)
  const title = useStore((s) => s.title)
  const updateTitle = useStore((s) => s.updateTitle)
  const compass = useStore((s) => s.compass)
  const updateCompass = useStore((s) => s.updateCompass)
  const legend = useStore((s) => s.legend)
  const updateLegend = useStore((s) => s.updateLegend)
  const measureBar = useStore((s) => s.measureBar)
  const updateMeasureBar = useStore((s) => s.updateMeasureBar)
  const elevationFlags = useStore((s) => s.elevationFlags)
  const slopeArrows = useStore((s) => s.slopeArrows)
  const overlayOnly = useStore((s) => s.overlayOnly)
  const setOverlayOnly = useStore((s) => s.setOverlayOnly)
  const overlayBrightness = useStore((s) => s.overlayBrightness)
  const setOverlayBrightness = useStore((s) => s.setOverlayBrightness)

  const { unitType, customName, customAbbr, customBase, customRatio, realMin, realMax, realInterval, mapWidth } = elevationCalibration

  const abbr = unitType === 'feet' ? 'ft'
    : unitType === 'meters' ? 'm'
    : unitType === 'custom' ? (customAbbr || '?')
    : ''

  const calReady = (unitType === 'feet' || unitType === 'meters'
    || (unitType === 'custom' && !!customAbbr && customRatio > 0))
    && realMin !== null && realMax !== null && realMax !== realMin

  const correctZFactor = calReady && mapWidth && mapWidth > 0 && heightmap
    ? Math.abs(realMax! - realMin!) / (mapWidth / heightmap.width)
    : null
  const hasGroundResolution = correctZFactor !== null

  // Sea level is only applicable when calibration spans real-world 0 (min < 0 < max)
  const seaLevelApplicable = calReady && realMin !== null && realMax !== null
    && realMin < 0 && realMax > 0

  // TextInput local state — avoids Mantine NumberInput controlled-mode quirks
  const [intervalStr, setIntervalStr] = useState<string>(
    realInterval !== null ? String(realInterval) : ''
  )
  const [labelStylingOpen, setLabelStylingOpen] = useState(true)
  const [seaLevelOpen, setSeaLevelOpen] = useState(true)
  const [framingOpen, setFramingOpen] = useState(true)

  // Refs for latest values — safe to read inside event handlers and effects
  const normIntervalRef = useRef(parameters.interval)
  normIntervalRef.current = parameters.interval
  const normMinRef = useRef(parameters.minElevation)
  normMinRef.current = parameters.minElevation
  const normMaxRef = useRef(parameters.maxElevation)
  normMaxRef.current = parameters.maxElevation
  const realMinRef = useRef(realMin)
  realMinRef.current = realMin
  const realMaxRef = useRef(realMax)
  realMaxRef.current = realMax
  const realIntervalRef = useRef(realInterval)
  realIntervalRef.current = realInterval

  // Sync store → local string whenever realInterval changes from outside
  useEffect(() => {
    setIntervalStr(realInterval !== null ? String(realInterval) : '')
  }, [realInterval])

  // Correct formula: realInterval = normalizedInterval × realWorldSpan / normalizedSpan
  const computeAutoInterval = (): number | null => {
    const rMin = realMinRef.current
    const rMax = realMaxRef.current
    if (rMin === null || rMax === null) return null
    const realSpan = Math.abs(rMax - rMin)
    const normSpan = normMaxRef.current - normMinRef.current
    if (realSpan === 0 || normSpan === 0) return null
    return Math.max(1, Math.round(normIntervalRef.current * realSpan / normSpan))
  }

  // Auto-compute fires on blur of Min/Max fields (not on every keystroke)
  const handleMinMaxBlur = () => {
    if (realIntervalRef.current === null) {
      const auto = computeAutoInterval()
      if (auto !== null) updateElevationCalibration({ realInterval: auto })
    }
  }

  const handleIntervalInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.currentTarget.value.replace(/\D/g, '')   // digits only
    setIntervalStr(raw)
    if (!calReady) return
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed >= 1) {
      const rMin = realMinRef.current ?? 0
      const rMax = realMaxRef.current ?? 0
      const realSpan = Math.abs(rMax - rMin)
      const normSpan = normMaxRef.current - normMinRef.current
      if (realSpan === 0 || normSpan === 0) return
      updateElevationCalibration({ realInterval: parsed })
      // Reverse formula: normalizedInterval = realInterval × normalizedSpan / realWorldSpan
      updateParameters({ interval: parsed * normSpan / realSpan })
    } else if (raw === '') {
      updateElevationCalibration({ realInterval: null })
    }
  }

  const handleRealMinChange = (v: number | string) => {
    const num = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(num)) updateElevationCalibration({ realMin: num })
  }

  const handleRealMaxChange = (v: number | string) => {
    const num = typeof v === 'number' ? v : parseFloat(String(v))
    if (!isNaN(num)) updateElevationCalibration({ realMax: num })
  }

  return (
    <Stack gap="md">

      {!!heightmap && (
        <>
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
              Hillshade
            </Text>
            <Switch
              size="xs"
              label="Overlay only"
              checked={overlayOnly}
              onChange={(e) => setOverlayOnly(e.currentTarget.checked)}
            />
          </Group>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Sun Azimuth</Text>
            <Slider
              min={0}
              max={360}
              step={5}
              value={hillshadeParams.azimuth}
              onChange={(v) => updateHillshadeParams({ azimuth: v })}
              label={(v) => `${v}°`}
              disabled={hillshadeDisabled || overlayOnly}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Sun Altitude</Text>
            <Slider
              min={5}
              max={85}
              step={5}
              value={hillshadeParams.altitude}
              onChange={(v) => updateHillshadeParams({ altitude: v })}
              label={(v) => `${v}°`}
              disabled={hillshadeDisabled || overlayOnly}
            />
          </Stack>

          {hasGroundResolution ? (
            <>
              <Stack gap={4}>
                <Text size="xs" fw={500}>Vertical Exaggeration</Text>
                <Slider
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={hillshadeParams.verticalExaggeration}
                  onChange={(v) => updateHillshadeParams({ verticalExaggeration: v })}
                  label={(v) => `${v.toFixed(1)}×`}
                  disabled={hillshadeDisabled || overlayOnly}
                />
              </Stack>
              <NumberInput
                label="Actual Z Factor"
                description="Correct Z × Exaggeration"
                size="xs"
                value={Math.round(correctZFactor! * hillshadeParams.verticalExaggeration)}
                disabled
                styles={roStyle}
              />
            </>
          ) : (
            <Stack gap={4}>
              <Text size="xs" fw={500}>Vertical Exaggeration</Text>
              <Slider
                min={1}
                max={2000}
                step={1}
                value={hillshadeParams.zFactor}
                onChange={(v) => updateHillshadeParams({ zFactor: v })}
                label={(v) => `${v}×`}
                disabled={hillshadeDisabled || overlayOnly}
              />
            </Stack>
          )}

          <Stack gap={4}>
            <Text size="xs" fw={500}>Shadow Depth</Text>
            <Slider
              min={0}
              max={INTENSITY_STOPS.length - 1}
              step={1}
              value={intensityToIndex(hillshadeParams.intensity)}
              onChange={(i) => updateHillshadeParams({ intensity: INTENSITY_STOPS[i] })}
              label={(i) => formatIntensity(INTENSITY_STOPS[i])}
              disabled={hillshadeDisabled || overlayOnly}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Brightness</Text>
            <Slider
              min={0.3}
              max={0.9}
              step={0.05}
              value={overlayOnly ? overlayBrightness : hillshadeParams.brightness}
              onChange={(v) => overlayOnly ? setOverlayBrightness(v) : updateHillshadeParams({ brightness: v })}
              label={(v) => `${Math.round(v * 100)}%`}
              disabled={hillshadeDisabled}
            />
          </Stack>

          <Divider />
        </>
      )}

      <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
        Contour Parameters
      </Text>

      <Select
        label="Elevation Units"
        size="xs"
        placeholder="Select units…"
        data={UNIT_OPTIONS}
        value={unitType}
        onChange={(v) => v && setElevationUnits(v as 'feet' | 'meters' | 'custom')}
        clearable
        onClear={() => updateElevationCalibration({ unitType: null, realMin: null, realMax: null, realInterval: null, mapWidth: null })}
      />

      {unitType === 'custom' && (
        <Stack gap={6}>
          <Group grow>
            <TextInput
              label="Unit Name"
              size="xs"
              placeholder="e.g. Cubits"
              value={customName}
              onChange={(e) => updateElevationCalibration({ customName: e.currentTarget.value })}
            />
            <TextInput
              label="Abbreviation"
              size="xs"
              placeholder="e.g. cu"
              value={customAbbr}
              onChange={(e) => updateElevationCalibration({ customAbbr: e.currentTarget.value })}
            />
          </Group>
          <Group grow align="flex-end">
            <Select
              label="1 unit equals N"
              size="xs"
              data={[
                { value: 'feet', label: 'Feet' },
                { value: 'meters', label: 'Meters' },
              ]}
              value={customBase}
              onChange={(v) => v && updateElevationCalibration({ customBase: v as 'feet' | 'meters' })}
            />
            <NumberInput
              label="N (ratio)"
              size="xs"
              min={0.000001}
              step={0.1}
              decimalScale={6}
              value={customRatio}
              onChange={(v) => typeof v === 'number' && updateElevationCalibration({ customRatio: v })}
              onBlur={finalizeCustomConversion}
            />
          </Group>
        </Stack>
      )}

      <NumberInput
        label={`Width in ${abbr || '?'} of Map`}
        size="xs"
        decimalScale={1}
        step={1}
        min={0.000001}
        disabled={!unitType}
        value={mapWidth ?? ''}
        onChange={(v) => updateElevationCalibration({ mapWidth: typeof v === 'number' ? v : null })}
        placeholder={unitType ? 'e.g. 50' : '—'}
        styles={!unitType ? roStyle : activeStyle}
      />

      <Group grow>
        <NumberInput
          label={`Min${abbr ? ` (${abbr})` : ''}`}
          description="Real-world"
          size="xs"
          decimalScale={1}
          step={1}
          disabled={!unitType}
          value={realMin ?? ''}
          onChange={handleRealMinChange}
          onBlur={handleMinMaxBlur}
          placeholder={unitType ? '0' : '—'}
          styles={!unitType ? roStyle : activeStyle}
        />
        <NumberInput
          label={`Max${abbr ? ` (${abbr})` : ''}`}
          description="Real-world"
          size="xs"
          decimalScale={1}
          step={1}
          disabled={!unitType}
          value={realMax ?? ''}
          onChange={handleRealMaxChange}
          onBlur={handleMinMaxBlur}
          placeholder={unitType ? '0' : '—'}
          styles={!unitType ? roStyle : activeStyle}
        />
      </Group>

      <Group grow>
        <NumberInput
          label="Min Elevation"
          description="Normalized"
          size="xs"
          decimalScale={4}
          value={parameters.minElevation}
          disabled
          styles={roStyle}
        />
        <NumberInput
          label="Max Elevation"
          description="Normalized"
          size="xs"
          decimalScale={4}
          value={parameters.maxElevation}
          disabled
          styles={roStyle}
        />
      </Group>

      <Group grow>
        <NumberInput
          label="Contour Interval"
          description="Normalized"
          size="xs"
          decimalScale={4}
          value={parameters.interval}
          disabled
          styles={roStyle}
        />
        <TextInput
          label={`Interval${abbr ? ` (${abbr})` : ''}`}
          description="Real-world"
          size="xs"
          value={intervalStr}
          onChange={handleIntervalInput}
          placeholder={calReady ? 'e.g. 100' : 'Set min/max first'}
          inputMode="numeric"
          styles={!calReady ? roStyle : activeStyle}
        />
      </Group>

      <NumberInput
        label="Major Contour Every N Lines"
        size="xs"
        min={1}
        max={20}
        value={parameters.majorEvery}
        onChange={(v) => typeof v === 'number' && updateParameters({ majorEvery: v })}
        styles={activeStyle}
      />

      <Stack gap={4}>
        <Text size="xs" fw={500}>Path Smoothing</Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={parameters.smoothing}
          onChange={(v) => updateParameters({ smoothing: v })}
          label={(v) => v.toFixed(2)}
        />
      </Stack>

      <Divider />

      <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
        Style
      </Text>

      <ColorInput
        label="Minor Contour Color"
        size="xs"
        value={style.minorColor}
        onChange={(v) => updateStyle({ minorColor: v })}
      />

      <ColorInput
        label="Major Contour Color"
        size="xs"
        value={style.majorColor}
        onChange={(v) => updateStyle({ majorColor: v })}
      />

      <Group grow>
        <NumberInput
          label="Minor Line Width"
          size="xs"
          min={0.5}
          max={5}
          step={0.5}
          decimalScale={1}
          value={style.minorWidth}
          onChange={(v) => typeof v === 'number' && updateStyle({ minorWidth: v })}
        />
        <NumberInput
          label="Major Line Width"
          size="xs"
          min={0.5}
          max={10}
          step={0.5}
          decimalScale={1}
          value={style.majorWidth}
          onChange={(v) => typeof v === 'number' && updateStyle({ majorWidth: v })}
        />
      </Group>

      <Stack gap={4}>
        <Text size="xs" fw={500}>Overlay Opacity</Text>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={(v) => updateStyle({ opacity: v })}
          label={(v) => v.toFixed(2)}
        />
      </Stack>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setLabelStylingOpen((o) => !o)}
      >
        <Text fw={600} size="xs" tt="uppercase" style={{ letterSpacing: 1 }}>
          Label Styling
        </Text>
        <Text size="lg" c="dimmed">{labelStylingOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={labelStylingOpen}>
        <Stack gap="md">
          <Switch
            label="Show Elevation Labels"
            description={!calReady ? 'Set units and real-world min/max to enable' : undefined}
            size="sm"
            checked={style.showLabels}
            disabled={!calReady}
            onChange={(e) => updateStyle({ showLabels: e.currentTarget.checked })}
          />

          <ColorInput
            label="Label Color"
            size="xs"
            value={style.labelColor}
            onChange={(v) => updateStyle({ labelColor: v })}
          />

          <Select
            label="Label Font"
            size="xs"
            data={FONT_OPTIONS}
            value={style.labelFont}
            onChange={(v) => v && updateStyle({ labelFont: v })}
          />

          <Group gap="xl">
            <Checkbox
              label="Bold"
              size="xs"
              checked={style.labelBold}
              onChange={(e) => updateStyle({ labelBold: e.currentTarget.checked })}
            />
            <Checkbox
              label="Italic"
              size="xs"
              checked={style.labelItalic}
              onChange={(e) => updateStyle({ labelItalic: e.currentTarget.checked })}
            />
          </Group>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Label Font Size</Text>
            <Slider
              min={1}
              max={30}
              step={1}
              value={style.labelFontSize}
              onChange={(v) => updateStyle({ labelFontSize: v })}
              label={(v) => `${v}`}
            />
          </Stack>
        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setSeaLevelOpen((o) => !o)}
      >
        <Text fw={600} size="xs" tt="uppercase" style={{ letterSpacing: 1 }}>
          Sea Level
        </Text>
        <Text size="lg" c="dimmed">{seaLevelOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={seaLevelOpen}>
        <Stack gap="md">
          <Switch
            label="Show Sea Level Contour"
            description={!seaLevelApplicable ? 'Set real-world min < 0 and max > 0 to enable' : undefined}
            size="sm"
            checked={style.showSeaLevel}
            disabled={!seaLevelApplicable}
            onChange={(e) => updateStyle({ showSeaLevel: e.currentTarget.checked })}
          />

          <ColorInput
            label="Sea Level Color"
            size="xs"
            value={style.seaLevelColor}
            onChange={(v) => updateStyle({ seaLevelColor: v })}
          />

          <Group grow>
            <NumberInput
              label="Line Width"
              size="xs"
              min={0.5}
              max={10}
              step={0.5}
              decimalScale={1}
              value={style.seaLevelWidth}
              onChange={(v) => typeof v === 'number' && updateStyle({ seaLevelWidth: v })}
            />
            <Select
              label="Line Style"
              size="xs"
              data={DASH_OPTIONS}
              value={style.seaLevelDash}
              onChange={(v) => v && updateStyle({ seaLevelDash: v as 'solid' | 'dashed' | 'dotted' })}
            />
          </Group>

          <Switch
            label="Show Sea Level Icon"
            size="sm"
            checked={style.showSeaLevelLabel}
            onChange={(e) => updateStyle({ showSeaLevelLabel: e.currentTarget.checked })}
          />

          <ColorInput
            label="Icon Color"
            size="xs"
            value={style.seaLevelLabelColor}
            onChange={(v) => updateStyle({ seaLevelLabelColor: v })}
          />

          <Stack gap={4}>
            <Text size="xs" fw={500}>Icon Size</Text>
            <Slider
              min={1}
              max={30}
              step={1}
              value={style.seaLevelLabelFontSize}
              onChange={(v) => updateStyle({ seaLevelLabelFontSize: v })}
              label={(v) => `${v}`}
            />
          </Stack>
        </Stack>
      </Collapse>

      <Divider />

      <Group
        justify="space-between"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setFramingOpen((o) => !o)}
      >
        <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
          Framing
        </Text>
        <Text size="lg" c="dimmed">{framingOpen ? '▾' : '▸'}</Text>
      </Group>

      <Collapse in={framingOpen}>
        <Stack gap="md">
          <Switch
            label="Enable frame"
            size="sm"
            checked={frame.enabled}
            onChange={(e) => updateFrame({ enabled: e.currentTarget.checked })}
          />

          <ColorInput
            label="Margin color"
            size="xs"
            value={frame.marginColor}
            onChange={(v) => updateFrame({ marginColor: v })}
            disabled={!frame.enabled}
          />

          <Text size="xs" fw={500} c={frame.enabled ? undefined : 'dimmed'}>Margin (px)</Text>
          <Group grow>
            <NumberInput
              label="Top"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginTop}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginTop: v })}
              disabled={!frame.enabled}
            />
            <NumberInput
              label="Bottom"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginBottom}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginBottom: v })}
              disabled={!frame.enabled}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Left"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginLeft}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginLeft: v })}
              disabled={!frame.enabled}
            />
            <NumberInput
              label="Right"
              size="xs"
              min={0}
              max={500}
              step={5}
              value={frame.marginRight}
              onChange={(v) => typeof v === 'number' && updateFrame({ marginRight: v })}
              disabled={!frame.enabled}
            />
          </Group>

          <Switch
            label="Show border"
            size="sm"
            checked={frame.borderEnabled}
            onChange={(e) => updateFrame({ borderEnabled: e.currentTarget.checked })}
            disabled={!frame.enabled}
          />

          <ColorInput
            label="Border color"
            size="xs"
            value={frame.borderColor}
            onChange={(v) => updateFrame({ borderColor: v })}
            disabled={!frame.enabled || !frame.borderEnabled}
          />

          <NumberInput
            label="Border width (px)"
            size="xs"
            min={0.5}
            max={20}
            step={0.5}
            decimalScale={1}
            value={frame.borderWidth}
            onChange={(v) => typeof v === 'number' && updateFrame({ borderWidth: v })}
            disabled={!frame.enabled || !frame.borderEnabled}
          />

          <Text size="xs" fw={500} c={frame.enabled && frame.borderEnabled ? undefined : 'dimmed'}>Border style</Text>
          <SegmentedControl
            size="xs"
            orientation="vertical"
            value={frame.borderStyle}
            onChange={(v) => updateFrame({ borderStyle: v as FrameBorderStyle })}
            disabled={!frame.enabled || !frame.borderEnabled}
            data={[
              { value: 'single',        label: 'Single line' },
              { value: 'double',        label: 'Double line' },
              { value: 'cartographic',  label: 'Cartographic' },
              { value: 'shadow',        label: 'Drop shadow' },
              { value: 'ornate',        label: 'Ornate' },
            ]}
          />

          <Divider label="Title" labelPosition="left" />

          <Switch
            label="Show title"
            size="sm"
            checked={title.enabled}
            onChange={(e) => updateTitle({ enabled: e.currentTarget.checked })}
            disabled={!frame.enabled}
          />

          <Select
            label="Position"
            size="xs"
            data={POSITION_OPTIONS}
            value={title.position}
            onChange={(v) => v && updateTitle({ position: v as FramePosition })}
            disabled={!frame.enabled || !title.enabled}
          />

          <TextInput
            label="Title text"
            size="xs"
            placeholder="Map title…"
            value={title.text}
            onChange={(e) => updateTitle({ text: e.currentTarget.value })}
            disabled={!frame.enabled || !title.enabled}
          />

          <Group grow>
            <Select
              label="Font"
              size="xs"
              data={FONT_OPTIONS}
              value={title.font}
              onChange={(v) => v && updateTitle({ font: v })}
              disabled={!frame.enabled || !title.enabled}
            />
            <NumberInput
              label="Size (px)"
              size="xs"
              min={6}
              max={120}
              step={2}
              value={title.size}
              onChange={(v) => typeof v === 'number' && updateTitle({ size: v })}
              disabled={!frame.enabled || !title.enabled}
            />
          </Group>

          <ColorInput
            label="Color"
            size="xs"
            value={title.color}
            onChange={(v) => updateTitle({ color: v })}
            disabled={!frame.enabled || !title.enabled}
          />

          <Group gap="xl">
            <Checkbox
              label="Bold"
              size="xs"
              checked={title.bold}
              onChange={(e) => updateTitle({ bold: e.currentTarget.checked })}
              disabled={!frame.enabled || !title.enabled}
            />
            <Checkbox
              label="Italic"
              size="xs"
              checked={title.italic}
              onChange={(e) => updateTitle({ italic: e.currentTarget.checked })}
              disabled={!frame.enabled || !title.enabled}
            />
          </Group>

          <Divider label="Compass" labelPosition="left" />

          <Switch
            label="Show compass"
            size="sm"
            checked={compass.enabled}
            onChange={(e) => updateCompass({ enabled: e.currentTarget.checked })}
            disabled={!frame.enabled}
          />

          <Select
            label="Position"
            size="xs"
            data={POSITION_OPTIONS}
            value={compass.position}
            onChange={(v) => v && updateCompass({ position: v as FramePosition })}
            disabled={!frame.enabled || !compass.enabled}
          />

          <Select
            label="Style"
            size="xs"
            value={compass.compassStyle}
            onChange={(v) => v && updateCompass({ compassStyle: v as CompassConfig['compassStyle'] })}
            disabled={!frame.enabled || !compass.enabled}
            data={[
              { value: 'plain',    label: 'Plain' },
              { value: 'compass',  label: 'Compass Star' },
              { value: 'nautical', label: 'Nautical' },
              { value: 'celtic',   label: 'Celtic Knot' },
              { value: 'dragon',   label: 'Norse Dragon' },
            ]}
          />

          <Group grow>
            <NumberInput
              label="Size (px)"
              size="xs"
              min={20}
              max={200}
              step={5}
              value={compass.size}
              onChange={(v) => typeof v === 'number' && updateCompass({ size: v })}
              disabled={!frame.enabled || !compass.enabled}
            />
            <ColorInput
              label="Color"
              size="xs"
              value={compass.color}
              onChange={(v) => updateCompass({ color: v })}
              disabled={!frame.enabled || !compass.enabled}
            />
          </Group>

          <NumberInput
            label="Line width (px)"
            size="xs"
            min={0.5}
            max={5}
            step={0.5}
            decimalScale={1}
            value={compass.lineWidth}
            onChange={(v) => typeof v === 'number' && updateCompass({ lineWidth: v })}
            disabled={!frame.enabled || !compass.enabled}
          />

          <Text size="xs" fw={500} c={frame.enabled && compass.enabled ? undefined : 'dimmed'}>Labels</Text>

          {([
            { dir: '↑ Top',    labelKey: 'topLabel',    arrowKey: 'topArrow'    },
            { dir: '→ Right',  labelKey: 'rightLabel',  arrowKey: 'rightArrow'  },
            { dir: '↓ Bottom', labelKey: 'bottomLabel', arrowKey: 'bottomArrow' },
            { dir: '← Left',   labelKey: 'leftLabel',   arrowKey: 'leftArrow'   },
          ] as { dir: string; labelKey: keyof CompassConfig; arrowKey: keyof CompassConfig }[]).map(({ dir, labelKey, arrowKey }) => (
            <Group key={dir} gap="xs" align="center">
              <Text size="xs" style={{ width: 56, flexShrink: 0 }}>{dir}</Text>
              <TextInput
                size="xs"
                placeholder="—"
                value={compass[labelKey] as string}
                onChange={(e) => updateCompass({ [labelKey]: e.currentTarget.value })}
                disabled={!frame.enabled || !compass.enabled}
                maxLength={4}
                style={{ flex: 1 }}
              />
              {compass.compassStyle === 'plain' && (
                <Switch
                  size="xs"
                  label="Arrow"
                  checked={compass[arrowKey] as boolean}
                  onChange={(e) => updateCompass({ [arrowKey]: e.currentTarget.checked })}
                  disabled={!frame.enabled || !compass.enabled}
                />
              )}
            </Group>
          ))}
        <Divider label="Legend" labelPosition="left" />
        <Switch
          label="Show legend"
          size="sm"
          checked={legend.enabled}
          onChange={(e) => updateLegend({ enabled: e.currentTarget.checked })}
          disabled={!frame.enabled}
        />
        <Select
          label="Position"
          size="xs"
          data={POSITION_OPTIONS}
          value={legend.position}
          onChange={(v) => v && updateLegend({ position: v as FramePosition })}
          disabled={!frame.enabled || !legend.enabled}
        />
        <Group gap="md" align="flex-end" grow>
          <NumberInput
            label="Columns"
            size="xs"
            value={legend.columns}
            onChange={(v) => typeof v === 'number' && updateLegend({ columns: Math.max(1, Math.round(v)) })}
            disabled={!frame.enabled || !legend.enabled}
            min={1}
            max={5}
            step={1}
          />
          <NumberInput
            label="Font size (px)"
            size="xs"
            value={legend.fontSize}
            onChange={(v) => typeof v === 'number' && updateLegend({ fontSize: v })}
            disabled={!frame.enabled || !legend.enabled}
            min={6}
            max={32}
            step={1}
          />
          <ColorInput
            label="Color"
            size="xs"
            value={legend.color}
            onChange={(v) => updateLegend({ color: v })}
            disabled={!frame.enabled || !legend.enabled}
            format="hex"
          />
        </Group>
        <Divider label="Items" labelPosition="left" />
        {([
          { key: 'showMinorContour', labelKey: 'minorLabel', label: 'Minor contour' },
          { key: 'showMajorContour', labelKey: 'majorLabel', label: 'Major contour' },
          { key: 'showSeaLevel',     labelKey: 'seaLevelLabel', label: 'Sea level' },
          { key: 'showElevationFlags', labelKey: 'flagLabel', label: 'Elevation flags', requiresData: elevationFlags.length > 0 },
          { key: 'showSlopeArrows',  labelKey: 'arrowLabel', label: 'Slope arrows', requiresData: slopeArrows.length > 0 },
        ] as { key: keyof typeof legend; labelKey: keyof typeof legend; label: string; requiresData?: boolean }[]).map(({ key, labelKey, label, requiresData }) => (
          <Group key={key as string} gap="xs" align="center" wrap="nowrap">
            <Switch
              size="xs"
              checked={legend[key] as boolean}
              onChange={(e) => updateLegend({ [key]: e.currentTarget.checked })}
              disabled={!frame.enabled || !legend.enabled || requiresData === false}
              label={label}
              style={{ flex: '0 0 auto' }}
            />
            <TextInput
              size="xs"
              placeholder={label}
              value={legend[labelKey] as string}
              onChange={(e) => updateLegend({ [labelKey]: e.currentTarget.value })}
              disabled={!frame.enabled || !legend.enabled || !(legend[key] as boolean)}
              style={{ flex: 1, minWidth: 0 }}
            />
          </Group>
        ))}
          <Divider label="Measure bars" labelPosition="left" />
          <Switch
            label="Show measure bars"
            size="sm"
            description={!hasGroundResolution ? 'Set map width in calibration to enable' : undefined}
            checked={measureBar.enabled}
            onChange={(e) => updateMeasureBar({ enabled: e.currentTarget.checked })}
            disabled={!frame.enabled || !hasGroundResolution}
          />
          <Text size="xs" fw={500} c={frame.enabled && measureBar.enabled ? undefined : 'dimmed'}>Edges</Text>
          <Group gap="md">
            <Switch size="xs" label="Top"    checked={measureBar.showTop}    onChange={(e) => updateMeasureBar({ showTop: e.currentTarget.checked })}    disabled={!frame.enabled || !measureBar.enabled} />
            <Switch size="xs" label="Bottom" checked={measureBar.showBottom} onChange={(e) => updateMeasureBar({ showBottom: e.currentTarget.checked })} disabled={!frame.enabled || !measureBar.enabled} />
            <Switch size="xs" label="Left"   checked={measureBar.showLeft}   onChange={(e) => updateMeasureBar({ showLeft: e.currentTarget.checked })}   disabled={!frame.enabled || !measureBar.enabled} />
            <Switch size="xs" label="Right"  checked={measureBar.showRight}  onChange={(e) => updateMeasureBar({ showRight: e.currentTarget.checked })}  disabled={!frame.enabled || !measureBar.enabled} />
          </Group>
          <NumberInput
            label={`Major tick interval${abbr ? ` (${abbr})` : ''}`}
            size="xs"
            value={measureBar.majorInterval}
            onChange={(v) => typeof v === 'number' && v > 0 && updateMeasureBar({ majorInterval: v })}
            min={1}
            step={10}
            disabled={!frame.enabled || !measureBar.enabled}
          />
          <Group grow>
            <NumberInput
              label="Minor divisions"
              size="xs"
              value={measureBar.minorDivisions}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ minorDivisions: Math.max(1, Math.round(v)) })}
              min={1}
              max={10}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <NumberInput
              label="Tick (px)"
              size="xs"
              value={measureBar.tickLength}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ tickLength: v })}
              min={2}
              max={30}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <NumberInput
              label="Minor tick (px)"
              size="xs"
              value={measureBar.minorTickLength}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ minorTickLength: v })}
              min={1}
              max={20}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Line width (px)"
              size="xs"
              value={measureBar.lineWidth}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ lineWidth: v })}
              min={0.5}
              max={5}
              step={0.5}
              decimalScale={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <NumberInput
              label="Font size (px)"
              size="xs"
              value={measureBar.fontSize}
              onChange={(v) => typeof v === 'number' && updateMeasureBar({ fontSize: v })}
              min={6}
              max={24}
              step={1}
              disabled={!frame.enabled || !measureBar.enabled}
            />
            <ColorInput
              label="Color"
              size="xs"
              value={measureBar.color}
              onChange={(v) => updateMeasureBar({ color: v })}
              disabled={!frame.enabled || !measureBar.enabled}
              format="hex"
            />
          </Group>
          <Switch
            label="Show geo coordinates"
            size="sm"
            description={!hasGroundResolution ? 'Set map width in calibration to enable' : 'Use anchor tool in toolbar to set reference point'}
            checked={measureBar.geoEnabled}
            onChange={(e) => updateMeasureBar({ geoEnabled: e.currentTarget.checked })}
            disabled={!frame.enabled || !measureBar.enabled || !hasGroundResolution}
          />
          {measureBar.geoEnabled && hasGroundResolution && (
            <>
              <Group grow>
                <NumberInput
                  label="Anchor latitude (°)"
                  size="xs"
                  value={measureBar.anchorLat}
                  onChange={(v) => typeof v === 'number' && updateMeasureBar({ anchorLat: v })}
                  min={-90}
                  max={90}
                  step={0.001}
                  decimalScale={6}
                  disabled={!frame.enabled || !measureBar.enabled}
                />
                <NumberInput
                  label="Anchor longitude (°)"
                  size="xs"
                  value={measureBar.anchorLon}
                  onChange={(v) => typeof v === 'number' && updateMeasureBar({ anchorLon: v })}
                  min={-180}
                  max={180}
                  step={0.001}
                  decimalScale={6}
                  disabled={!frame.enabled || !measureBar.enabled}
                />
              </Group>
              <NumberInput
                label="Planet radius (km)"
                size="xs"
                value={measureBar.planetRadius}
                onChange={(v) => typeof v === 'number' && updateMeasureBar({ planetRadius: v })}
                min={100}
                max={100000}
                step={100}
                disabled={!frame.enabled || !measureBar.enabled}
              />
              <Switch
                label="Horizontal axis = latitude"
                description="Swap which axis shows lat vs lon"
                size="sm"
                checked={measureBar.horizontalAxisIsLat}
                onChange={(e) => updateMeasureBar({ horizontalAxisIsLat: e.currentTarget.checked })}
                disabled={!frame.enabled || !measureBar.enabled}
              />
            </>
          )}
        </Stack>
      </Collapse>
    </Stack>
  )
}
