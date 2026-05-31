import { useEffect } from 'react'
import { AppShell, Tabs } from '@mantine/core'
import { Toolbar } from './components/Toolbar/Toolbar'
import { FilePanel } from './components/FilePanel/FilePanel'
import { ParameterPanel } from './components/ParameterPanel/ParameterPanel'
import { MapCanvas } from './components/MapCanvas/MapCanvas'
import { useHillshade } from './hooks/useHillshade'
import { useStore } from './store/useStore'

export function App(): JSX.Element {
  useHillshade()

  const heightmap = useStore((s) => s.heightmap)
  const terrainImageUrl = useStore((s) => s.terrainImageUrl)
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)

  const showHillshadeTab = !!heightmap
  const showTerrainTab = !!terrainImageUrl
  const showTabs = showHillshadeTab || showTerrainTab

  // Correct invalid tab state (e.g., terrain tab selected but no terrain image loaded)
  useEffect(() => {
    if (activeTab === 'terrain' && !terrainImageUrl) {
      setActiveTab('hillshade')
    }
  }, [activeTab, terrainImageUrl, setActiveTab])

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 300, breakpoint: 'sm' }}
      padding={0}
    >
      <AppShell.Header>
        <Toolbar />
      </AppShell.Header>
      <AppShell.Navbar p="md" style={{ overflowY: 'auto' }}>
        <FilePanel />
        <ParameterPanel />
      </AppShell.Navbar>
      <AppShell.Main>
        <div style={{
          position: 'fixed',
          top: 'var(--app-shell-header-height, 52px)',
          left: 'var(--app-shell-navbar-width, 300px)',
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {showTabs && (
            <Tabs
              value={activeTab}
              onChange={(v) => v && setActiveTab(v as 'terrain' | 'hillshade')}
              style={{
                flexShrink: 0,
                borderBottom: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Tabs.List>
                {showTerrainTab && <Tabs.Tab value="terrain">Terrain</Tabs.Tab>}
                {showHillshadeTab && <Tabs.Tab value="hillshade">Hillshade</Tabs.Tab>}
              </Tabs.List>
            </Tabs>
          )}
          <MapCanvas />
        </div>
      </AppShell.Main>
    </AppShell>
  )
}
