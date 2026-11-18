# Changelog

## 0.3.0 — 2026-11-18
- SwiftUI-shaped web API (`liquid-glass-effect.js`, global `LGGlass`): `Glass.regular/.clear/.identity`, `.tint()`, `.interactive()` (press scale, touch light, shimmer, pointer light), `glassEffect(el, glass, { in })`.
- `glassEffectContainer(el, { spacing })`: one merged WebGL surface per container (analytic smooth union, new `union` engine shape); gap ≤ spacing fuses.
- `glassEffectID` morphing via `container.withAnimation()`: new glass grows out of its neighbour, removed glass is absorbed, same-id glass moves.
- Declarative `data-glass*` attributes + `autoGlass()`; React `GlassEffect`, `GlassEffectContainer`, `useGlassAnimation` (type-checked only).
- Demo `liquid-glass-effect-demo.html`; 13 new tests (`npm run test:glass`).
- Skill rewritten as an API reference (Apple API ↔ web ↔ React side by side) + `references/reference.md`.

## 0.2.0 — 2026-11-18
- WebGL2 SDF refraction engine (`liquid-glass-refraction.js`): real backdrop sampling, rim and physical profiles, Fresnel, internal reflection, dispersion, shadow, 1-px AA.
- Shapes: rect, rounded rect, circle, ellipse, capsule, SVG path, polygon (concave supported).
- Signature preset + `control`, `media`, `overlay`, `overlay-dark` presets.
- Declarative `data-lg-glass` + `LGRefraction.autoAttach()`; starter template.
- Refraction Test Lab (8 shapes × 6 backgrounds, all parameters, debug views, old vs new, copy settings).
- React `refraction` prop + `useOpticalRefraction`; types.
- Test suite: 24 refraction checks incl. mirror symmetry and frame sync.

## 0.1.0 — 2026-11-17
- Design system spec + tokens, web/React/SwiftUI/React Native implementations, v1 SVG `backdrop-filter` refraction, web demo, Claude skill, validation suites.
