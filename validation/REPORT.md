# Stage 4 — Validation Report

Date: 2026-11-17. Environment: Claude cloud workspace (Linux), Google Chrome via Playwright 1.63.0, **headless**. Not a real Windows machine. No iOS device or simulator.

## Summary
| Suite | Result |
|---|---|
| Web demo (`run-validation.mjs`) | **all checks pass** after fixes below; 1 WARN, 2 INFO |
| React demo (`run-react-smoke.mjs`) | **9/9 pass** |
| React package `tsc --noEmit` | pass |
| React Native package `tsc --noEmit` (against expo-glass-effect 58.0.5, expo-blur 58.0.6, react-native 0.81) | pass — **typecheck only, never run on a device** |
| SwiftUI | **not compiled, not run** (no Mac). See `implementations/swiftui/VALIDATION.md` |
| REA browser tools | **not run.** `list_browser_targets` at `http://127.0.0.1:9222` → `endpoint_unreachable` (no Chrome with remote debugging on the Windows machine). Steps below |
| Pixel comparison with Apple iOS 26 screenshots | **not done.** Apple images could not be downloaded (network allowlist). Criteria comparison below instead |

## Real defects found by validation and fixed
1. **Refraction silently disabled.** `mix-blend-mode: soft-light` on the specular `::after` made Chrome ignore the SVG `url()` in the `::before` backdrop-filter. The first pixel-diff check was a **false pass** (it compared different blur radii). Fixed CSS; test now toggles only the displacement scale. Result: 2209/55104 px change vs 267 before. Repro fixture: `fixtures/refraction-lab.html`.
2. **Glass-on-glass not caught.** Menu overlapped the toolbar group; panel overlapped the tab bar. Audit only checked DOM nesting. Added screen-rect overlap check; menu now anchors outside its group; trigger group dematerializes; panel hides tab bar while open. React `GlassMenu` now portals out of its glass group.
3. **Over budget.** Demo showed 8 glass surfaces (limit 6). Content-layer segmented control and content buttons changed to non-glass (also matches HIG "no glass in content layer").
4. **Tinted button contrast** 2.90:1 → darkened accent mix, now ≥ 4.5:1 worst case.
5. **Dark mode icons invisible** in grouped buttons (`<button>` doesn't inherit `color`). Fixed.
6. **Clear-glass icons white-on-white** under Reduce Transparency (demo hard-coded white). Fixed.
7. **Minimized tab bar lost accessible names** (`display:none` labels) — axe `button-name` critical ×4. Fixed with visually-hidden labels.
8. **Increase Contrast border** 1.5px rendered as 1px in Chrome; token changed to 2px.

## Known limitations (not fixed, documented)
- WARN: HIG recipe (clear glass + 35% dimming) over **pure white** media gives 2.25:1 for white glyphs by WCAG math. Mitigated with glyph drop-shadow; avoid clear glass over very bright media.
- INFO: regular light glass over a **black** backdrop gives 1.68:1. iOS flips light/dark per backdrop; our web version only flips by colour scheme.
- Refraction is Chromium-only. Firefox/Safari get blur tier (not tested here: only Chrome installed).
- Headless frame time ~16.7 ms median is a vsync-capped software measurement, **not** a device performance result.

## Comparison against documented iOS 26 behaviour (criteria, not pixels)
| Apple behaviour (evidence) | Web | React | RN iOS 26 | RN Android | SwiftUI |
|---|---|---|---|---|---|
| Glass only on controls/navigation (E-06) | yes, audited | yes, audited | by usage | by usage | system + lg* |
| Lensing at edges (E-07) | approx, Chromium | approx, Chromium | real (system) | no | real (system) |
| Blur + luminosity adjust (E-06) | approx | approx | real | fill only | real |
| Materialize, not fade (E-05/E-07) | scale+blur+lens ramp | same | system | scale only | `.lgMaterialize` approx; container transitions real |
| Morphing shapes (E-04/E-05) | FLIP pill, button→menu | same | GlassContainer merge | no | real (`glassEffectID`) |
| Adaptive shadow by backdrop (E-07) | no (fixed) | no | real | no | real |
| Light/dark flip per backdrop (E-07) | no (scheme only) | no | real | no | real |
| Reduce Transparency / Contrast / Motion (E-07) | yes (media + toggles) | yes | manual RT/RM | manual RT/RM | automatic |
| Tab bar minimize on scroll (E-01) | yes | yes | yes (hook) | yes | system |
| Scroll edge effect (E-01/E-07) | approx (blur strip) | approx | none | none | system |

Visual similarity is **not** claimed pixel-perfect. Screenshots: `screenshots/`.

## Web checks (`results.json`)
| Status | Check | Detail |
|---|---|---|
| PASS | contrast regular/light text over light backdrop | worst 13.30:1 (min 4.5) over given backdrop |
| PASS | contrast regular/dark text over dark backdrop | worst 11.08:1 (min 4.5) over given backdrop |
| INFO | info: regular/light over BLACK backdrop (scheme mismatch) | 1.68:1 — known limitation, no per-pixel light/dark flip on web |
| PASS | contrast reduced-transparency light | worst 15.94:1 (min 4.5) over white+black backdrop |
| PASS | contrast reduced-transparency dark | worst 12.86:1 (min 4.5) over white+black backdrop |
| PASS | contrast increased-contrast light | worst 21.00:1 (min 7) over white+black backdrop |
| PASS | contrast tinted accent (80% accent + 20% black, 96% opacity) white 15px text | worst 4.96:1 (min 4.5) over white+black backdrop |
| WARN | warn: clear glass + HIG 35% dimming over PURE WHITE media, white glyphs | 2.25:1 < 3:1 — mitigated by glyph drop-shadow (not captured by this math); avoid clear over very bright media |
| PASS | contrast clear + 35% dimming over typical bright media (#bebebe), white glyphs | 3.64:1 (min 3) |
| PASS | no page errors on load |  |
| PASS | refraction detected in Chromium | {"supported":true,"htmlClass":true,"filters":1,"backdrop":"blur(8.4px) url(\"#lg-refract-1\") saturate(1.8) brightness(1.04)"} |
| PASS | tab bar ::before backdrop-filter references SVG filter | blur(8.4px) url("#lg-refract-1") saturate(1.8) brightness(1.04) |
| PASS | refraction visibly alters backdrop pixels (displacement scale N vs 0, same blur) | 2209/55104 px differ (>24 sum RGB) |
| PASS | tab bar minimizes on scroll down and restores on scroll up | min=true restored=true |
| PASS | rule audit clean while scrolling (budget, glass-on-glass, content-layer, labels) |  |
| PASS | tab click selects tab and moves morph pill | {"sel":["false","false","true","false"],"pill":"translateX(143px)"} |
| PASS | ArrowRight moves tab selection (roving tabindex) | selected index 3 |
| PASS | toggle flips aria-checked | true -> false |
| PASS | slider ArrowRight increments value | value 61 |
| PASS | slider knob is glass only while dragging (E-01/E-06) | during=true after=false |
| PASS | slider drag sets value | value 80 |
| PASS | original functionality preserved (play/pause state) | {"p":"false","l":"Play"} |
| PASS | menu opens from trigger with focus on first item | {"hidden":false,"expanded":"true","focus":"menuitem","triggerHidden":false,"audit":[]} |
| PASS | menu open: audit clean (refraction budget, no glass-on-glass) |  |
| PASS | Escape closes menu and returns focus to trigger | {"hidden":true,"focusId":"more","expanded":"false"} |
| PASS | panel materializes, refracts, focus moves to close | {"hidden":false,"focus":"close-panel","audit":[],"refract":true} |
| PASS | panel open: audit clean |  |
| PASS | Escape closes panel |  |
| PASS | Reduce Transparency: near-opaque fill, refraction off | {"bg":"rgba(246, 246, 248, 0.94)","border":"0px","trans":"0.16s, 0.28s, 0.28s, 0.28s","backdrop":"blur(14px) saturate(1.8) brightness(1.04)","after":"block"} |
| PASS | Increase Contrast: solid fill, 2px border, no specular, no refraction | {"bg":"rgb(255, 255, 255)","border":"2px","trans":"0.16s, 0.28s, 0.28s, 0.28s","backdrop":"blur(14px) saturate(1.8) brightness(1.04)","after":"none"} |
| PASS | Reduce Motion: transitions capped at 140ms | 0.14s |
| PASS | prefers-reduced-motion media query honoured |  |
| PASS | prefers-contrast: more media query honoured | {"bg":"rgb(255, 255, 255)","border":"2px","trans":"0.16s, 0.28s, 0.28s, 0.28s","backdrop":"none","after":"none"} |
| PASS | dark scheme switches glass text to light | rgb(245, 245, 247) |
| PASS | axe-core: no violations inside demo device |  |
| INFO | info: headless frame time during scroll (ms) | median 16.7, p95 16.8 — headless/software GPU, not a device measurement |
| PASS | no page errors during run |  |

## React checks (`results-react.json`)
| Status | Check | Detail |
|---|---|---|
| PASS | React demo renders without errors or audit warnings |  |
| PASS | existing state logic preserved (play toggles) |  |
| PASS | FloatingTabBar selection updates |  |
| PASS | GlassMenu opens, focuses first item, audit clean | {"hidden":false,"focus":"menuitem","audit":[]} |
| PASS | menu item onSelect runs and menu closes |  |
| PASS | FloatingPanel materializes and hides tab bar (no glass on glass) | {"panel":true,"barHidden":true,"audit":[]} |
| PASS | panel closes on Escape and tab bar returns |  |
| PASS | Provider override sets data-lg-rt on <html> |  |
| PASS | no errors during run |  |

## How to repeat on a real Windows machine with REA
1. `cd validation && npm i && npx playwright install chrome` then `node run-validation.mjs` (Chrome/Edge). For Firefox: `npx playwright install firefox` and switch `chromium` → `firefox` (expect blur-only tier).
2. For REA: start Chrome with debugging and open the demo:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=%TEMP%\lg-cdp file:///<repo>/implementations/web/dist/liquid-glass-demo.html`
3. Ask Claude: "use REA list_browser_targets on http://127.0.0.1:9222, then capture_web_screenshot and inspect_web_page with accessibility text". Save results in `validation/rea/`.
4. Capture real iOS 26 screenshots (Music / Photos apps) on device and place beside `screenshots/01-light-rest.png` for side-by-side review.


---

# v2 WebGL2 refraction engine — validation (2026-11-17)

Environment: cloud workspace, Google Chrome via Playwright 1.63, **headless**, WebGL2 on a **software rasterizer** (ANGLE → Vulkan → llvmpipe). Not a real Windows machine. Script: `validation/run-refraction-tests.mjs`. Raw: `results-refraction-chrome.json`. Screenshots: `screenshots/refraction/`.

**Result: 23/23 checks pass.** Regression: original web suite 37/37, React smoke 10/10 (adds v2 check).

| Status | ID | Check | Detail |
|---|---|---|---|
| PASS | S | WebGL2 available | WebKit WebGL |
| PASS | C | all 8 shapes render (circle, ellipse, rect, rounded rect, capsule, SVG path, hexagon, star) | circle:41% ellipse:45% rect:55% rounded:54% capsule:45% path:38% polygon:39% star:19% |
| PASS | A | checkerboard visibly bends through the glass (rim pixels changed ≥ 30%) | circle rim 35%, ellipse rim 36%, rect rim 40%, rounded rim 40%, capsule rim 35% |
| PASS | B1 | distortion is concentrated at the shape edge (centre changed ≤ 8%) | circle centre 0.0%, ellipse centre 0.0%, rect centre 0.0%, rounded centre 0.0%, capsule centre 0.0% |
| PASS | B2 | offset direction follows the shape normal (≥ 90% of rim pixels within 37° of inward normal) | circle 100.0% (n=9182), ellipse 100.0% (n=11769), rect 93.0% (n=13609), rounded 100.0% (n=12962), capsule 100.0% (n=9327) |
| PASS | B3 | flat centre: max offset in centre ≤ 2% of the rim maximum | circle c=0.003 r=0.071, ellipse c=0.003 r=0.078, rect c=0.003 r=0.085, rounded c=0.003 r=0.087, capsule c=0.003 r=0.171 |
| PASS | D | surface normals continuous inside every shape (max neighbour jump ≤ 48/510) | circle:7 ellipse:7 rect:8 rounded:7 capsule:5 path:8 polygon:8 star:17 |
| PASS | F | all shapes respond to each material parameter | refraction:8/8 ior:8/8 thickness:8/8 curvature:8/8 edge:8/8 fresnel:8/8 blur:8/8 reflection:8/8 tint:8/8 |
| PASS | E1 | moving backdrop synchronised at 4 timestamps (centre colour delta ≤ 60/765) | 0, 0, 0, 0 |
| PASS | E2 | live animation: glass centre matches backdrop on 30 consecutive frames | max delta 0; frames over threshold 0/30 |
| PASS | G | refraction is visibly distinct from backdrop blur (new keeps ≥ 3× edge sharpness and ≥ 30% pixels differ) | {"sharpBlur":"1.2","sharpNew":"6.2","differ":"0.97"} |
| PASS | R | resize: render target follows element size | {"ok":true,"w":472} |
| PASS | SC | scroll: output unchanged when glass and backdrop scroll together | 791601514 vs 791601514 |
| PASS | SZ | component sizes 24px, 44px, 600px render | 24x24:ok 44x44:ok 600x200:ok |
| INFO | info | CPU-side frame cost, 8 instances, moving backdrop (draw + upload + render + copy), DPR 2 | median 132.9 ms, p95 152.6 ms; engine-only re-render (no backdrop change) 115.9 ms; on WebKit WebGL — software rasterizer here; real GPU numbers must come from a real machine |
| PASS | ERR | no page errors / warnings in lab run (GL driver perf notices excluded) |  |
| PASS | DPR | DPR 1: canvas at 1× and bending present | {"w":206,"rim":"0.36"} |
| PASS | ERR1 | no errors at DPR 1 |  |
| PASS | FB1 | no WebGL2 → every surface falls back (v1 SVG / blur), no errors | fallback/no-webgl2 ×8; errors=0 |
| PASS | FB2 | rollback switch ?renderer=svg → v1 SVG refraction on every surface | fallback/forced-svg/true |
| PASS | A11Y1 | Reduce Transparency → WebGL glass disabled; restored when cleared | {"off":"accessibility","on":"webgl"} |
| PASS | A11Y2 | prefers-contrast: more → WebGL glass disabled | fallback |
| PASS | H | demo controls still work with v2 glass on media controls (play, tabs, menu) | {"media":"webgl","play":"false","tab":"true","menu":true,"errs":0} |

## Acceptance criteria
| Criterion | Status | Evidence |
|---|---|---|
| A checkerboard bends | met | A: 35–40% of rim pixels move; `new-checker.png` |
| B follows geometry | met | B1 centre 0% changed; B2 100% of rim offsets point along the inward normal (rect 93%: corner zone uses the smoothed field by design); B3 |
| C circle/oval/rounded/capsule (+rect, path, hexagon, star) | met | C |
| D no corner artifacts | met for the normal field | D max neighbour jump 5–17/510; `debug-normals.png`. Visual note: sharp-cornered rectangle shows a small bright smear at the 4 corners (rim zone) |
| E moving backgrounds synced | met | E1 delta 0 at 4 timestamps; E2 0/30 frames over threshold |
| F all shapes respond to parameters | met | F 9 params × 8 shapes |
| G distinct from blur | met | G sharpness 6.2 vs 1.2, 97% pixels differ; `compare-blur-vs-new.png` |
| H existing controls work | met | H + original suite 37/37 + React 10/10 |
| I real browser screenshots + results | **partly** | headless Chrome screenshots and results produced. **Not** from your live Chrome: REA CDP at 127.0.0.1:9222 / [::1]:9222 unreachable |

## Not tested / limits
- **Edge**: not installable in the cloud workspace (`npx playwright install msedge` → proxy 403). Run `node run-refraction-tests.mjs --browser msedge` on Windows.
- **Firefox / Safari**: not tested. No compatibility claim.
- **Real GPU performance**: unknown. On the software rasterizer, rendering 8 surfaces costs ~1 ms of shader time but ~90 ms copying the shared WebGL canvas into each surface's 2D canvas (GPU readback). On a hardware-accelerated Chrome this copy is normally GPU-to-GPU, but this is **not measured**. Measure on your target machine before using many surfaces.
- **DOM backdrops**: v2 cannot sample DOM pixels. Tab bar / toolbars over text still use v1 SVG or blur.
- **Reference image**: not inspected. It was not available in this conversation.
