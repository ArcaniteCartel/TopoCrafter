# TopoCrafter — Community vs. Premium Features

This document tracks features that are candidates for a premium tier. The community
version is fully functional for standard topo-map workflows; premium features target
professional cartographers, game designers, and high-volume users who need additional
fidelity or automation.

---

## Build Tier System

### Mechanism

Vite's `define` option replaces named constants at compile time with literal values.
Setting `__PREMIUM__: true` or `__PREMIUM__: false` in `vite.config.ts` (or
`electron.vite.config.ts`) means any `if (__PREMIUM__) { … }` guard in source code
is evaluated at bundle time. The bundler then tree-shakes the dead branch — premium
code is **physically absent** from the community build, not merely hidden behind a
runtime check.

### Implementation steps (when ready)

1. **`electron.vite.config.ts`** — add to the renderer (and optionally main) `define`
   block:
   ```ts
   define: {
     __PREMIUM__: JSON.stringify(process.env.BUILD_TIER === 'premium'),
   }
   ```

2. **TypeScript ambient declaration** — add to `src/renderer/src/env.d.ts` (or a new
   `src/globals.d.ts`):
   ```ts
   declare const __PREMIUM__: boolean
   ```
   This prevents TypeScript errors on the bare identifier.

3. **`package.json` scripts** — add tier-specific scripts alongside the existing ones:
   ```json
   "dev:community":  "electron-vite dev",
   "dev:premium":    "cross-env BUILD_TIER=premium electron-vite dev",
   "build:community":"electron-vite build",
   "build:premium":  "cross-env BUILD_TIER=premium electron-vite build"
   ```
   (`cross-env` handles `process.env` assignment cross-platform; add it as a dev
   dependency if not already present.)

4. **Feature guards in source** — wrap premium-only code paths:
   ```ts
   if (__PREMIUM__) {
     // high-res export, etc.
   }
   ```
   For UI elements (e.g. a locked button in community), use a ternary or conditional
   render rather than outright removal, so the community user can see what premium
   offers.

### Properties

| Property | Value |
|----------|-------|
| Premium code in community build? | No — tree-shaken out entirely |
| Runtime performance cost? | None — constant folded at build time |
| Dev workflow change? | Use `npm run dev:premium` to test premium paths locally |
| Obfuscation needed? | Not for tree-shaken paths; consider for UI "teaser" elements |

---

## Premium Features

### High-Resolution Export

**Status:** Not yet implemented (export infrastructure exists; resolution cap is the gap)

**Description:**  
The current export pipeline sizes the output canvas from the live DOM element
(`getBoundingClientRect()`), which ties export resolution to whatever pixel size the map
happens to occupy on screen — typically 900–1200px wide.

The heightmap data is already loaded at full native resolution (e.g. 4096×4096) and the
SVG overlays use a viewBox that exactly matches heightmap pixel coordinates. Nothing in
the rendering pipeline prevents full-resolution export; the cap is purely in how the
canvas dimensions are sourced.

**Premium behaviour:**  
Export at the heightmap's native pixel dimensions. The caller passes `mapW =
heightmap.width` and `mapH = heightmap.height` to the export functions instead of reading
from the DOM. All layers (base image, contour SVG, annotation SVG, grid) are drawn into
a canvas sized to the heightmap, producing lossless full-resolution output.

**Community behaviour:**  
Export at screen resolution (current behaviour). Suitable for web sharing and
standard-print sizes; insufficient for large-format or professional print workflows.

**Affected files (when implemented):**
- `src/renderer/src/utils/export.ts` — `exportToBlob`, `exportOverlayToBlob`
- `src/renderer/src/components/Toolbar/Toolbar.tsx` — pass heightmap dimensions
- `src/renderer/src/components/Toolbar/OverlayExportModal.tsx` — pass heightmap dimensions

---

*Add further premium feature entries below this line as they are identified.*
