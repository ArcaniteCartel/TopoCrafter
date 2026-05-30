import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFile: (filters?: Array<{ name: string; extensions: string[] }>) =>
    ipcRenderer.invoke('dialog:openFile', filters ?? []) as Promise<string | null>,
  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath) as Promise<Uint8Array>,
  saveFile: (filters?: Array<{ name: string; extensions: string[] }>) =>
    ipcRenderer.invoke('dialog:saveFile', filters ?? []) as Promise<string | null>,
  writeFile: (filePath: string, data: Uint8Array) =>
    ipcRenderer.invoke('fs:writeFile', filePath, data) as Promise<void>,
  decodeExr: (filePath: string) =>
    ipcRenderer.invoke('heightmap:decodeExr', filePath) as Promise<{
      width: number
      height: number
      depth: string
      data: Uint8Array
    }>,
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
