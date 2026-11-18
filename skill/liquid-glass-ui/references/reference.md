# Liquid Glass — API quick reference

## Apple sources (checked in this project, see evidence-log.md)
| Topic | Link |
|---|---|
| Adopting Liquid Glass (overview) | https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass |
| Applying Liquid Glass to custom views | https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views |
| `glassEffect(_:in:)` | https://developer.apple.com/documentation/SwiftUI/View/glassEffect(_:in:) |
| `Glass` | https://developer.apple.com/documentation/swiftui/glass |
| `GlassEffectContainer` | https://developer.apple.com/documentation/swiftui/glasseffectcontainer |
| HIG — Materials | https://developer.apple.com/design/human-interface-guidelines/materials |
| WWDC25 219 "Meet Liquid Glass" | https://developer.apple.com/videos/play/wwdc2025/219/ |
| WWDC25 356 "Get to know the new design system" | https://developer.apple.com/videos/play/wwdc2025/356 |

## SwiftUI API (iOS / iPadOS / macOS 26+)
| API | Purpose |
|---|---|
| `View.glassEffect(_ glass: Glass = .regular, in shape: some Shape = .capsule, isEnabled: Bool = true)` | apply glass |
| `Glass.regular` / `.clear` / `.identity` | variants |
| `Glass.tint(_:)`, `Glass.interactive(_:)` | modifiers (chainable) |
| `GlassEffectContainer(spacing:content:)` | shared sampling + blending of nearby glass |
| `View.glassEffectID(_:in:)` | morph identity inside a container |
| `View.glassEffectUnion(id:namespace:)` | several views render as one glass shape |
| `View.glassEffectTransition(_:)` | how glass appears/disappears |
| `.buttonStyle(.glass)` / `.glassProminent` | glass buttons |
| `ToolbarSpacer(_:placement:)` | split toolbar glass groups |
| `.rect(cornerRadius: .containerConcentric)` | corners concentric with the container |

## Web API (`liquid-glass-effect.js`, global `LGGlass`)
| API | Notes |
|---|---|
| `Glass.regular / .clear / .identity`, `.tint(css)`, `.interactive(on?)` | immutable values, like SwiftUI |
| `glassEffect(el, glass?, { in?, backdrop?, dynamic? })` → `{ update(glass), destroy() }` | `in`: `'capsule'` (default) · `'circle'` · `'rect'` · `'ellipse'` · `'auto'` · number · `{ cornerRadius }` · engine shape |
| `glassEffectContainer(el, { spacing, backdrop?, dynamic? })` → `{ add, remove, withAnimation(fn, { duration }), refresh, destroy }` | one merged WebGL surface; gap ≤ spacing fuses |
| `autoGlass(root)` | wires `[data-glass-container]` and standalone `[data-glass]` |
| `data-glass="regular|clear|identity"` `data-glass-tint` `data-glass-interactive` `data-glass-shape` `data-glass-id` `data-glass-container="<spacing>"` | declarative |
| `glassEffectUnion` | use one container with large spacing instead |
| `glassEffectTransition` | not implemented — container morphs instead |
| `.containerConcentric` | not implemented — inner radius = outer radius − padding |

## React (`GlassEffect.tsx`)
`<GlassEffect glass shape glassID as backdrop>`, `<GlassEffectContainer spacing backdrop>`, `useGlassAnimation(containerRef)`. Type-checked with `tsc`. No runtime React test exists for these yet.

## React Native (`expo-glass-effect`)
`<GlassView glassEffectStyle="regular|clear" isInteractive tintColor>`, `<GlassContainer spacing>`, `isLiquidGlassAvailable()`. Real glass only on iOS 26.

## Engine (`liquid-glass-refraction.js`, global `LGRefraction`)
`attach(el, { backdrop, shape, preset, material, dynamic })`, `autoAttach`, `renderNow`, `invalidate`, `refresh`, `disableAll`, `stats`, `SIGNATURE`, `PRESETS`. Shapes: `rect`, `roundedRect`, `circle`, `ellipse`, `capsule`, `path`, `polygon`, `union` (used by containers).
