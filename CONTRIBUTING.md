# Contributing

1. `npm run setup:tests` once, then `npm run build`.
2. Engine code: `implementations/web/src/liquid-glass-refraction.js`. Tokens: `design-system/tokens/tokens.json` (run `npm run build` to regenerate CSS/TS/Swift).
3. Tune looks in the Refraction Lab (`implementations/web/dist/refraction-lab.html`) and paste the copied JSON into a preset.
4. Run `npm test` (and `npm run test:react` if you touched React). Keep every check green; explain any threshold change in the test file.
5. Never claim results you did not run (browsers, GPUs, Apple devices). Note limits in `research/unknowns-and-limitations.md`.
6. Keep glass off the content layer and never stack glass on glass (see `design-system/SPEC.md`).
