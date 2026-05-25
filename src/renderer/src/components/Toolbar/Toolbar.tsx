import { useState } from 'react'
import {
  Group, Title, Button, Menu, UnstyledButton,
  Modal, SimpleGrid, Paper, Text, Stack, Box,
} from '@mantine/core'
import { useStore } from '../../store/useStore'
import { useThemeStore } from '../../store/useThemeStore'
import { THEMES } from '../../themes'

export function Toolbar(): JSX.Element {
  const isDirty = useStore((s) => s.isDirty)
  const reset = useStore((s) => s.reset)
  const { themeId, setTheme } = useThemeStore()
  const [themeModalOpen, setThemeModalOpen] = useState(false)

  const handleExport = async () => {
    // TODO: implement canvas composite export
  }

  return (
    <>
      <Group h="100%" px="md" justify="space-between">
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
