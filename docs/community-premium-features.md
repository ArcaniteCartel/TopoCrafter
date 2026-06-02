# TopoCrafter — Community vs. Premium Features

This document tracks features that are candidates for a premium tier. The community
version is fully functional for standard topo-map workflows; premium features target
professional cartographers, game designers, and high-volume users who need additional
fidelity or automation.

---

## Build Tier System

The intended implementation uses a Vite compile-time constant (`__PREMIUM__`) so that
premium code paths are completely absent from community builds (tree-shaken, not merely
hidden). See `docs/build-tiers.md` (to be written) for the implementation plan.

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
