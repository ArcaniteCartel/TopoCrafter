import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { App } from './App'
import { useThemeStore } from './store/useThemeStore'
import '@mantine/core/styles.css'
import './index.css'

function ThemedApp(): JSX.Element {
  const { theme } = useThemeStore()
  return (
    <MantineProvider
      theme={theme.mantineTheme}
      forceColorScheme={theme.colorScheme}
      cssVariablesResolver={theme.cssVariablesResolver}
    >
      <App />
    </MantineProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
)
