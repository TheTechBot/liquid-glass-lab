# Stage 1 — Investigation of the existing (v1) refraction path

Date 2026-11-17. Files inspected (local copies byte-identical to the cloud workspace, SHA-1 checked):
`implementations/web/src/liquid-glass.js`, `liquid-glass.css`, `demo/index.html`, `dist/liquid-glass-demo.html`, `design-system/SPEC.md`, `design-system/tokens/tokens.json` (the brief's `design-system/tokens.json` path does not exist).

## Live-browser inspection status
- REA `list_browser_targets` against `http://127.0.0.1:9222` and `http://[::1]:9222`: **endpoint_unreachable** (both). REA rejects `localhost` by schema (explicit 127.0.0.1 / ::1 only).
- Likely cause (not verified): Chrome 136+ ignores `--remote-debugging-port` on the default profile; it needs a separate `--user-data-dir`. Command in `validation/REPORT.md`.
- Therefore all runtime facts below come from headless Chrome (Playwright, `channel: chrome`) in the cloud workspace, not from the user's live session.

## How v1 works (observed in source + runtime)
1. `LG.refract(el)` creates one SVG `<filter>` per surface: `feImage` (a PNG data-URL displacement map) → `feDisplacementMap(in=SourceGraphic, in2=map, scale=S, R→x, G→y)`.
2. The map is generated on a 2D canvas from a **rounded-rectangle SDF** using `border-top-left-radius` only. Inside a band `edge × min(w,h)` from the border, pixels are pushed **inward along the normal** with magnitude `(1 − depth/band)²`. Interior is neutral (128,128).
3. CSS applies it as `::before { backdrop-filter: blur(0.6·B) url(#id) saturate() brightness() }`. Chain order = **blur first, displacement second**.
4. Token values: `sm {scale 24, edge .30}`, `md {44, .32}`, `lg {60, .22}`. Max displacement = scale/2 ≈ 12–30 px at the very edge.

## Why it does not read as optical glass
| # | Problem | Evidence |
|---|---|---|
| 1 | **Blur runs before displacement.** Bending is applied to already-smeared pixels, so straight lines inside the glass don't visibly bend. | `liquid-glass.css` `.lg-refract-on .lg-glass[data-lg-refract]::before`; `validation/screenshots/12-refraction-lab.png` (fine stripes at scale 0/44/90 look the same) |
| 2 | **Not optics.** Displacement = arbitrary quadratic falloff × normal. No index of refraction, no thickness, no surface height, no Snell's law. | `displacementMap()` in `liquid-glass.js` |
| 3 | **8-bit map, CSS-pixel resolution.** Offsets quantised to scale/255 steps and map not scaled for devicePixelRatio → stair-stepping on high-DPI. | canvas size = `rect.width × rect.height` |
| 4 | **One shape.** Rounded rect with a single corner radius. Ellipse (border-radius 50% on non-square), polygon and SVG path are wrong or impossible. | `parseFloat(borderTopLeftRadius)` |
| 5 | **Samples only inside the element box** (backdrop-filter limit) → no pull-in of content from beyond the edge. | spec of `backdrop-filter`; evidence E-10 |
| 6 | **No Fresnel, no shape-aware highlight.** Rim = uniform inset box-shadow; specular = pointer-following radial gradient. | `.lg-glass::after` |
| 7 | **Fragile.** A blended sibling pseudo-element (`mix-blend-mode`) silently disables the filter. Chromium only. | Stage 4 finding #1 in `validation/REPORT.md` |
| 8 | **Weak effect.** In the demo tab bar only 2209 / 55104 px (4%) changed when displacement was switched off. | `validation/results.json` |

Strength worth keeping: backdrop-filter samples the **live DOM**, so it stays in sync with scrolling and arbitrary content. WebGL cannot read DOM pixels.

## Consequence for v2
- New WebGL2 engine for surfaces over a **drawable backdrop** (canvas, image, video). Real per-pixel sampling, SDF normals, IOR/thickness, Fresnel. 
- v1 SVG path stays as the renderer for **DOM backdrops** (text lists etc.) and as the rollback.
- Blur-only path stays as the fallback when neither is available.
