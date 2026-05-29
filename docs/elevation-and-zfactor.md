# Elevation, Z Factor, and Ground Resolution in TopoCrafter

This document explains how TopoCrafter represents terrain data internally, how the hillshade
is computed, what the controls mean geometrically, and how the ground resolution field
connects them into a unified, calibrated system.

---

## 1. How the Heightmap Is Stored Internally

When you load a heightmap, every pixel is converted to a **float between 0.0 and 1.0** based
on the file format's maximum possible value:

| Format | Conversion |
|---|---|
| 8-bit PNG/JPEG | `pixel / 255` |
| 16-bit PNG | `pixel / 65535` |
| GeoTIFF (unsigned int) | `pixel / (2^bits − 1)` — may not span full 0–1 range |
| GeoTIFF (float or signed) | `(pixel − rawMin) / (rawMax − rawMin)` — always spans 0–1 |

After conversion, the app scans all pixels and records `minValue` and `maxValue` — the
actual lowest and highest normalized values found in the image. These are what appear as
the read-only "Normalized Min" and "Normalized Max" fields in the UI.

A perfectly flat image exported from a terrain tool might give `minValue = 0.0312` and
`maxValue = 0.8847`. The terrain doesn't use the full 0–1 range; it only uses the range
that actual elevation data occupies.

**Key point:** The normalized value has no inherent unit. It is just pixel brightness
relative to the file's bit depth. All real-world meaning — feet, meters, any elevation —
is supplied by the calibration you enter manually.

---

## 2. The Elevation Calibration Panel

The calibration panel maps the normalized 0–1 range to real-world elevations:

```
real_elevation = realMin + normalized_value × (realMax − realMin) / (maxValue − minValue)
```

In plain language: you tell the app "the darkest pixel in the image represents sea level
(0 ft) and the brightest pixel represents 4,921 ft." Everything in between is linearly
interpolated.

The contour interval is stored in both normalized units and real-world units. The normalized
interval is what d3-contour uses to draw lines; the real-world interval is what gets printed
on the labels. They stay in sync via the formula:

```
normalized_interval = real_interval × normalized_span / real_span
```

The panel supports feet, meters, or any custom unit. Custom units are defined by a name,
abbreviation, a base unit (feet or meters), and a ratio (how many base units equal one
custom unit). When you switch between unit systems all calibration values — including the
map width field described below — are converted automatically through meters as a universal
intermediate.

---

## 3. How the Hillshade Is Computed

The hillshade algorithm works in four steps:

### Step 1 — Compute the Sobel gradient

For each pixel, the algorithm looks at its eight neighbours and computes the slope of the
terrain in the east–west and north–south directions:

```
dzdx = (right neighbours − left neighbours) / 8
dzdy = (bottom neighbours − top neighbours) / 8
```

This gives the **rise over run** in normalized elevation units per pixel. A flat area has
`dzdx ≈ 0`. A steep cliff might have `dzdx ≈ 0.01` or larger.

### Step 2 — Scale by Z Factor to get the surface normal

```
nx = −dzdx × zFactor
ny = −dzdy × zFactor
nz = 1
```

`nz` is always left at 1. Multiplying the horizontal gradient by `zFactor` is equivalent
to asking: "if the terrain were `zFactor` times taller (while keeping the same horizontal
extent), what angle would this slope have?" A larger Z Factor makes shallow slopes appear
steeper. The normal vector `(nx, ny, nz)` is then length-normalised.

### Step 3 — Dot product with the light direction

The light direction is computed from azimuth and altitude:

```
lx = cos(altitude) × sin(azimuth)
ly = −cos(altitude) × cos(azimuth)
lz = sin(altitude)
```

The dot product of the normalised surface normal and the light vector gives a value between
−1 and 1. A surface facing directly toward the sun gives +1 (bright). A surface facing
directly away gives −1 (dark).

### Step 4 — Apply brightness and intensity

```
pixel = brightness + (dot − lz) × intensity
```

`lz` is the dot product of a perfectly flat surface with the light, so subtracting it
centres the adjustment at flat = neutral. `brightness` shifts the base grey level up or
down. `intensity` scales how much light and shadow contrast is applied.

---

## 4. The Geometrically Correct Z Factor

The Sobel gradient `dzdx` is in normalized elevation units per pixel — a dimensionless
ratio with no connection to real-world units. For the shading to reflect the **true
geometric angle** of the terrain, the Z Factor must make the units consistent:

```
correct_zFactor = elevation_range_in_real_units / ground_resolution_in_same_units_per_pixel
```

Where:
- `elevation_range` = `realMax − realMin` (from the calibration panel)
- `ground_resolution` = real-world distance per pixel = `map_width / image_width_in_pixels`

**Example:** A 1000 × 1000 px image covering 10 km × 10 km with 1500 m of relief:
- Ground resolution = 10,000 m / 1000 px = 10 m/px
- Correct Z Factor = 1500 / 10 = **150**

This is where the default of 150 comes from — it is a reasonable approximation for typical
terrain data, but it is still a guess without knowing the actual map dimensions.

If your terrain has 300 m of relief over a 5 km × 5 km area at 512 × 512 pixels:
- Ground resolution = 9.77 m/pixel
- Correct Z Factor = 300 / 9.77 ≈ **31**

Leaving the slider at 150 here would shade the terrain at roughly 5× actual steepness.

---

## 5. How Ground Resolution and Vertical Exaggeration Work in the App

When you enter a value in the **"Width in [unit] of Map"** field, the app can compute the
correct Z Factor automatically. This unlocks a more meaningful control in the hillshade
panel: a true **Vertical Exaggeration** multiplier.

### What you enter

The **total real-world width** of the area the heightmap covers, in the same units as your
elevation calibration (feet, meters, or custom). The app derives ground resolution
internally:

```
ground_resolution = map_width / image_width_in_pixels
```

The map width field converts automatically when you switch unit systems, exactly like the
elevation min and max fields.

### What the app computes

```
correct_zFactor = (realMax − realMin) / ground_resolution
actual_zFactor  = correct_zFactor × vertical_exaggeration
```

`actual_zFactor` is what gets passed to the hillshade algorithm. You never see or set it
directly — it is derived from values you have already entered.

### The Vertical Exaggeration slider

Once the map width and calibration are both set, the raw Z Factor slider is replaced by a
**Vertical Exaggeration** slider (range 0.1×–10×, default 1.0×). A read-only "Actual Z
Factor" field shows the computed result so you can see exactly what the algorithm receives.

- **VE = 1.0** → geographically accurate hillshade; shading angles match the real terrain
- **VE = 2.0** → terrain looks twice as steep as reality (common in printed topo maps to
  make relief more visible at small scales)
- **VE = 0.5** → terrain appears flatter than reality
- **VE > 1.0** → exaggerated; useful for subtle terrain where relief is hard to read

### What happens without map width

If you leave the map width field blank, the behaviour is identical to before: the raw Z
Factor slider (range 1–2000) is shown and you adjust it manually. Map width is entirely
optional.

### Summary

| | Map width not set | Map width set |
|---|---|---|
| Z Factor slider | Raw value, 1–2000 | Hidden |
| Vertical Exaggeration | Same as raw Z Factor | Separate 0.1×–10× multiplier |
| Accuracy indicator | None | Read-only "Actual Z Factor: N" |
| Correct Z computed? | No | Yes, from calibration + map width |

---

## 6. Practical Example End to End

Suppose you have a heightmap of a mountain range:
- Image: 2048 × 2048 pixels, 16-bit PNG
- `minValue` = 0.1200, `maxValue` = 0.9500 (the range the image actually uses)
- Calibration: realMin = 1,200 ft, realMax = 14,500 ft
- Map width: 422,400 ft (80 miles)

**Normalized elevation span:** `0.9500 − 0.1200 = 0.83`
**Real elevation span:** `14,500 − 1,200 = 13,300 ft`
**Ground resolution:** `422,400 ft / 2048 px ≈ 206 ft/px`
**Correct Z Factor:** `13,300 / 206 ≈ 65`

With map width left blank and the default Z Factor of 150, this terrain would shade at
roughly 2.3× actual steepness — peaks look more dramatic than they are. With map width
entered, the app computes Z Factor = 65 automatically. Setting VE to 1.0 gives a
geographically accurate hillshade; setting VE to 2.0 doubles the apparent steepness
intentionally, giving the exaggerated-but-readable look common in printed topo maps.

---

## 7. Elevation Calibration and Custom Units

All real-world values in the calibration panel — min elevation, max elevation, contour
interval, and map width — are stored in the currently selected unit. When you switch
between feet, meters, and custom, they are all converted automatically.

Custom units require a name, abbreviation, base unit (feet or meters), and a ratio. The
ratio defines how many base units equal one custom unit. For example:

- 1 league = 15,840 feet → base = feet, ratio = 15,840
- 1 kilometer = 1,000 meters → base = meters, ratio = 1,000

**When you switch to custom from feet or meters**, the existing values are kept in their
current unit rather than cleared. Once you enter a valid ratio and tab out of the field,
all four values are converted from the source unit into the custom unit. Before you enter
the ratio, the fields show the original values for reference.

All conversions go through meters as a universal intermediate:
```
value_in_custom = calFromMeters(calToMeters(value_in_source, source_unit), custom_unit)
```

This means the math is correct regardless of whether you are converting feet → custom,
meters → custom, or any other combination.
