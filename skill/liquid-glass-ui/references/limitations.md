# Unknowns and Limitations

## A. What Apple does not publish (we must approximate)
1. Renderer internals: lens shape function, refraction index, blur kernel, luminosity curve. Apple renders Liquid Glass in its system compositor; no public shader. **We do not and cannot access it.**
2. Numeric values: blur radius, fill opacity, shadow parameters, highlight intensity per variant. All numeric tokens in our design system are **our estimates**, not Apple values. The single published number we use is the **35% dark dimming layer** for clear glass over bright content (E-06).
3. Spring/animation constants for morphing, press flex and materialize.
4. Tint tone-mapping algorithm (E-07 describes behaviour only).
5. Adaptive shadow algorithm (E-07 describes behaviour only).
6. Exact light-source positions and device-motion response.
7. How "preferred look for Liquid Glass" user setting (E-01) maps to rendering. Not exposed as a web or RN signal we know of.

## B. Platform limits
### Web
- `backdrop-filter: url(#svg)` refraction works in Chromium only (E-10). Safari/Firefox ignore it → blur tier.
- `backdrop-filter` samples only inside the element box; no refraction from outside the edge (E-10).
- `prefers-reduced-transparency` not supported everywhere; provide manual toggle.
- WebGL refraction needs a known background texture; arbitrary DOM cannot be sampled cheaply.
- Many stacked backdrop-filters hurt frame rate on low-end GPUs (low-end GPUs are common — test there).

### React Native
- Real glass only iOS 26+ (expo-glass-effect, E-09). Android has no equivalent system material; fallback is approximation.
- `GlassView` opacity < 1 may not render (E-09 known issue).
- Morph-by-ID like SwiftUI `glassEffectID` not confirmed in expo-glass-effect docs reviewed. `@expo/ui` SwiftUI host may offer it — **not verified**.
- Some iOS 26 betas lack the API → must call `isGlassEffectAPIAvailable()`.

### SwiftUI
- Requires Xcode 26 SDK + iOS 26 runtime for `glassEffect`. Back-deploy branch uses `.ultraThinMaterial` — not Liquid Glass.
- **Not compiled or run in this project** (Windows host, no Mac). Source is written against documented signatures only (E-02…E-05).

## C. Validation limits in this project
- No access to an iOS 26 device or simulator.
- Apple reference images could not be downloaded (network allowlist). Visual comparison = checklist against documented behaviour, not pixel diff.
- Stage 4 browser tests run in headless Chrome in Claude's cloud workspace, not on the user's Windows machine. REA's browser tools run on a real machine and could not reach the cloud workspace's files.
- Folder access to `<home>` was denied; project could not be written to `<repo>` directly.

## D. Open follow-ups
- [ ] Read WWDC25 session 356 and 323 ("Build a SwiftUI app with the new design") transcripts for extra API details.
- [ ] Re-check HIG Buttons / Layout for current min target size wording.
- [ ] Compile SwiftUI package on Mac (see `implementations/swiftui/VALIDATION.md`).
- [ ] Run web demo on a real Windows machine (Chrome + Edge + Firefox) and capture with REA `capture_web_screenshot`.
- [ ] Side-by-side with real iOS 26 screenshots taken by the user on device.
- [ ] Verify `@expo/ui` glass morph APIs.
