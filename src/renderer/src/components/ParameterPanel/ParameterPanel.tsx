import { useEffect, useRef, useState } from 'react'
import { Stack, Text, Slider, NumberInput, ColorInput, Switch, Divider, Group, Select, TextInput } from '@mantine/core'
import { useStore } from '../../store/useStore'

const UNIT_OPTIONS = [
  { value: 'feet', label: 'Feet (ft)' },
  { value: 'meters', label: 'Meters (m)' },
  { value: 'custom', label: 'Custom…' },
]

// Subtle dashed style for read-only informational fields
const roStyle = {
  input: {
    borderStyle: 'dashed' as const,
    cursor: 'default' as const,
    opacity: 0.65,
  },
}

export function ParameterPanel(): JSX.Element {
  const {
    parameters, style, hillshadeParams, terrainIsHillshade, elevationCalibration,
    updateParameters, updateStyle, updateHillshadeParams,
    updateElevationCalibration, setElevationUnits,
  } = useStore()

  const { unitType, customName, customAbbr, customBase, customRatio, realMin, realMax, realInterval } = elevationCalibration

  const abbr = unitType === 'feet' ? 'ft'
    : unitType === 'meters' ? 'm'
    : unitType === 'custom' ? (customAbbr || '?')
    : ''

  const calReady = (unitType === 'feet' || unitType === 'meters'
    || (unitType === 'custom' && !!customAbbr && customRatio > 0))
    && realMin !== null && realMax !== null && realMax !== realMin

  // TextInput local state — avoids Mantine NumberInput controlled-mode quirks
  const [intervalStr, setIntervalStr] = useState<string>(
    realInterval !== null ? String(realInterval) : ''
  )

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

      {terrainIsHillshade && (
        <>
          <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
            Hillshade
          </Text>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Sun Azimuth</Text>
            <Slider
              min={0}
              max={360}
              step={5}
              value={hillshadeParams.azimuth}
              onChange={(v) => updateHillshadeParams({ azimuth: v })}
              label={(v) => `${v}°`}
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
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Vertical Exaggeration</Text>
            <Slider
              min={1}
              max={2000}
              step={1}
              value={hillshadeParams.zFactor}
              onChange={(v) => updateHillshadeParams({ zFactor: v })}
              label={(v) => `${v}×`}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Shadow Depth</Text>
            <Slider
              min={0.5}
              max={10}
              step={0.5}
              value={hillshadeParams.intensity}
              onChange={(v) => updateHillshadeParams({ intensity: v })}
              label={(v) => `${v.toFixed(1)}×`}
            />
          </Stack>

          <Stack gap={4}>
            <Text size="xs" fw={500}>Brightness</Text>
            <Slider
              min={0.3}
              max={0.9}
              step={0.05}
              value={hillshadeParams.brightness}
              onChange={(v) => updateHillshadeParams({ brightness: v })}
              label={(v) => `${Math.round(v * 100)}%`}
            />
          </Stack>

          <Divider />
        </>
      )}

      <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
        Contour Parameters
      </Text>

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
          styles={!calReady ? roStyle : undefined}
        />
      </Group>

      <Select
        label="Elevation Units"
        size="xs"
        placeholder="Select units…"
        data={UNIT_OPTIONS}
        value={unitType}
        onChange={(v) => v && setElevationUnits(v as 'feet' | 'meters' | 'custom')}
        clearable
        onClear={() => updateElevationCalibration({ unitType: null })}
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
            />
          </Group>
        </Stack>
      )}

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
          styles={!unitType ? roStyle : undefined}
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
          styles={!unitType ? roStyle : undefined}
        />
      </Group>

      <NumberInput
        label="Major Contour Every N Lines"
        size="xs"
        min={1}
        max={20}
        value={parameters.majorEvery}
        onChange={(v) => typeof v === 'number' && updateParameters({ majorEvery: v })}
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

      <Switch
        label="Show Elevation Labels"
        description={!calReady ? 'Set units and real-world min/max to enable' : undefined}
        size="sm"
        checked={style.showLabels}
        disabled={!calReady}
        onChange={(e) => updateStyle({ showLabels: e.currentTarget.checked })}
      />
    </Stack>
  )
}
