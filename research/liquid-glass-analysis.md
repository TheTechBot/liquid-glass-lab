# Liquid Glass — Technical Analysis

Scope: what iOS 26 Liquid Glass does (per Apple), and how each property maps to (a) real Apple API on native and (b) our approximation on web / React Native. Evidence IDs refer to `evidence-log.md`.

Legend: **APPLE** = documented Apple behaviour/API. **APPROX** = our own approximation; not Apple's renderer. **N/A** = cannot be reproduced on that platform.

---

## 1. Role in the interface (most important rule)

| Rule | Source |
|---|---|
| Glass = functional layer for controls + navigation, floating above content | E-01, E-06 |
| Not in the content layer (cards, lists, backgrounds). Exception: slider/toggle knob while active | E-06 |
| Use sparingly; limit to most important functional elements | E-01, E-05, E-06 |
| Never glass on glass. Things on top of glass use fills / vibrancy | E-07 |
| Regular and clear never mixed in one surface group | E-07 |

Consequence for our system: components carry a **layer** classification. Only `navigation` and `control` layers may use glass. Content-layer surfaces (cards, list rows) use the *standard material* tier (blur, no lensing, no specular rim) — matches HIG split between Liquid Glass and standard materials (E-06).

Note: the user's brief lists "cards" among demo components. Our demo shows cards in the content layer with the standard material, and one *floating* card-like panel (a control surface) with glass, to demonstrate the distinction rather than violate it.

## 2. Optical properties

### 2.1 Transparency + background sampling
- APPLE: glass blurs content behind it and reflects colour/light of surrounding content (E-05). Regular adjusts luminosity for legibility (E-06).
- APPROX web: `backdrop-filter: blur() saturate() brightness()` + semi-transparent fill. Sampling is limited to the element's own box (E-10) — Apple's lens visibly pulls content from outside the edge; we can't.
- APPROX RN: iOS 26 → real native glass via `expo-glass-effect` (E-09). Android/older iOS → `expo-blur` BlurView or translucent fill.

### 2.2 Lensing / refraction (signature property)
- APPLE: "bends, shapes, and concentrates light" — lensing concentrated at edges (E-07).
- APPROX web tier 2: SVG `feDisplacementMap` driven by a generated edge-normal map, applied via `backdrop-filter: url(#id)`. **Chromium only** (E-10). Other engines fall back to tier 1 (blur only). Feature-detect, do not UA-sniff.
- APPROX web tier 3 (optional): WebGL shader refracting a captured/known background. Only viable when the app owns the background (e.g. a hero image); cannot sample arbitrary DOM. Not enabled by default.
- N/A: dynamic per-frame lens of arbitrary DOM in Safari/Firefox.

### 2.3 Highlights / specular / reflections
- APPLE: highlights respond to geometry; light travels on interaction; sometimes device motion (E-07).
- APPROX web: inset box-shadows for rim light + a `radial-gradient` specular layer whose position follows pointer (CSS vars `--lg-px`, `--lg-py`). Device motion not used by default (permission prompt on iOS Safari, battery).

### 2.4 Shadows
- APPLE: adaptive — stronger over text, weaker over light solid backgrounds (E-07).
- APPROX: fixed layered shadow per elevation token. Optional `data-lg-adapt` samples average backdrop luminance (from an app-provided background colour/image) to pick `shadow-strong` or `shadow-soft`. True per-pixel adaptation is N/A.

### 2.5 Tint
- APPLE: `Glass.tint(_:)` (E-02). Tones mapped to content brightness; use only for primary actions (E-07).
- APPROX: `color-mix()` of tint into fill at 2 levels (rest / pressed); text colour chosen for ≥4.5:1 against the tint at full opacity (worst case).

### 2.6 Light/dark adaptivity
- APPLE: each layer adapts to what's behind it; can flip light/dark independently (E-07).
- APPROX: follows `prefers-color-scheme` + optional `data-lg-scheme` override per surface (e.g. glass over a dark photo inside a light app). No automatic per-pixel flip.

### 2.7 Thickness by size
- APPLE: larger glass (menus) behaves as thicker material — deeper shadow, stronger lensing, softer scatter (E-07).
- APPROX: size tiers `sm/md/lg` map to blur radius, displacement scale and shadow depth tokens.

## 3. Geometry
- APPLE: capsule default (E-03); rounded rect for large components (E-05); concentric corners with container/hardware (E-01: `ConcentricRectangle`, `rect(corners:isUniform:)`).
- APPROX: radius tokens + concentric rule `inner = max(outer − padding, minRadius)`. Web helper `--lg-radius-inner: calc(var(--lg-radius-outer) - var(--lg-pad))`.
- Shapes chosen for touch: clearly defined shapes relating to finger geometry (WWDC 219 excerpt in search results). Min hit target 44×44 pt (Apple HIG long-standing guidance; not re-fetched this pass — see unknowns).

## 4. Motion

| Behaviour | Apple | Our approximation |
|---|---|---|
| Materialize in/out | modulate lensing, not just fade (E-07); `.materialize` transition (E-05) | animate blur 0→N, displacement scale 0→N, scale .96→1, opacity together |
| Morph between shapes | `GlassEffectContainer` + `glassEffectID` + `.matchedGeometry` (E-04, E-05) | FLIP animation of a single shared "pill" element (segmented control, tab indicator, button→menu) |
| Gel-like flex on press | `.interactive()` (E-02, E-05) | press: scale .97 + slight stretch in drag direction, spring easing; release overshoot |
| Knob lifts into glass while dragging | slider/toggle (E-01, E-06) | knob gains glass class only during `pointerdown`→`pointerup` |
| Tab bar minimise on scroll | `.tabBarMinimizeBehavior(.onScrollDown)` (E-01) | scroll-direction listener collapses floating nav |
| Scroll edge effect | `scrollEdgeEffectStyle`, soft vs hard (E-01, E-07) | gradient mask + blur strip under floating bars; `hard` variant = uniform |

Spring constants (stiffness/damping) are **not published** by Apple. Our values are tuned by eye; label them as such (see unknowns).

## 5. Interactive states
rest · hover (pointer devices) · pressed · focused (visible ring, keyboard) · selected · disabled · dragging. Apple documents interactive reaction and focus-driven glass on tvOS (E-01). Exact visual deltas per state are not published → our tokens.

## 6. Accessibility mapping

| Apple setting (E-07, E-01) | Web signal | RN signal | Our behaviour |
|---|---|---|---|
| Reduce Transparency → frostier | `prefers-reduced-transparency: reduce` (Chromium 118+; not universal) + manual toggle | `AccessibilityInfo.isReduceTransparencyEnabled()` | fill opacity ≥ 0.85, displacement off |
| Increase Contrast → black/white + border | `prefers-contrast: more` | `AccessibilityInfo.isHighTextContrastEnabled` (Android) / iOS none in core RN (unknown) | solid fill, 1.5px contrasting border, no displacement |
| Reduce Motion → no elastic | `prefers-reduced-motion: reduce` | `AccessibilityInfo.isReduceMotionEnabled()` | no spring, no stretch, crossfade ≤150ms |
| VoiceOver labels on icons (E-01) | `aria-label` mandatory on icon buttons | `accessibilityLabel` | lint rule in skill |

Text contrast target: WCAG 2.x 4.5:1 normal text, 3:1 large text/UI glyphs — measured against **worst-case** backdrop (white and black) because the backdrop is dynamic.

## 7. Performance
- APPLE: group effects in a container; limit on-screen effects (E-04, E-05).
- Web: each `backdrop-filter` element forces offscreen compositing; SVG-filter backdrops are more expensive. Budget: ≤ 6 glass surfaces visible; ≤ 2 with refraction. Disable refraction while scrolling a surface's backdrop is optional (`data-lg-refract="static"`).
- RN: `GlassContainer` for groups; avoid animating opacity of `GlassView` (E-09).

## 8. Platform matrix

| Capability | SwiftUI (iOS 26) | React Native | Web (Chromium) | Web (Safari/Firefox) |
|---|---|---|---|---|
| Real Liquid Glass | **Yes** `glassEffect` | **Yes** on iOS 26 via expo-glass-effect | No | No |
| Lensing | Yes (system) | Yes iOS 26 | Approx (SVG) | No (blur only) |
| Morphing | Yes container+ID | Partial (GlassContainer merge; no ID morph in expo-glass-effect docs reviewed) | Approx FLIP | Approx FLIP |
| A11y adaptation | Automatic | Manual checks | Media queries | Media queries (partial) |
| Fallback | `#available` → `.ultraThinMaterial` | BlurView / fill | n/a | blur + fill |
