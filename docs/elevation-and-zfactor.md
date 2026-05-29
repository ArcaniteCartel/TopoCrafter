# Elevation, Z Factor, and Ground Resolution in TopoCrafter

This document explains how TopoCrafter represents terrain data internally, how the hillshade
is computed, what the current controls actually mean geometrically, and how adding a ground
resolution field would change the relationship between those controls.

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
Real-world elevation = realMin + normalized_value × (realMax − realMin) / (maxValue − minValue)
```

Or in plain language: you tell the app "the darkest pixel in the image represents sea level
(0 ft) and the brightest pixel represents 4,921 ft." Everything in between is linearly
interpolated.

The contour interval is also stored in both normalized units and real-world units. The
normalized interval is what d3-contour actually uses to draw lines; the real-world interval
is what gets printed on the labels.

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
extent), what angle would this slope have?" A larger zFactor makes shallow slopes appear
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

## 4. What Z Factor Actually Means Right Now

Currently, **Z Factor has no connection to real-world units.** It is a raw multiplier on a
number that is already dimensionless (normalized elevation units per pixel). The slider
goes 1–2000 and the default is 150.

To understand what 150 actually means, consider the chain:

```
dzdx_normalized × zFactor → effective slope used for shading
```

If a pixel has a real-world slope of 30° (rise = 1, run = 1.73), and your terrain covers
10 km × 10 km at 1000 × 1000 pixels with a 1500 m elevation range, then:

- Ground resolution = 10 m/pixel
- `dzdx_normalized` for a 30° slope ≈ `(1500 m / 65535) / (1 / 10 m/px)` ≈ a very small number
- For the shading to show 45° (where nx = nz), you need `dzdx × zFactor = 1`

The "correct" Z Factor — the one that makes the shading reflect the actual geometric angle
of the terrain — is:

```
Correct Z Factor = elevation_range_in_real_units / ground_resolution_in_same_units_per_pixel
```

For the example above: `1500 m / 10 m/px = 150`. That is where the default comes from.
It is a reasonable guess for typical terrain data, but it is a guess.

If your terrain has 300 m of relief over a 5 km × 5 km area at 512 × 512 pixels:
- Ground resolution = 9.77 m/pixel
- Correct Z Factor = 300 / 9.77 ≈ 31

Using 150 here would make the terrain look about 5× steeper than it really is.

---

## 5. The Problem With the Current Setup

There are two issues:

**Issue 1: Z Factor is not intuitive.** A value of 150 is meaningless without knowing the
terrain's real-world scale. Users have to experiment until it "looks right," without knowing
whether they are looking at geographically accurate shading or an exaggerated one.

**Issue 2: Vertical Exaggeration and Z Factor are the same slider, conflated.** In
cartography, "vertical exaggeration" is traditionally a dimensionless ratio — 1× means
accurate, 2× means the terrain looks twice as steep as reality, 0.5× means compressed.
Right now the Z Factor slider conflates two things:
- The geometric correction needed to account for the terrain's real-world scale (should be
  computed automatically)
- The intentional artistic exaggeration the user wants to apply on top of that (should be
  a separate control)

---

## 6. How Ground Resolution Would Change Things

Adding a **Ground Resolution** field (real-world units per pixel, or equivalently the
total real-world width of the map) would allow the app to compute the correct Z Factor
automatically.

### What the user would enter

The most intuitive input is the **total map extent** — the real-world width (or height) of
the area the heightmap covers, in the same unit system as the elevation calibration. The app
would then derive:

```
ground_resolution = map_extent / image_width_in_pixels
```

Alternatively, the user could enter ground resolution directly (e.g., "10 m/pixel").

### What the app would compute

```
correct_zFactor = (realMax − realMin) / ground_resolution
```

This is the Z Factor that makes the hillshade geometrically accurate — shading angles that
match what you would measure on the real terrain.

### How the Vertical Exaggeration slider would change

Instead of controlling the raw Z Factor (which has no intuitive meaning), the slider could
control a **true vertical exaggeration multiplier** expressed as a ratio:

```
actual_zFactor = correct_zFactor × vertical_exaggeration
```

- **VE = 1.0** → geographically accurate hillshade
- **VE = 2.0** → terrain looks twice as steep as reality (common in printed topo maps to
  make relief more visible)
- **VE = 0.5** → terrain appears flatter than reality

The slider range 0.1×–10× covers the useful artistic range. The underlying Z Factor sent
to the hillshade algorithm is `correct_zFactor × VE`, computed invisibly.

### What happens without ground resolution

If the user has not entered ground resolution, the behaviour stays exactly as today —
the raw Z Factor slider is shown and the user adjusts it manually. Ground resolution is
entirely optional.

### Summary of the proposed change

| | Without Ground Resolution | With Ground Resolution |
|---|---|---|
| Z Factor slider | Raw value, 1–2000 | Hidden; replaced by VE multiplier |
| Vertical Exaggeration | Same as Z Factor | Separate 0.1×–10× multiplier |
| Accuracy indicator | None | "Geometric Z Factor: 150" displayed read-only |
| On-load default | 150 (hardcoded) | Auto-computed from calibration + resolution |

---

## 7. Practical Example End to End

Suppose you have a heightmap of a mountain range:
- Image: 2048 × 2048 pixels, 16-bit PNG
- `minValue` = 0.1200, `maxValue` = 0.9500 (the range used in the image)
- Calibration: realMin = 1200 ft, realMax = 14,500 ft
- Map extent: 80 miles wide

**Normalized elevation span:** `0.9500 − 0.1200 = 0.83`
**Real elevation span:** `14,500 − 1200 = 13,300 ft`
**Ground resolution:** `80 miles × 5280 ft/mile / 2048 px = 206 ft/px`
**Correct Z Factor:** `13,300 / 206 ≈ 65`

With the current app, the default of 150 would shade this terrain at roughly 2.3× actual
steepness, making the peaks look more dramatic than they are. With the proposed change, the
app would compute Z Factor = 65 automatically, and the user could then slide the VE
multiplier to 2.0 if they wanted the traditional "slightly exaggerated for readability" look
of printed topographic maps, while knowing exactly what they are doing.
