# TopoCrafter — Open Items

Deferred issues requiring future work. Add items here when they arise; remove when resolved.

---

## OI-001 — PNG DPI embedding on export

**Status:** Deferred  
**Context:** The PPI field (METADATA group) is used for map scale calculation and display. PNG files support a `pHYs` chunk that encodes physical pixel density (in pixels per metre). When exporting a PNG, this chunk should be written so that programs that honour it (Photoshop, GIMP, printing software) reproduce the correct physical size.

**Details:**
- PNG stores pixels per metre, not per inch. Conversion: `round(ppi / 0.0254)`
- The raw PNG blob from canvas `toDataURL` or Electron's `capturePage` does **not** include a `pHYs` chunk.
- Post-processing the blob to inject `pHYs` requires either `pngjs`, `upng`, or `sharp` (all have Electron-compatible builds).
- JPEG does not support this natively (JFIF has DPI fields but quality loss is separate concern).

**Resolution path:** Once an export pipeline is built, add a post-processing step that reads the PPI from the store and injects the `pHYs` chunk before writing the file.

---

## OI-002 — Scale calculation assumes export = heightmap resolution

**Status:** Deferred  
**Context:** The map scale ratio (`1:X`) and scale bar are computed under the assumption that the exported image is at exactly 1:1 heightmap pixel resolution. The PPI × ground-resolution formula only holds when each pixel in the output corresponds to one heightmap pixel.

**Details:**
- If export allows upscaling (e.g., 2× for sharper print), the scale ratio stays correct but the PPI embedding should match the upscaled output (`ppi × scale_factor`).
- If export allows downscaling (e.g., web preview), the scale no longer applies and the scale bar will be physically wrong.
- For now, no export pipeline exists, so this is theoretical.

**Resolution path:** When building the export dialog, add a note or constraint that scale-based features (scale bar, PPI embedding) require 1:1 heightmap resolution export. Consider locking scale-related fields when a non-1:1 export is selected.

---

*Last updated: 2026-06-10*
