---
name: liquid-glass-ui
description: "API reference + build kit: Liquid Glass (iOS 26 style) for SwiftUI, web, React, React Native. Use for glassEffect, GlassEffectContainer, morphing, glass variants, navigation glass, or any 'make it Liquid Glass' UI."
---

# Liquid Glass UI Reference

API reference for Liquid Glass: glass effects, containers, morphing transitions, navigation surfaces and accessibility behaviour. **SwiftUI** uses Apple's real API. **Web / React** use the same names on our WebGL2 refraction engine with the user's signature bend. It is an approximation, not Apple's renderer, so say that whenever you ship it.

## When to Use

- Building or restyling a UI with glass: `glassEffect`, `GlassEffectContainer`, `glassEffectID` morphing
- Navigation surfaces made of glass: tab bars, toolbars, sheets, floating action buttons
- Choosing a variant (`.regular` / `.clear` / `.identity`), adding a tint, or making glass interactive
- Checking how glass adapts to accessibility settings
- Porting a SwiftUI glass design to web/React, or back

## Apple's Stated Design Principles

Apple describes Liquid Glass with three principles (reference, not a mandate):

| Principle | Description |
|-----------|-------------|
| **Hierarchy** | Controls float above content. Glass frames content rather than obscuring it. |
| **Harmony** | Software design aligns with hardware: concentric corners, fluid gestures. |
| **Consistency** | Adapts across iPhone, iPad and Mac: same identity, contextual expression. |

Functional constraint: glass belongs to the navigation/control layer. Never put it on content (cards, list rows, page backgrounds, article text). Glass cannot sample glass, so never stack or overlap it. Use a container instead.

## Liquid Glass Core API

The same calls on every platform:

| SwiftUI (real Apple glass) | Web — `liquid-glass-effect.js` | React — `GlassEffect.tsx` |
|---|---|---|
| `.glassEffect()` | `glassEffect(el)` | `<GlassEffect>` |
| `.glassEffect(.clear, in: .circle)` | `glassEffect(el, Glass.clear, { in: 'circle' })` | `<GlassEffect glass={Glass.clear} shape="circle">` |
| `in: RoundedRectangle(cornerRadius: 12)` | `{ in: { cornerRadius: 12 } }` or `{ in: 12 }` | `shape={12}` |
| `.regular.tint(.blue).interactive()` | `Glass.regular.tint('#0a64e0').interactive()` | same `glass={…}` |
| `isOn ? .regular : .identity` | `handle.update(isOn ? Glass.regular : Glass.identity)` | `glass={isOn ? Glass.regular : Glass.identity}` |
| `GlassEffectContainer(spacing: 30)` | `glassEffectContainer(el, { spacing: 30 })` | `<GlassEffectContainer spacing={30}>` |
| `.glassEffectID("crop", in: ns)` | `data-glass-id="crop"` | `glassID="crop"` |
| `withAnimation(.bouncy) { … }` | `container.withAnimation(() => { …change DOM… })` | `useGlassAnimation(ref)(() => setOpen(o => !o))` |

### Basic Glass Effect

```swift
Text("Action").padding().glassEffect()                       // .regular, capsule
Button("Confirm") { }.padding()
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 12), isEnabled: true)
```
```html
<!-- web, declarative -->
<canvas id="scene" data-lg-backdrop-source></canvas>        <!-- glass needs a drawable scene behind it -->
<button data-glass>Action</button>                            <!-- .regular, capsule -->
<button data-glass data-glass-shape="12">Confirm</button>     <!-- RoundedRectangle(12) -->
<script src="liquid-glass.iife.js"></script><script src="liquid-glass-refraction.iife.js"></script>
<script src="liquid-glass-effect.iife.js"></script>
<script>LG.init(); LGGlass.autoGlass(document);</script>
```
```js
// web, programmatic
import { Glass, glassEffect } from './liquid-glass-effect.js';
const h = glassEffect(button, Glass.regular, { in: { cornerRadius: 12 } });   // → h.update(glass), h.destroy()
```

### Glass Variants

| Variant | Use case | Web material (signature bend kept) |
|---------|----------|-----|
| `.regular` | Toolbars, nav bars, tab bars, standard controls | blur 2.5, white tint 16% |
| `.clear` | Floating controls over media (photos, maps, video) | blur 0.6, near-clear. Use bold white glyphs with a shadow |
| `.identity` | Conditional disable: `isActive ? .regular : .identity` | removes the glass, keeps the element |

Declarative: `data-glass="regular|clear|identity"`.

### Glass Modifiers

```swift
.glassEffect(.regular.tint(.accentColor))          // semantic tint: primary action only
.glassEffect(.regular.interactive())               // scaling, shimmer, touch illumination
.glassEffect(.regular.tint(.blue).interactive())
```
Web: `Glass.regular.tint('#0a64e0').interactive()`, or `data-glass-tint="#0a64e0" data-glass-interactive`.
Web `.interactive()` gives you:
- a spring press scale to 1.1
- a radial light under the finger
- a shimmer sweep
- an engine light that follows the pointer

Reduce Motion switches the scale and shimmer off.

### Custom Shapes

```swift
.glassEffect(.regular, in: .capsule)       // web: 'capsule' (default)
.glassEffect(.regular, in: .circle)        // web: 'circle'
.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 16))   // web: { cornerRadius: 16 } / data-glass-shape="16"
.glassEffect(.regular, in: .rect(cornerRadius: .containerConcentric))
// web has no containerConcentric: use inner radius = outer radius − padding
```
Web also accepts `'rect'`, `'ellipse'`, `'auto'` (reads `border-radius`) and raw engine shapes (`path`, `polygon`).

## GlassEffectContainer & Morphing

### Container Setup

Glass cannot sample other glass. Put multiple glass elements in a container. The container draws them as **one** surface, and shapes closer than `spacing` blend into each other like droplets.

```swift
GlassEffectContainer(spacing: 30) {
    HStack(spacing: 20) {
        ForEach(actions) { action in
            Button(action.title, systemImage: action.icon) { }
                .frame(width: 44, height: 44)
                .glassEffect(.regular.interactive())
        }
    }
}
```
```html
<div class="row" data-glass-container="30">
  <button data-glass data-glass-interactive data-glass-shape="circle" aria-label="Edit">…</button>
  <button data-glass data-glass-interactive data-glass-shape="circle" aria-label="Share">…</button>
</div>
```
```tsx
<GlassEffectContainer spacing={30} className="row">
  {actions.map(a => <GlassEffect key={a.id} as="button" glass={Glass.regular.interactive()} shape="circle" aria-label={a.title}>{a.icon}</GlassEffect>)}
</GlassEffectContainer>
```
How the web version works: it uses an analytic smooth union of the children's shapes with k = 2·spacing, so items whose gap is ≤ `spacing` fuse into one shape. It is rendered by a single WebGL surface behind the children, which means the children never get their own glass. A tinted child keeps its colour as an inner fill.

### Morphing Transitions

```swift
struct ExpandableActions: View {
    @State private var isExpanded = false
    @Namespace private var namespace
    var body: some View {
        GlassEffectContainer(spacing: 30) {
            VStack(spacing: 30) {
                if isExpanded { ActionButton(icon: "rotate.right").glassEffectID("rotate", in: namespace) }
                HStack(spacing: 30) {
                    if isExpanded { ActionButton(icon: "slider.horizontal.3").glassEffectID("adjust", in: namespace) }
                    Button { withAnimation(.bouncy) { isExpanded.toggle() } } label: {
                        Image(systemName: isExpanded ? "xmark" : "plus").frame(width: 56, height: 56)
                    }
                    .glassEffect(.regular.tint(.accentColor).interactive())
                    .glassEffectID("toggle", in: namespace)
                    if isExpanded { ActionButton(icon: "crop").glassEffectID("crop", in: namespace) }
                }
                if isExpanded { ActionButton(icon: "wand.and.stars").glassEffectID("enhance", in: namespace) }
            }
        }
    }
}
```
```js
// web: same behaviour — new glass grows out of its nearest neighbour, removed glass is absorbed into it,
// glass with the same data-glass-id moves between layouts. Bouncy spring ≈ cubic-bezier(.34,1.56,.64,1), 500 ms.
const ctr = glassEffectContainer(box, { spacing: 30 });   // or box.__lgxContainer after autoGlass()
toggle.onclick = () => ctr.withAnimation(() => {
  open = !open;
  if (open) box.append(...['rotate', 'adjust', 'crop', 'enhance'].map(makeActionButton)); // each has data-glass + data-glass-id
  else box.querySelectorAll('[data-glass-id]:not([data-glass-id="toggle"])').forEach(b => b.remove());
});
```
```tsx
// React
const ref = useRef<HTMLDivElement>(null); const animate = useGlassAnimation(ref);
<GlassEffectContainer ref={ref} spacing={30}>
  {open && <GlassEffect as="button" glassID="rotate" shape="circle" glass={Glass.regular.interactive()} aria-label="Rotate">…</GlassEffect>}
  <GlassEffect as="button" glassID="toggle" shape="circle" glass={Glass.regular.tint('#0a64e0').interactive()}
    aria-expanded={open} onClick={() => animate(() => setOpen(o => !o))}>…</GlassEffect>
</GlassEffectContainer>
```
A working copy of this exact example (and the toolbar and variants below) is in `assets/web/liquid-glass-effect-demo.html`. Open it to show the user.

## Navigation Patterns

### Tab Bar (Floating)

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Search", systemImage: "magnifyingglass") { SearchView() }
    Tab("Profile", systemImage: "person") { ProfileView() }
}
// Tab bar floats, reacts to the background, collapses on scroll
```
Web: `<nav role="tablist" data-glass>` with tabs inside, floating at the bottom centre over the scene. React: `FloatingTabBar` (in `LiquidGlass.tsx`) collapses on scroll. Selected tab = a light inner pill, not more glass.

### Toolbar with Grouping

```swift
.toolbar {
    ToolbarItemGroup(placement: .topBarTrailing) {
        Button("Edit", systemImage: "pencil") { }
        Button("Share", systemImage: "square.and.arrow.up") { }
    }
    ToolbarSpacer(.flexible, placement: .topBarTrailing)
    ToolbarItem(placement: .topBarTrailing) {
        Button("Done", systemImage: "checkmark") { }.tint(.accentColor)
    }
}
```
Web equivalent: a group is one container whose spacing is larger than the gap, so the items fuse. A spacer is simply a separate container.
```html
<div class="toolbar" data-glass-container="12">          <!-- ToolbarItemGroup: 10 px gap < 12 → fused -->
  <button data-glass data-glass-interactive data-glass-shape="circle" aria-label="Edit">…</button>
  <button data-glass data-glass-interactive data-glass-shape="circle" aria-label="Share">…</button>
</div>
<div data-glass-container="0">                           <!-- after the spacer: its own glass -->
  <button data-glass data-glass-tint="#0a64e0" data-glass-interactive data-glass-shape="circle" aria-label="Done">…</button>
</div>
```

### Sheets with Morphing

```swift
Button("Settings", systemImage: "gear") { showSettings = true }
    .matchedTransitionSource(id: "settings", in: namespace)
.sheet(isPresented: $showSettings) {
    SettingsView()
        .navigationTransition(.zoom(sourceID: "settings", in: namespace))
        .presentationDetents([.medium, .large])
}
```
Web: React `FloatingPanel(open, hideWhileOpen=[tabBarRef])` materializes the sheet and hides the tab bar while it is open, because a sheet must never overlap other glass. Plain web: `LGRefraction.attach(panel, { backdrop, preset: 'overlay', shape: { type: 'roundedRect', radius: 30 } })`. The `overlay` preset adds frosting so body text stays legible. There is no zoom-from-source transition yet. If you want one, animate it yourself with FLIP from the trigger's rect.

## SF Symbols Effects & Haptics (native only)

```swift
Image(systemName: "checkmark.circle").symbolEffect(.drawOn, value: isComplete)
Image(systemName: "heart.fill").symbolEffect(.bounce, value: isFavorite)
UIImpactFeedbackGenerator(style: .medium).impactOccurred()
UISelectionFeedbackGenerator().selectionChanged()
UINotificationFeedbackGenerator().notificationOccurred(.success)
```
Web: no SF Symbols. Use inline SVG icons with `currentColor`. For haptics, `navigator.vibrate?.(10)` works on Android only, so treat it as optional.

## Accessibility Behaviors

### Automatic Glass Adaptations

| Setting | Apple | Web (ours) |
|---|---|---|
| Reduce Transparency | more frosting | WebGL off. Every item gets the opaque v1 material (`.lg-glass`). Test: `<html data-lg-rt>` |
| Increase Contrast | stark borders | WebGL off. v1 high-contrast look with borders (`data-lg-ic`) |
| Reduce Motion | tones down animation | no morph travel, no press scale or shimmer, 140 ms fades (`data-lg-rm`) |
| Forced colours | — | system colours |

### Manual Checks

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency
@Environment(\.accessibilityReduceMotion) var reduceMotion
var animation: Animation? { reduceMotion ? nil : .bouncy }
```
System expectations on every platform:
- touch targets at least 44×44 pt/px
- an `aria-label` / accessibility label on every icon button
- Dynamic Type or rem text
- text contrast of 4.5:1 or better over the worst-case background

## Signature Look (web/React engine)

The bend the user tuned in the Refraction Test Lab. Every variant keeps it. Do not change it unless the user asks:
```json
{ "profile": "rim", "ior": 1.51, "thickness": 31, "curvature": 0.25, "refraction": 1, "edge": 0.81, "fresnel": 0.92,
  "blur": 2.5, "tint": "rgba(255,255,255,0.11)", "reflection": 0.41, "dispersion": 0.015, "shadow": 0.25, "lightAngle": 50, "maxOffset": 0.9 }
```
`LGRefraction.SIGNATURE`. Lower-level presets: `signature`, `control`, `media`, `overlay`, `overlay-dark`. SwiftUI and React Native use Apple's/Expo's glass, so these numbers do not apply there.

## Web Rules That Apple Handles for You

1. **A drawable scene is required.** WebGL refracts only `<canvas>`, `<img>` or `<video>` marked `data-lg-backdrop-source`. It needs fine detail so the bend shows, and it must extend past the glass. DOM text scrolling under glass is not refracted.
2. **No more than 6 glass surfaces on screen at once** (each container counts as one). Low-end GPUs are common.
3. **Animated canvas:** redraw, then call `LGRefraction.renderNow()` in the same frame. For a static redraw, call `LGRefraction.invalidate(canvas)`. `<video>` updates by itself.
4. **Preserve functionality** when restyling existing apps: change classes, wrappers and attributes only. Keep handlers, state, routes, test IDs and ARIA. Never delete user files.

## Platform Setup

- **Web:** `assets/web/`. Files: `liquid-glass.css` + `liquid-glass.iife.js` (accessible fallback, layout), `liquid-glass-refraction.iife.js` (engine), `liquid-glass-effect.iife.js` (this API). ES modules and `.d.ts` are next to them. New UI: start from `liquid-glass-effect-demo.html` or `liquid-glass-starter.html`.
- **React:** copy `assets/react/*` to `src/liquid-glass/`, import the CSS once, and use `GlassEffect`, `GlassEffectContainer` and `useGlassAnimation`. The higher-level components (`FloatingTabBar`, `GlassMenu`, `FloatingPanel`, `SegmentedControl`, `GlassSlider`, `GlassToggle`) are in `LiquidGlass.tsx`. For Next.js, add `'use client'`.
- **SwiftUI:** write Apple's API directly (above). `assets/swiftui` (LiquidGlassKit) adds an iOS 17–18 material fallback through `lgGlass` / `LGContainer`. It cannot be compiled on Windows, so never claim it builds. Give the user the Xcode 26 + simulator checklist.
- **React Native:** use `expo-glass-effect` (`GlassView`, `GlassContainer`, `glassEffectStyle: 'regular' | 'clear'`, `isInteractive`, `tintColor`). This is real glass on iOS 26 and an approximation elsewhere (`assets/react-native`). Opacity < 1 on a GlassView or its parents can hide the glass.

Asset lookup order:
1. The files next to this skill.
2. The user's project: `C:\Users\HP\Projects\LiquidGlassLab\LiquidGlassLab\skill\liquid-glass-ui\`, or a clone of https://github.com/TheTechBot/liquid-glass-lab under `skill/liquid-glass-ui/`. Use the device file tools, and request the folder if it is not connected.
3. Ask the user to attach `liquid-glass-ui-skill.zip`.

Never rewrite the engine from memory.

## Existing App (any stack)

1. **Inspect.** Detect the framework(s) (see `references/frameworks.md`). List the chrome surfaces and where the content lives. Run the existing tests and build to get a baseline.
2. **Classify** each surface as element → layer → variant → component. If more than 10 files will change, show the plan first.
3. **Scene.** Add a drawable scene layer if none exists. For surfaces over DOM content, use v1 SVG refraction (`data-lg-refract-auto`, Chromium only) or blur. Never fake refraction with noise or extra blur.
4. **Apply** the smallest diff, one area at a time: top bar, tab bar, menus, sheets, media controls. Use system components on native, and remove their custom backgrounds.
5. **Validate**, fix and re-run. **Report** the files changed, which parts are the real Apple API and which are approximations, the results verbatim, and what was not tested.

## Validate Before Showing

- Every glass element or container surface has `data-lg-renderer="webgl"`. If not, read `data-lg-fallback-reason`.
- `node scripts/audit-page.mjs <file|url> --shot out.png` must report no rule issues, no axe violations and no console errors.
- Look at the screenshots: rim bend visible, groups fused, no glass-on-glass, text legible. Check light, dark, `data-lg-rt`, `data-lg-ic` and `data-lg-rm`.
- Project tests: `npm test`.
  - refraction engine: 24 checks
  - web: 37 checks
  - glass API (fusing, morph, identity, interactive, accessibility): 13 checks
- If REA is connected and Chrome runs with `--remote-debugging-port=9222 --user-data-dir=<temp>`: `list_browser_targets` → `capture_web_screenshot` / `inspect_web_page`.
- Never claim results for Safari, Firefox, a real GPU or Xcode that you did not run.

## Gotchas (learned in validation)

- Glass near the edge of its backdrop samples clamped edge pixels and looks lopsided. Extend the scene.
- The signature bend lives in a narrow rim (25% of the half-size). The centre stays flat and frosted (blur 2.5).
- Copying the shared WebGL canvas into each surface is the main cost, and the user's laptop has no strong GPU. Prefer one container over many single glass elements.
- `mix-blend-mode` on a glass pseudo-element silently disables v1 SVG refraction.
- `<button>` does not inherit `color`, so grouped icons vanish in dark mode unless you set `color: inherit`.
- `display:none` on minimized tab labels removes their accessible names. Use visually-hidden instead.
- Glass-on-glass often comes from *overlap* (menus over toolbars, sheets over tab bars), not nesting.
- Tinted Apple-blue at 82% fails 4.5:1 for 15 px white text. Darken it about 20%.
- Clear glass with 35% dimming over pure white media is about 2.25:1. Add a glyph shadow, or avoid it.
- RN: opacity < 1 on `GlassView` or its parents can make the glass disappear.

## Reference

Apple documentation links, WWDC session IDs and API tables: `references/reference.md`. Apple sources: `references/evidence-log.md`. Deeper material:
- `references/design-spec.md`: layers, materials, motion, engine
- `references/frameworks.md`
- `references/examples.md`
- `references/limitations.md`: quote these to the user
