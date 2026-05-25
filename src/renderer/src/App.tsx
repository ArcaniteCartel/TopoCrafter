import { AppShell } from '@mantine/core'
import { Toolbar } from './components/Toolbar/Toolbar'
import { FilePanel } from './components/FilePanel/FilePanel'
import { ParameterPanel } from './components/ParameterPanel/ParameterPanel'
import { MapCanvas } from './components/MapCanvas/MapCanvas'
import { useHillshade } from './hooks/useHillshade'

export function App(): JSX.Element {
  useHillshade()

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
      <AppShell.Main style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MapCanvas />
      </AppShell.Main>
    </AppShell>
  )
}
