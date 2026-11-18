# Evidence Log — Project Liquid Glass Lab

Every claim used by the design system traces to an entry here. Retrieval date for all entries: **2026-11-17**.
Status key: **[APPLE]** = official Apple source · **[3P]** = third-party (community/vendor) · **[OBS]** = our own observation in this project.

Apple's documentation pages are JavaScript-rendered. The HTML pages returned only metadata, so each was re-fetched via its `.md` variant (same path + `.md`). Text below is a short excerpt or paraphrase, not a full copy.

---

## E-01 [APPLE] Adopting Liquid Glass (Technology Overview)
- URL: https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass (fetched as `.md`)
- Findings:
  - Liquid Glass "combines the optical properties of glass with a sense of fluidity" and forms "a distinct functional layer for controls and navigation elements".
  - Standard bars, sheets, popovers and controls adopt it automatically when built with latest SDKs.
  - Remove custom backgrounds from NavigationStack / NavigationSplitView / toolbar / UITabBar / UIToolbar etc.; custom backgrounds can interfere with glass and the scroll edge effect.
  - "Avoid overusing Liquid Glass effects… Limit these effects to the most important functional elements."
  - Users can pick a preferred Liquid Glass look; Reduce Transparency / Reduce Motion "can remove or modify certain effects".
  - Slider/toggle knobs "transform into Liquid Glass during interaction"; buttons "fluidly morph into menus and popovers".
  - Hardware shape informs curvature → concentric shapes: `rect(corners:isUniform:)`, `ConcentricRectangle`, UIKit `cornerConfiguration`.
  - Button styles: SwiftUI `.glass`, `.glassProminent`, `.glass(_:)`; UIKit `UIButton.Configuration.glass()`, `.prominentGlass()`, `.clearGlass()`, `.prominentClearGlass()`; AppKit `NSButton.BezelStyle.glass`.
  - Scroll edge effect: `scrollEdgeEffectStyle(_:for:)`; custom bars register via `safeAreaBar(edge:alignment:spacing:content:)` / `UIScrollEdgeElementContainerInteraction`.
  - Tab bar minimise: `.tabBarMinimizeBehavior(.onScrollDown)`; search tab: `Tab(role: .search)`.
  - Background extension under sidebars: `backgroundExtensionEffect()`.
  - Toolbar grouping + `ToolbarSpacer` / `SpacerSizing.fixed`. Don't mix text and icons in one shared background. Every icon needs an accessibility label.
  - Half sheets inset from display edge; become more opaque at full height.
  - "Combine custom Liquid Glass effects… using a GlassEffectContainer, which helps optimize performance."
  - Opt-out for one release cycle: Info.plist `UIDesignRequiresCompatibility`.
  - UIKit API: `UIGlassEffect`; AppKit: `NSGlassEffectView`.

## E-02 [APPLE] `Glass` (SwiftUI structure)
- URL: https://developer.apple.com/documentation/swiftui/glass (fetched as `.md`)
- Declaration: `struct Glass` — "A structure that defines the configuration of the Liquid Glass material."
- Availability: iOS, iPadOS, Mac Catalyst, macOS, tvOS, watchOS **26.0+**.
- Type properties: `static var regular`, `static var clear`, `static var identity` (content "remains unaffected as if no glass effect was applied").
- Instance methods: `func interactive(Bool) -> Glass`, `func tint(Color?) -> Glass`.
- Conforms: `Equatable`, `Sendable`.

## E-03 [APPLE] `glassEffect(_:in:)`
- URL: https://developer.apple.com/documentation/SwiftUI/View/glassEffect(_:in:) (fetched as `.md`)
- Declaration: `nonisolated func glassEffect(_ glass: Glass = .regular, in shape: some Shape = DefaultGlassEffectShape()) -> some View`
- System "renders a shape anchored behind a view with the Liquid Glass material" and "applies the foreground effects of Liquid Glass over a view".
- Defaults: `.regular` + `Capsule`. Glass anchors to view bounds (includes padding).
- Availability 26.0+ all Apple platforms.

## E-04 [APPLE] `GlassEffectContainer`
- URL: https://developer.apple.com/documentation/swiftui/glasseffectcontainer (fetched as `.md`)
- Declaration: `@MainActor @preconcurrency struct GlassEffectContainer<Content> where Content : View`
- Init: `init(spacing: CGFloat?, content: () -> Content)`.
- Renders contained effects together → better performance, shapes can "interact with and morph into one another". Higher spacing → blending starts sooner.

## E-05 [APPLE] Applying Liquid Glass to custom views
- URL: https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views (fetched as `.md`)
- Liquid Glass "blurs content behind it, reflects color and light of surrounding content, and reacts to touch and pointer interactions in real time".
- Rounded rect recommended for larger components (`.glassEffect(in: .rect(cornerRadius: 16.0))`).
- Tint "to suggest prominence": `.glassEffect(.regular.tint(.orange).interactive())`.
- Container spacing larger than inner stack spacing → shapes blend at rest.
- Apply `glassEffect` **after** other appearance modifiers.
- `glassEffectUnion(id:namespace:)` — merge several views into one glass shape.
- `glassEffectID(_:in:)` + `@Namespace` → morph during transitions. `GlassEffectTransition`: `.matchedGeometry` (default, within spacing) and `.materialize` (farther apart). "The system applies more than opacity changes."
- Performance: too many containers / effects outside containers degrade performance; "Limit the use of Liquid Glass effects onscreen at the same time."

## E-06 [APPLE] HIG — Materials
- URL: https://developer.apple.com/design/human-interface-guidelines/materials (fetched as `.md`; changelog shows update 2025-09-09)
- "Don't use Liquid Glass in the content layer." Exception: transient interactive elements (slider, toggle) while active.
- "Use Liquid Glass effects sparingly."
- Regular variant: blurs + adjusts luminosity of background for legibility; use for text-heavy components (alerts, sidebars, popovers). Appears darker over dark, lighter over light.
- Clear variant: highly translucent; only over visually rich media backgrounds.
- Dimming for clear: bright content → consider **dark dimming layer of 35% opacity**; not needed if content dark or AVKit supplies dimming.
- Standard materials (ultraThin, thin, regular, thick) stay for the content layer; use vibrant label/fill colors on materials; avoid quaternary on thin/ultraThin.

## E-07 [APPLE] WWDC25 Session 219 "Meet Liquid Glass" (transcript)
- URL: https://developer.apple.com/videos/play/wwdc2025/219/
- Lensing: "dynamically bends, shapes, and concentrates light in real time" (vs older materials that scattered light).
- Materialize: objects appear/disappear "by gradually modulating the light bending and lensing" instead of fading.
- Interaction: "instantly flexing and energizing with light"; "gel-like flexibility".
- Highlights respond to geometry; lights move on interaction; sometimes respond to device motion.
- Shadow opacity increases over text, decreases over solid light background.
- Adaptive per-layer; can switch independently between light and dark.
- Larger glass (e.g. menu from toolbar button) simulates thicker material: deeper shadows, stronger lensing/refraction, softer light scattering.
- Tint maps a range of tones to underlying content brightness; use only for primary actions; "Avoid tinting all your elements."
- Regular vs Clear "should never be mixed". Clear only when: over media-rich content, dimming layer acceptable, content on top is bold and bright. Localized dimming allowed for small elements.
- Scroll edge effect dissolves content under glass; switches to dimming for dark content; "hard style" for pinned accessory views.
- Accessibility: Reduce Transparency → frostier; Increase Contrast → mostly black/white + contrasting border; Reduce Motion → less intense, no elastic properties.
- "Always avoid glass on glass." Elements on top of glass use fills, transparency, vibrancy instead.
- Secondary corroboration [3P]: WWDC Notes summary https://wwdcnotes.com/documentation/wwdc25-219-meet-liquid-glass/ ("Do not stack Liquid Glass" also in useyourloaf.com viewing guide).

## E-08 [APPLE] WWDC25 Session 356 "Get to know the new design system"
- URL: https://developer.apple.com/videos/play/wwdc2025/356
- Only confirmed as companion talk; transcript **not** analysed in this pass. Listed as follow-up in unknowns.

## E-09 [3P] Expo `expo-glass-effect`
- URL: https://docs.expo.dev/versions/latest/sdk/glass-effect.md (+ v54/v57 pages)
- Renders native iOS Liquid Glass via `UIVisualEffectView`. iOS + tvOS only. `GlassView` iOS 26+ only; falls back to plain `View` elsewhere.
- `GlassView` props: `glassEffectStyle` (`'regular' | 'clear' | 'none'` or config `{style, animate, animationDuration}`), `tintColor`, `isInteractive`, `colorScheme` (`'auto'|'light'|'dark'`).
- `GlassContainer` prop `spacing`.
- `isLiquidGlassAvailable()` — system/compiler/Info.plist check; does **not** reflect accessibility. Use `AccessibilityInfo.isReduceTransparencyEnabled()`.
- `isGlassEffectAPIAvailable()` — some iOS 26 betas lack the API and can crash.
- Known issue: opacity < 1 on `GlassView` or parents is not recommended; glass may not render. Workaround: animate wrapper opacity and toggle style to `'none'`.

## E-10 [3P] Web refraction techniques
- kube.io "Liquid Glass in the Browser: Refraction with CSS and SVG" — https://kube.io/blog/liquid-glass-css-svg/ — `feImage` displacement map + `feDisplacementMap` referenced from `backdrop-filter`; demo Chrome-only.
- WebKit bug 313914 — https://bugs.webkit.org/show_bug.cgi?id=313914 — reporter states `backdrop-filter` with SVG filter references works only in Chrome at time of filing.
- DEV / HN discussion: "only Chromium supports SVG filters in backdrop-filter"; `backdrop-filter` only samples within element bounds, so Apple-style refraction beyond borders is not reproducible with it alone.
- liquid-glass-js README: alternative that refracts a cloned background to work cross-browser.
- Conclusion used: **SVG refraction = progressive enhancement for Chromium; all browsers get blur/saturate baseline.**

## E-11 [OBS] Environment checks (this session)
- REA MCP `binary_session`: server `rea` v6.9.0, catalog 255 MCP tools / 196 CLI / 6 prompts; host win32. Web tools (`capture_web_screenshot`, `inspect_web_page`, `list_browser_targets`, `compare_web_screenshots`) report available. macOS-native, adb, Ghidra providers unavailable.
- Folder access request for the user's home folder (to create `<repo>`) was **denied** by the host permission classifier. Work built in Claude's cloud workspace; delivered as files.
- Cloud workspace: Node 22.23.4, Playwright 1.63.0, Google Chrome present → used for Stage 4.
- No Mac / Xcode available. SwiftUI code **not compiled**.

## E-12 [OBS] Reference screenshots
- Apple doc pages reference official images (e.g. `materials-ios-liquid-glass-over-dark@2x.png`, `materials-ios-liquid-glass-clear@2x.png`, `adoption-guide-tab-bar-after~dark@2x.png`). The workspace network allowlist blocks direct image download, so **no pixel-level comparison against Apple imagery was performed**. Comparison in Stage 4 is a criteria checklist built from E-05…E-07 text and image alt descriptions.
