import { Stack, Text, Slider, NumberInput, ColorInput, Switch, Divider, Group } from '@mantine/core'
import { useStore } from '../../store/useStore'

export function ParameterPanel(): JSX.Element {
  const {
    parameters, style, hillshadeParams, terrainIsHillshade,
    updateParameters, updateStyle, updateHillshadeParams,
  } = useStore()

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

      <Stack gap={4}>
        <Text size="xs" fw={500}>Contour Interval</Text>
        <Slider
          min={0.01}
          max={0.2}
          step={0.01}
          value={parameters.interval}
          onChange={(v) => updateParameters({ interval: v })}
          label={(v) => v.toFixed(2)}
        />
      </Stack>

      <Group grow>
        <NumberInput
          label="Min Elevation"
          size="xs"
          min={0}
          max={1}
          step={0.05}
          decimalScale={2}
          value={parameters.minElevation}
          onChange={(v) => typeof v === 'number' && updateParameters({ minElevation: v })}
        />
        <NumberInput
          label="Max Elevation"
          size="xs"
          min={0}
          max={1}
          step={0.05}
          decimalScale={2}
          value={parameters.maxElevation}
          onChange={(v) => typeof v === 'number' && updateParameters({ maxElevation: v })}
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
        size="sm"
        checked={style.showLabels}
        onChange={(e) => updateStyle({ showLabels: e.currentTarget.checked })}
      />
    </Stack>
  )
}
