import { useState } from 'react'
import {
  Group, Title, Button, Menu, UnstyledButton,
  Modal, SimpleGrid, Paper, Text, Stack, Box,
  Popover, Tooltip, ActionIcon,
} from '@mantine/core'
import { useStore } from '../../store/useStore'
import { useThemeStore } from '../../store/useThemeStore'
import { THEMES } from '../../themes'

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

export function Toolbar(): JSX.Element {
  const isDirty = useStore((s) => s.isDirty)
  const reset = useStore((s) => s.reset)
  const mapTool = useStore((s) => s.mapTool)
  const setMapTool = useStore((s) => s.setMapTool)
  const elevationCalibration = useStore((s) => s.elevationCalibration)
  const { themeId, setTheme } = useThemeStore()
  const [themeModalOpen, setThemeModalOpen] = useState(false)
  const [toolPanelOpen, setToolPanelOpen] = useState(false)

  const { unitType, customAbbr, customRatio, realMin, realMax } = elevationCalibration
  const calReady = (unitType === 'feet' || unitType === 'meters'
    || (unitType === 'custom' && !!customAbbr && customRatio > 0))
    && realMin !== null && realMax !== null && realMax !== realMin

  const handleExport = async () => {
    // TODO: implement canvas composite export
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
          <Button size="xs" variant="light" onClick={handleExport} disabled={!isDirty}>
            Export Merged Image
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={reset}>
            Reset
          </Button>
        </Group>
      </Group>

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
