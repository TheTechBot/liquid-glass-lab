# Progress log

## 2026-11-17
- Env: REA `binary_session` OK — rea 6.9.0, 255 MCP tools; web tools available; macOS/adb/Ghidra providers unavailable on win32.
- Folder access to `<home>` (to create `Projects\LiquidGlassLab`) **denied** by host permission check. Built in Claude's cloud workspace; delivered as zip.
- Stage 1 done: 4 Apple doc pages fetched via `.md` variants (HTML pages are JS-only), HIG Materials, WWDC25 219 transcript, Expo docs, web refraction sources. Files in `research/`.
- Stage 2 done: SPEC.md, tokens.json, generator → CSS / TS / Swift.
- Stage 3 done: web core + demo, React (typecheck + vite build OK), SwiftUI (source only), RN (typecheck OK vs expo-glass-effect 58.0.5).
- Stage 4 done: web suite all pass after fixing 8 real defects (see `validation/REPORT.md`), React smoke 9/9. REA browser capture not possible: no CDP endpoint on 127.0.0.1:9222. No Apple image pixel comparison.
- Stage 5 done: `skill/liquid-glass-ui` + audit script (verified against the demo: 0 issues).

## Open
- Compile/run SwiftUI on Mac (Xcode 26).
- Run RN example on iOS 26 device + Android.
- Run web suite on a real Windows machine in Chrome, Edge, Firefox; REA capture via CDP.
- Side-by-side with real iOS 26 device screenshots.
- Read WWDC25 sessions 323 / 356 transcripts.

## 2026-11-17 (afternoon) — v2 optical refraction
- Folder `<repo>` connected; local files byte-identical to cloud copy. Device shell unavailable (needs 17 GB free) → files transferred with stage/commit.
- REA: CDP 127.0.0.1:9222 and [::1]:9222 unreachable → no live-session inspection.
- Stage 1: `research/refraction-investigation.md`.
- Backup: `backup/2026-11-17-v1-baseline/` + RESTORE.md.
- New: `implementations/web/src/liquid-glass-refraction.js` (WebGL2 SDF engine), `implementations/web/refraction-lab/`, `dist/refraction-lab.html`, `validation/run-refraction-tests.mjs`.
- Integrated: web demo media controls, React `refraction` prop + `useOpticalRefraction`, types, SPEC §11, tokens `refractionV2`, skill.
- Tests: refraction 23/23, web 37/37, React 10/10 (headless Chrome, software GL). Edge/Firefox/Safari/real GPU: not tested.

## 2026-11-17 (evening) — signature preset
- User picked the sweet spot in the Refraction Test Lab → `SIGNATURE` (rim profile, ior 1.72, thickness 45, curvature 0.68, edge 0.7, fresnel 1, blur 1, reflection 0.47, shadow 1, lightAngle −124, maxOffset 1.2). Default for every shape and component.
- Presets `control`, `media`, `overlay`, `overlay-dark` keep the same bend (legibility only).
- New: `LGRefraction.autoAttach()` + `data-lg-glass` declarative API, `shapeFromElement()`, `implementations/web/starter/` → `dist/liquid-glass-starter.html` (template for new UIs).
- Fixes: shadow fades out before the canvas edge (no visible box); blur kernel mirror-symmetric; lab backdrop margin so edge cells stay symmetric.
- Skill rewritten around the signature look and "new UI" workflow.
- Tests: refraction 24/24 (SYM tested with light from above; G threshold 3×→2× because the signature magnifies strongly), web 37/37, React 10/10, starter audit clean (6 webgl surfaces, 0 axe, 0 errors).

## 2026-11-18 — signature v2
- User's new sweet spot: ior 1.51, thickness 31, curvature 0.25, edge 0.81, fresnel 0.92, blur 2.5, tint white 11%, reflection 0.41, dispersion 0.015, shadow 0.25, lightAngle 50, maxOffset 0.9 (rim profile). Previous signature kept in tokens as `previousSignature_2026_11_17`.
- `control` preset tint raised 12% → 16% (signature itself is now 11%).
- Test A/B now isolate the bend (blur/tint/dispersion off during that check). Results: refraction 24/24, web 37/37, React 10/10.
