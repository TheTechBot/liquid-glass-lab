# Liquid Glass Lab — Design System Specification v0.2

Liquid Glass-*inspired*. Native SwiftUI uses Apple's real API. Web and Android are approximations. Numeric tokens are our estimates (see `research/unknowns-and-limitations.md` §A). Evidence IDs → `research/evidence-log.md`.

## 1. Layer model (mandatory)

Every surface gets exactly one layer.

| Layer | Allowed material | Examples |
|---|---|---|
| `content` | none, or `standard` | page background, cards, list rows, article body, images |
| `control` | `regular`, `clear` (conditions §2.2), `standard` | floating buttons, segmented control, slider knob *while dragging*, toggles, floating action panels |
| `navigation` | `regular` (default), `clear` over media | tab bar, toolbar, top bar, sidebar, search field in bar |
| `overlay` | `regular` (thick tier) | menus, popovers, sheets, alerts |

Rules:
- R1 Glass only on `control`, `navigation`, `overlay` (E-06).
- R2 No glass on glass. Content placed on a glass surface uses vibrant text/fills, not another glass surface (E-07). A menu opening *from* a glass button replaces it (morph) — it is not stacked.
- R3 Never mix `regular` and `clear` in one group/container (E-07).
- R4 Budget: ≤ 6 glass surfaces visible, ≤ 2 refracting (tokens `budget`).
- R5 Tint only primary action(s) — max 1 tinted control per group (E-07).
- R6 Remove custom backgrounds from system bars on native; let the system draw glass (E-01).

## 2. Materials

### 2.1 Regular (default)
Blur `14px` · saturate `1.8` · brightness `1.04` · fill light `rgba(255,255,255,.32)` / dark `rgba(40,40,48,.38)` · 1px inner rim highlight + 1px outer dark hairline · elevation by size.
Use for anything with text, menus, sidebars, alerts (E-06).

### 2.2 Clear
Blur `4px` · fill ≈ 6–8% white. Allowed only when all three hold (E-07):
1. surface sits over media-rich content (photo/video/map);
2. a dimming layer is acceptable → apply `rgba(0,0,0,.35)` behind it over bright content (E-06 — the only Apple-published number we use);
3. foreground content is bold and bright (white, semibold+, glyph ≥ 17px).
Small clear surfaces may use *localized* dimming (radial, behind the element only) (E-07).

### 2.3 Standard (content-layer)
Blur `24px`, fill 62%, no rim, no refraction, no specular. Equivalent of SwiftUI `Material` tiers on native.

### 2.4 Thickness by size (E-07)
| Size | Applies to | Blur | Refraction scale | Shadow |
|---|---|---|---|---|
| `sm` | ≤ 44px controls | 10px | 18 | `sm` |
| `md` | bars, segmented, buttons with label | 14px | 32 | `md` |
| `lg` | menus, panels, sheets | 22px | 48 | `lg` |

### 2.5 Accessibility overrides (highest priority, E-07)
| Condition | Effect |
|---|---|
| Reduce Transparency | fill → `reducedTransparency` (94%), blur kept, refraction **off** |
| Increase Contrast | fill solid (white/black), text black/white, 1.5px border, refraction + specular **off** |
| Reduce Motion | springs → 140ms ease-out crossfade; no stretch; no pointer-tracked specular movement |
| Forced colors (Windows High Contrast) | `forced-colors: active` → system colours, border `CanvasText`, no backdrop |

## 3. Optical layers (web render stack, bottom → top)

1. `::before` **refraction + blur**: `backdrop-filter: url(#lg-refract-<size>) blur() saturate() brightness()` (Chromium), else `blur() saturate() brightness()`.
2. element background **fill** (tint mixes here).
3. `::after` **specular**: radial-gradient at `(--lg-px, --lg-py)`, `mix-blend-mode: soft-light`, + inset rim shadows.
4. **content** (z-index 1).

Shadow on the element itself (`box-shadow`).

## 4. Shape rules
- Default control shape: capsule (E-03).
- Large components: rounded rect `radius-lg` (26) / `radius-xl` (34) (E-05).
- Concentric: `inner = max(outer − inset, radius.minInner)` (E-01 ConcentricRectangle concept). Example: panel radius 34, padding 8 → inner buttons 26.
- Hit target ≥ 44×44 even when visual is smaller (pad with transparent area).
- No sharp corners on glass. No glass on irregular/complex paths (web refraction map assumes rounded rect).

## 5. Interaction states

| State | Visual delta (approx) | Motion |
|---|---|---|
| rest | tokens | — |
| hover (fine pointer) | specular follows pointer; fill +4% | none |
| pressed | fill → `fillPressed`; scale `0.97`; specular intensity ×1.6; refraction scale ×1.25 | spring in, spring out with overshoot |
| dragging (slider knob, sheet) | knob becomes glass; stretch ≤ 6% along drag axis | spring |
| selected (segment/tab) | shared glass pill under selected item | FLIP morph `dur-base` spring |
| focused (keyboard) | 2px outline `tint-accent` + 2px offset; never removed | none |
| disabled | content opacity .4, no specular, no pointer events | none |

Glass on *content-layer* controls (slider, toggle) appears only during interaction (E-01, E-06).

## 6. Motion
- Spring: CSS `cubic-bezier(0.34, 1.36, 0.64, 1)`; JS spring stiffness 380 / damping 30 (estimate).
- Durations: fast 160, base 280, slow 440 ms.
- **Materialize** (enter): opacity 0→1, scale .94→1, blur 0→N, refraction 0→N, all over `dur-base` — not opacity alone (E-05, E-07).
- **Dematerialize** (exit): reverse, `dur-fast`.
- **Morph**: one physical element moves between positions/sizes (FLIP). Native: `GlassEffectContainer` + `glassEffectID` (E-04/E-05).
- Button → menu: menu grows from button rect (transform-origin = button center), button hides at same frame.
- Floating tab bar minimise on scroll-down, expand on scroll-up (E-01 `tabBarMinimizeBehavior`).
- Reduced motion: replace all with 140ms opacity.

## 7. Scroll edge effect
Floating bars over scrolling content get an edge strip (height = bar + 16px): `mask-image: linear-gradient` with `backdrop-filter: blur(6px)` fading to 0. `hard` variant: uniform blur across bar + pinned accessory (E-07). Native: system default / `scrollEdgeEffectStyle` (E-01).

## 8. Colour + text
- Text on regular glass: `--lg-regular-text` (near-black / near-white). Secondary only ≥ 15px.
- Contrast target: 4.5:1 body, 3:1 glyphs/large text, against **both** white and black worst-case backdrops through the fill (validation script checks fill-over-white and fill-over-black composite).
- Tint text: `accentText` white on `accent` at ≥ 85% coverage.
- Icon-only buttons require accessible name.

## 9. Components

| Component | Layer | Material | Notes |
|---|---|---|---|
| GlassButton | control | regular (tinted if primary) | capsule; `.interactive` press flex |
| GlassIconButton | control | regular | circle 44; `aria-label` required |
| FloatingTabBar | navigation | regular md | morph pill indicator; minimise on scroll; search tab separate at trailing end (E-01) |
| Toolbar / TopBar | navigation | regular md | group related actions; no mixed text+icon in one group (E-01) |
| SegmentedControl | control | regular md | morph pill selection |
| GlassMenu | overlay | regular lg | grows from trigger; trigger dematerializes |
| FloatingPanel / Sheet | overlay | regular lg | inset from edges; opaque-er when expanded (E-01) |
| GlassSlider | content→control | knob glass only while dragging | track is standard |
| GlassToggle | content→control | knob glass only while pressed | |
| MediaControls | control | **clear** + dimming | only over photo/video |
| ContentCard | content | standard (no glass) | demo shows the rule |

## 10. Platform API mapping

| Concept | SwiftUI (APPLE) | React Native | Web (APPROX) |
|---|---|---|---|
| Material | `.glassEffect(.regular, in:)` | `GlassView glassEffectStyle="regular"` (iOS 26) | `.lg-glass` |
| Clear | `Glass.clear` | `glassEffectStyle="clear"` | `.lg-glass--clear` |
| Tint | `.tint(_:)` | `tintColor` | `--lg-tint` |
| Interactive | `.interactive()` | `isInteractive` | `data-lg-interactive` |
| Group / merge | `GlassEffectContainer(spacing:)` | `GlassContainer spacing` | `.lg-group` (shared fill, FLIP) |
| Morph | `glassEffectID(_:in:)` | not confirmed | FLIP `LG.morph()` |
| Union | `glassEffectUnion(id:namespace:)` | n/a | `.lg-group--union` |
| Button style | `.buttonStyle(.glass / .glassProminent)` | wrapper | `.lg-btn` / `.lg-btn--prominent` |
| Fallback | `#available(iOS 26, *)` else `.ultraThinMaterial` | `expo-blur` / fill | blur-only tier |

## 11. Optical refraction engine (v2, WebGL2) — added 2026-11-17

Physically inspired UI material model. Not Apple's shader; no claim of equivalence.

### 11.1 Renderer selection
| Backdrop under the glass | Renderer | Notes |
|---|---|---|
| `<canvas>`, `<img>`, `<video>` the app controls | **v2 WebGL2** (`liquid-glass-refraction.js`) | real per-pixel refraction of those pixels |
| arbitrary DOM (text, lists) | v1 SVG `backdrop-filter` (Chromium) → blur | WebGL cannot read DOM pixels |
| WebGL2 missing, context lost | v1 / blur automatically (`data-lg-renderer="fallback"`) | |
| Reduce Transparency, Increase Contrast, forced colours | v1 accessibility styles (v2 switches itself off) | |
Rollback: `?renderer=svg` (or `blur`) in the URL, `LGRefraction.disableAll()`, or restore `backup/2026-11-17-v1-baseline/`.

### 11.2 Optical model (per pixel)
1. `s` = signed distance to the shape (analytic: rect, rounded rect, circle, ellipse, capsule; CPU exact EDT texture for SVG path / polygon).
2. Bevel width `W = curvature × min(halfW, halfH)`; `t = clamp(depth / W)`; height `H = thickness · √(1 − (1 − t)²)` (convex, circular profile; slope clamped at the rim).
3. Normal from a **smoothed** distance field (corner radius inflated to W on boxes; blurred EDT on paths) → continuous at corners. Depth from the **true** field → height is 0 exactly at the visible edge.
4. Snell refraction `refract(view, N, 1/ior)`; offset = `R.xy / |R.z| × (H + 0.35·thickness) × refraction`, clamped to `maxOffset × min(halfW, halfH)` (no runaway magnification). TIR → reflect.
5. Backdrop sampled at the offset UV; optional disk blur **after** bending; optional dispersion (R/G/B split).
6. Schlick Fresnel with `F0 = ((ior−1)/(ior+1))²`, environment = mirrored softened backdrop; internal reflection near the rim; light-facing rim + specular; tint; drop shadow; 1-device-pixel AA from the SDF.
No noise/turbulence anywhere.

### 11.2b House look: `signature` preset (user's sweet spot v2, 2026-11-18) — the default for every shape
```json
{ "profile": "rim", "ior": 1.51, "thickness": 31, "curvature": 0.25, "refraction": 1, "edge": 0.81, "fresnel": 0.92,
  "blur": 2.5, "tint": "rgba(255,255,255,0.11)", "reflection": 0.41, "dispersion": 0.015, "shadow": 0.25, "lightAngle": 50, "maxOffset": 0.9 }
```
`profile: 'rim'` → offset = −n̂ · (1 − t)² · thickness · (ior − 1) · 2 · refraction (inward along the normal, quadratic falloff, flat centre); ≈ 32 px pull at the edge in a narrow rim band (25% of the half-size), clamped to 0.9 × the shorter half-size. Left/right mirror-symmetric (validated).
Presets keep this bend and only change legibility: `control` (tint white 16%), `media` (tint black 28%), `overlay` (blur 8, tint white 55%), `overlay-dark`.
Do not change the signature numbers unless the user asks. `profile: 'physical'` remains available.

### 11.3 Parameters (tokens `refractionV2.*`)
`ior` 1–2.4 · `thickness` px · `curvature` 0.05–1 · `refraction` 0–2 · `edge` 0–1.5 · `fresnel` 0–1 · `blur` px · `tint` rgba · `reflection` 0–1 · `dispersion` 0–0.2 · `shadow` 0–1 · `lightAngle` deg · `maxOffset` 0–1.
Presets: `signature` (default), `control`, `media`, `overlay`, `overlay-dark`. Labels/body text on glass → `control` or `overlay`.

### 11.4 Shapes
`rect`, `roundedRect{radius}`, `circle`, `ellipse`, `capsule`, `path{d, viewBox}`, `polygon{points 0..1}`. Concave polygons supported.

### 11.5 Budget and performance
Same surface budget as §1 (≤ 6 glass, ≤ 2 refracting visible). One shared WebGL2 context; each surface copies into its own 2D canvas. Animated backdrops: redraw, then `LGRefraction.renderNow()` in the same frame (keeps glass in sync). Measured cost on the user's GPU is still open (cloud tests ran on a software rasterizer).
