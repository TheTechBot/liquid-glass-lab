# Framework guidance

## Detect the framework first
| Signal | Framework |
|---|---|
| `*.xcodeproj`, `Package.swift`, `import SwiftUI` | SwiftUI |
| `package.json` has `react-native` or `expo` | React Native |
| `package.json` has `react` / `next` / `vite` + JSX | React |
| plain `.html` + `.css` + `.js` | Vanilla web |
A repo can contain several (e.g. RN app + marketing site). Treat each separately.

---

## SwiftUI (REAL Apple API — prefer system components)
Apple APIs (iOS/macOS 26+): `Glass` (`.regular`, `.clear`, `.identity`, `.tint(_:)`, `.interactive()`), `glassEffect(_:in:)`, `GlassEffectContainer(spacing:)`, `glassEffectID(_:in:)`, `glassEffectUnion(id:namespace:)`, `glassEffectTransition(.matchedGeometry | .materialize)`, `.buttonStyle(.glass)` / `.glassProminent`, `.tabBarMinimizeBehavior(.onScrollDown)`, `Tab(role: .search)`, `backgroundExtensionEffect()`, `ToolbarSpacer`. UIKit: `UIGlassEffect`, `UIButton.Configuration.glass()`. AppKit: `NSGlassEffectView`.

Steps:
1. Build with Xcode 26. Most bars, sheets, menus, toggles, sliders, pickers adopt glass automatically.
2. **Remove** custom `.background` / `toolbarBackground` / `UIVisualEffectView` from NavigationStack, toolbars, tab bars, sheets, popovers. Custom backgrounds interfere with glass and the scroll edge effect.
3. Replace custom floating buttons with `.buttonStyle(.glass)` / `.glassProminent`, or `lgButtonStyle()` when supporting < iOS 26.
4. Custom floating UI only: copy `assets/swiftui/*.swift` (LiquidGlassKit) and use `.lgGlass(...)`, `LGContainer`, `.lgGlassID`.
5. Group neighbouring glass in one `GlassEffectContainer` (performance + morph).
6. Apply `glassEffect` **after** other appearance modifiers.
7. Keep business logic untouched; change only modifiers/containers.
8. Opt-out escape hatch for one release: Info.plist `UIDesignRequiresCompatibility` = YES.
9. Cannot compile on Windows. Hand the user the Mac checklist: `implementations/swiftui/VALIDATION.md` pattern.

## React (APPROXIMATION)
1. Copy `assets/react/*` into `src/liquid-glass/` (LiquidGlass.tsx, liquid-glass.css, liquid-glass.js, liquid-glass.d.ts, tokens.ts).
2. Wrap the app root in `<LiquidGlassProvider>`.
3. Replace only chrome elements:
   - floating `<button>` → `<GlassButton>` (pass through `onClick`, `aria-*`, `type`, refs)
   - toolbar clusters → `<GlassGroup>` + `<GroupButton>`
   - bottom nav → `<FloatingTabBar scrollRef=…>`
   - dropdown → `<GlassMenu trigger={(p)=> <GroupButton {...p}/>}>`; add `data-lg-portal` on a positioned ancestor
   - sheet/modal → `<FloatingPanel hideWhileOpen={[tabBarRef]}>`
   - in-content tabs → `<SegmentedControl appearance="content">` (not glass)
4. Leave cards, lists, forms, page backgrounds alone (content layer).
5. Add `useGlassAudit()` in dev; console shows rule violations.
6. Next.js: components use `window`/`matchMedia` → mark files `'use client'`.
7. Tailwind/CSS-modules apps: the CSS is global class-based (`lg-*`); import once at root.

## v2 optical refraction — signature look (web + React)
Default material = `SIGNATURE` (user's sweet spot). Presets: `signature`, `control`, `media`, `overlay`, `overlay-dark` — same bend, different legibility.
```html
<canvas id="scene" data-lg-backdrop-source></canvas>          <!-- or <img>/<video> -->
<header class="lg-glass" data-lg-glass data-lg-preset="control">…</header>
<script>LG.init(); LGRefraction.autoAttach(document, { observe: true });</script>
```
Attributes: `data-lg-glass` (empty = shape from border-radius, or `circle|ellipse|rect|roundedRect|capsule`), `data-lg-preset`, `data-lg-backdrop="#sel"`, `data-lg-material='{"blur":3}'`.
Programmatic:
```js
const g = LGRefraction.attach(el, { backdrop: sceneCanvas, preset: 'control' }); // shape optional via shapeFromElement(el)
g.update({ material: { blur: 3 } }); g.destroy();
```
React: `<GlassGroup refraction={{ backdrop: sceneRef, preset: 'control' }}>` (also `GlassSurface`, `GlassButton`).
Scene redraw → `LGRefraction.invalidate(canvas)`; animated → redraw then `LGRefraction.renderNow()`. Video backdrops update every frame automatically.
New UIs start from `assets/web/liquid-glass-starter.html`.

## Vanilla HTML/CSS/JS (APPROXIMATION)
1. Copy `assets/web/liquid-glass.css` (includes tokens) and `liquid-glass.iife.js` (or ESM `liquid-glass.js`).
2. Add classes, keep markup + handlers:
   - `.lg-glass` base · `.lg-glass--clear` · `.lg-glass--tinted` · `.lg-glass--sm|--lg`
   - `.lg-btn`, `.lg-btn--icon`, `.lg-group` (shared background), `.lg-segmented` (+ `role=tablist/tab` or `radiogroup/radio`)
   - `.lg-tabbar` + `data-lg-minimize-on="#scroller"`
   - `.lg-menu` + trigger `data-lg-menu-trigger="menuId"`
   - `.lg-panel` + `LG.materialize(el)` / `LG.dematerialize(el)`
   - `.lg-slider`, `.lg-toggle` (knob turns glass only while interacting)
   - `.lg-scroll-edge--top|--bottom` under floating bars
   - `data-lg-interactive` for press flex + pointer specular
   - `data-lg-refract-auto` (max 2 visible) for Chromium refraction
   - `data-lg-layer="content|control|navigation|overlay"` so the audit can check placement
3. Call `LG.init()` after DOM ready; `LG.refresh()` after toggling a11y attributes.
4. Never put `mix-blend-mode` on a glass element's pseudo-elements: it disables Chromium refraction.
5. Never animate `opacity < 1` as the resting state of a glass surface.

## React Native (REAL on iOS 26, APPROX elsewhere)
1. `npx expo install expo-glass-effect expo-blur` (bare RN: install `expo` first).
2. Copy `assets/react-native/*` into `src/liquid-glass/`.
3. Wrap root in `<LiquidGlassProvider>`.
4. Tiers chosen automatically: `native-liquid-glass` (iOS 26 + `isGlassEffectAPIAvailable()`), `blur-material` (older iOS, expo-blur), `translucent-fill` (Android; pass `androidBlurTarget` for real blur).
5. Reduce Transparency → opaque fill (expo's availability check ignores it). Reduce Motion → no springs.
6. Don't animate opacity on `GlassView` or its parents (glass may vanish). Animate transforms.
7. Expo Router / React Navigation: prefer native tab bars (`expo-router/unstable-native-tabs` or native-stack headers) on iOS 26 — they get system glass. Use `FloatingTabBar` only for custom navigation.
8. Needs a dev build for native glass; Expo Go supports `expo-glass-effect` but not every native module.
