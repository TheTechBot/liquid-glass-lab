# SwiftUI — Mac / Xcode validation

**Status: NOT compiled, NOT run.** Written on Windows from Apple's published signatures (evidence E-02…E-05, E-01). Treat as untested source until the steps below pass.

## Requirements
- Mac with **Xcode 26** or later (iOS 26 / macOS 26 SDK — required for `Glass`, `glassEffect`, `GlassEffectContainer`).
- iOS 26 simulator; ideally a physical iOS 26 device (glass rendering and performance differ from the simulator).

## 1. Build the package
```bash
cd implementations/swiftui
swift build                                   # macOS host build of LiquidGlassKit
xcodebuild -scheme LiquidGlassKit -destination 'generic/platform=iOS Simulator' build
xcodebuild -scheme LiquidGlassKit -destination 'generic/platform=iOS' build
```
Expected: no errors. Record any errors in `validation/swiftui-results.md` verbatim.

## 2. Run the demo app
1. Xcode ▸ File ▸ New ▸ Project ▸ iOS App. Name `LiquidGlassDemo`. Interface SwiftUI. Minimum deployment **iOS 26.0**.
2. Delete the generated `*App.swift` and `ContentView.swift`.
3. Drag `Examples/LiquidGlassDemo/*.swift` into the project.
4. File ▸ Add Package Dependencies ▸ Add Local… ▸ select `implementations/swiftui`. Add `LiquidGlassKit` to the app target.
5. Run on an iPhone 26 simulator.

## 3. Back-deploy check (fallback path)
Temporarily set the app's deployment target to iOS 17, wrap iOS 26-only demo code (`Tab`, `tabBarMinimizeBehavior`, `ToolbarSpacer`) in `if #available(iOS 26, *)`, and run on an iOS 17/18 simulator. Glass surfaces must render as `.regularMaterial` / `.ultraThinMaterial` — this path is **not Liquid Glass**.

## 4. Manual checklist (record pass/fail + screenshot)
| # | Check | Expected |
|---|---|---|
| 1 | Tab bar | System Liquid Glass tab bar; Search tab separated at trailing end; minimizes on scroll down |
| 2 | Toolbar | "+" and "…" render as glass; fixed spacer separates them |
| 3 | Menu | "…" morphs into menu (system) |
| 4 | Media controls | Clear glass over gradient, dimming visible, glyphs legible |
| 5 | Expanding actions | "…" morphs into heart/share glass buttons (glassEffectID in container) |
| 6 | Floating panel | Rounded-rect glass, appears with scale+opacity |
| 7 | Slider / toggle | Knob turns to glass while dragging (system behaviour) |
| 8 | Settings ▸ Accessibility ▸ Display & Text Size ▸ **Reduce Transparency** | Glass frostier, content behind less visible |
| 9 | **Increase Contrast** | Glass mostly black/white with border |
| 10 | Accessibility ▸ Motion ▸ **Reduce Motion** | No elastic/gel motion; our springs replaced by 0.14s ease-out |
| 11 | VoiceOver | Every icon button announces a label |
| 12 | Instruments ▸ SwiftUI / Animation Hitches | No sustained hitches while scrolling under tab bar |

## 5. API signatures to double-check (not verified by compile)
- `ToolbarSpacer(.fixed, placement: .topBarTrailing)` — initializer label/parameter order taken from docs index (E-01 lists `ToolbarSpacer`, `SpacerSizing.fixed`), not from the symbol page.
- `glassEffectID(_:in:)` called with a non-optional `String` id.
- `lgClearDimming(_:in:)` default argument `some Shape = Rectangle()` relies on SE-0347.
- `Tab(role: .search) { … }` without a title.
If any fail, fix and record the change in `PROGRESS.md`.
