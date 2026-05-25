# TopoCrafter — Project Definition

## Overview

TopoCrafter is a desktop application for generating vectorized topographical overlays from terrain images and their corresponding heightmap files. Users load a terrain image alongside a grayscale heightmap, tune contour parameters interactively, preview the overlay in real time, and export a final merged image combining terrain and topography.

## Purpose

Topographical maps are valuable in game design, world-building, cartography, and geographic visualization. TopoCrafter automates contour line generation from heightmaps — a process traditionally done manually or with heavy GIS tooling — and packages it into an accessible, interactive desktop workflow.

## Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| Desktop shell | Electron 31 | Cross-platform native app with OS file system access |
| Build tooling | electron-vite 2 | Purpose-built Vite integration for Electron; fast HMR in dev |
| UI framework | React 18 + TypeScript | Component tree and type safety for complex interactive state |
| Component library | Mantine 7 | Rich, polished components (sliders, number inputs, color pickers) well-suited to a parameter-driven tool UI |
| State management | Zustand 4 | Lightweight, boilerplate-free global state for terrain/contour data |
| Contour generation | d3-contour 4 | Converts scalar heightmap fields to GeoJSON contour polygons; the core algorithmic engine |
| Vector rendering | SVG (React-rendered) | Native to the browser, composable over images, easily styled per contour, resolution-independent |
| Image compositing | Browser Canvas API | Final merge of terrain image + SVG overlay into a raster export |

## Architecture

### Process Model

TopoCrafter uses Electron's two-process model:

```
┌─────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                      │
│  - Creates BrowserWindow                                     │
│  - File system I/O via fs/promises (readFile, writeFile)     │
│  - Native OS dialogs (showOpenDialog, showSaveDialog)        │
│  - IPC handlers (ipcMain.handle)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC via contextBridge
                           │ openFile / readFile / saveFile / writeFile
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (Chromium — React app)                     │
│  - Full application UI (Mantine components)                  │
│  - Heightmap parsing: Canvas API → Float32Array              │
│  - Contour generation: d3-contour → ContourMultiPolygon[]    │
│  - SVG overlay rendering over terrain image                  │
│  - Canvas compositing for final raster export                │
│  - Zustand global state                                      │
└─────────────────────────────────────────────────────────────┘
```

The **Preload script** (`src/preload/index.ts`) acts as the bridge: it runs in a privileged Node.js context and exposes a typed `electronAPI` object on `window` via `contextBridge`, giving the renderer safe, sandboxed access to OS operations without enabling `nodeIntegration`.

### Renderer File Structure

```
src/renderer/src/
├── main.tsx                        Entry point — MantineProvider + React root
├── App.tsx                         AppShell layout: header, navbar, main
├── index.css                       Global resets (html/body/root height)
│
├── types/
│   └── index.ts                    Shared types: ContourParameters, ContourStyle,
│                                   HeightmapInfo, ProjectState, window.electronAPI
│
├── store/
│   └── useStore.ts                 Zustand store — all project state and actions
│
├── utils/
│   ├── heightmap.ts                Load image file → Float32Array (luminance decode)
│   └── contour.ts                  d3-contour wrapper → ContourSet + SVG path strings
│
└── components/
    ├── Toolbar/Toolbar.tsx         Top bar: app title, Export Merged Image, Reset
    ├── FilePanel/FilePanel.tsx     Load/replace terrain image and heightmap files
    ├── ParameterPanel/             Sliders and inputs for contour params and style
    │   └── ParameterPanel.tsx
    └── MapCanvas/MapCanvas.tsx     Terrain image with SVG contour overlay
```

### Data Flow

```
File Load
  └─► electronAPI.openFile()  →  native OS dialog
        └─► electronAPI.readFile(path)  →  Uint8Array buffer
              └─► Blob → createObjectURL → <img> → Canvas.getImageData
                    └─► Float32Array (luminance-decoded heightmap)
                          └─► Zustand: setHeightmap / setTerrainImage

Parameter / Style Change
  └─► Zustand: updateParameters / updateStyle
        └─► MapCanvas useMemo triggers generateContours()
              └─► d3-contour → ContourMultiPolygon[]
                    └─► contourToSvgPath() → SVG <path d="..."> elements
                          └─► rendered as absolute-positioned SVG over terrain image

Export (planned)
  └─► <canvas> drawImage(terrainImg)
        └─► SVG serialized to data URL → drawImage(svgUrl)
              └─► canvas.toBlob() → electronAPI.writeFile(path, data)
```

### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar (height: 52px)                                      │
│  [TopoCrafter]                    [Export Merged] [Reset]    │
├───────────────────┬─────────────────────────────────────────┤
│  Navbar (300px)   │  MapCanvas (flex: 1)                     │
│                   │                                         │
│  Source Files     │  ┌─────────────────────────────────┐   │
│  ─ Terrain Image  │  │  <img> terrain (raster)          │   │
│  ─ Heightmap      │  │  + <svg> contour overlay         │   │
│                   │  │    (position: absolute,          │   │
│  Contour Params   │  │     matching image dimensions,   │   │
│  ─ Interval       │  │     pointer-events: none)        │   │
│  ─ Min/Max elev.  │  └─────────────────────────────────┘   │
│  ─ Major every N  │                                         │
│  ─ Smoothing      │                                         │
│                   │                                         │
│  Style            │                                         │
│  ─ Minor color    │                                         │
│  ─ Major color    │                                         │
│  ─ Line widths    │                                         │
│  ─ Opacity        │                                         │
│  ─ Show labels    │                                         │
└───────────────────┴─────────────────────────────────────────┘
```

## Key Design Decisions

**All processing in the renderer.** d3-contour, heightmap parsing, and canvas compositing run entirely in the Chromium renderer. The main process is deliberately thin — only file I/O. This avoids cross-process serialization overhead for large Float32Array heightmap data.

**SVG for the contour overlay.** Contour paths are rendered as SVG elements positioned absolutely over the terrain image. Each path is individually styleable (color, width), the overlay is resolution-independent, and the coordinate system maps directly to heightmap pixel space.

**Reactive contour generation.** `MapCanvas` uses `useMemo` to re-run contour generation whenever `heightmap` or `parameters` change. The overlay updates live as the user adjusts any parameter — no explicit "regenerate" button needed.

**Blob URLs for images.** Both the terrain image and heightmap are loaded as `Uint8Array` buffers via IPC, then converted to `blob:` URLs via `URL.createObjectURL()`. This keeps large binary data out of the JS string heap and integrates naturally with `<img>` and Canvas APIs.

**Heightmap format.** Heightmaps are expected to be grayscale-encoded image files (PNG, JPEG, TIFF). Elevation is decoded using ITU-R BT.709 luminance weights across the RGB channels, normalized to the 0–1 range.

## Supported File Formats

| Type | Supported |
|---|---|
| Terrain image input | PNG, JPEG, TIFF |
| Heightmap input | PNG, JPEG, TIFF |
| Export output | PNG (planned) |
