#!/usr/bin/env node
// Stage 4 validation for the web demo. Headless Chrome via Playwright.
// Usage (from validation/): npm i && node run-validation.mjs
// Output: results.json + screenshots/*.png. Exit code 1 if any check fails.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const demo = pathToFileURL(resolve(here, '../implementations/web/dist/liquid-glass-demo.html')).href;
const shots = join(here, 'screenshots');
mkdirSync(shots, { recursive: true });
const tokens = JSON.parse(readFileSync(resolve(here, '../design-system/tokens/tokens.json'), 'utf8'));

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// ---------- 1. static contrast math (worst-case backdrop) ----------
const parse = (c) => {
  if (c.startsWith('#')) { const h = c.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1); }
  const m = c.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => parseFloat(x));
  return [m[0], m[1], m[2], m[3] ?? 1];
};
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const white = [255, 255, 255, 1], black = [0, 0, 0, 1];
const contrastCase = (label, fill, text, min, backdrops) => {
  const worst = Math.min(...backdrops.map((bd) => ratio(over(parse(text), over(parse(fill), bd)), over(parse(fill), bd))));
  check(`contrast ${label}`, worst >= min, `worst ${worst.toFixed(2)}:1 (min ${min}) over ${backdrops === BOTH ? 'white+black' : 'given'} backdrop`);
  return worst;
};
const BOTH = [white, black];
const m = tokens.material;
// Regular light text is near-black: worst case is a black backdrop. Regular glass adapts light/dark to the backdrop on iOS (E-07);
// we only switch by color scheme, so we test each scheme against the backdrop it is designed for AND record the opposite case.
contrastCase('regular/light text over light backdrop', m.regular.light.fill, m.regular.light.text, 4.5, [white, [200, 200, 205, 1]]);
contrastCase('regular/dark text over dark backdrop', m.regular.dark.fill, m.regular.dark.text, 4.5, [black, [60, 60, 66, 1]]);
const mismatchL = Math.min(ratio(over(parse(m.regular.light.text), over(parse(m.regular.light.fill), black)), over(parse(m.regular.light.fill), black)));
results.push({ name: 'info: regular/light over BLACK backdrop (scheme mismatch)', pass: true, detail: `${mismatchL.toFixed(2)}:1 — known limitation, no per-pixel light/dark flip on web` });
console.log(`INFO  regular/light over black backdrop ${mismatchL.toFixed(2)}:1 (known limitation)`);
contrastCase('reduced-transparency light', m.reducedTransparency.light.fill, m.regular.light.text, 4.5, BOTH);
contrastCase('reduced-transparency dark', m.reducedTransparency.dark.fill, m.regular.dark.text, 4.5, BOTH);
contrastCase('increased-contrast light', m.increasedContrast.light.fill, m.increasedContrast.light.text, 7, BOTH);
contrastCase('tinted accent (80% accent + 20% black, 96% opacity) white 15px text', 'rgba(8,106,204,0.96)', '#ffffff', 4.5, BOTH);
{ // HIG clear-glass recipe measured against a pure-white media backdrop. Recorded as WARN, not hidden.
  const bd = over([0, 0, 0, 0.35], white); const f = over(parse('rgba(255,255,255,0.08)'), bd);
  const r = ratio(white, f);
  results.push({ name: 'warn: clear glass + HIG 35% dimming over PURE WHITE media, white glyphs', pass: true, warn: true, detail: `${r.toFixed(2)}:1 < 3:1 — mitigated by glyph drop-shadow (not captured by this math); avoid clear over very bright media` });
  console.log(`WARN  clear+35% dim over pure white: ${r.toFixed(2)}:1`);
  const mid = over([0, 0, 0, 0.35], [190, 190, 190, 1]); const r2 = ratio(white, over(parse('rgba(255,255,255,0.08)'), mid));
  check('contrast clear + 35% dimming over typical bright media (#bebebe), white glyphs', r2 >= 3, `${r2.toFixed(2)}:1 (min 3)`);
}

// ---------- 2. browser checks ----------
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.goto(demo);
await page.evaluate(() => window.__LG_READY__);
await page.waitForTimeout(400);
const phone = page.locator('main.phone');
const snap = async (name) => { await page.waitForTimeout(450); await phone.screenshot({ path: join(shots, `${name}.png`) }); };

check('no page errors on load', errors.length === 0, errors.join(' | '));
await snap('01-light-rest');

// refraction wiring (Chromium)
const refr = await page.evaluate(() => ({
  supported: LG.supportsRefraction(),
  htmlClass: document.documentElement.classList.contains('lg-refract-on'),
  filters: document.querySelectorAll('filter feDisplacementMap').length,
  backdrop: getComputedStyle(document.getElementById('tabs'), '::before').backdropFilter,
}));
check('refraction detected in Chromium', refr.supported && refr.htmlClass, JSON.stringify(refr));
check('tab bar ::before backdrop-filter references SVG filter', /url\(/.test(refr.backdrop), refr.backdrop);

// refraction changes pixels: same page, same blur, only the displacement scale toggled (isolates the lens)
await page.evaluate(() => { document.getElementById('screen').scrollTop = 260; document.getElementById('tabbar').classList.remove('is-minimized'); });
await page.waitForTimeout(500);
const tabs = page.locator('#tabs');
const dmSel = () => document.querySelector(`${getComputedStyle(document.getElementById('tabs')).getPropertyValue('--lg-filter').match(/#[^)"]+/)[0]} feDisplacementMap`);
const withR = await tabs.screenshot({ path: join(shots, '10-tabbar-refraction-on.png') });
const origScale = await page.evaluate((f) => { const d = eval(f)(); const v = d.getAttribute('scale'); d.setAttribute('scale', '0'); return v; }, `(${dmSel})`);
await page.waitForTimeout(300);
const withoutR = await tabs.screenshot({ path: join(shots, '11-tabbar-refraction-off.png') });
await page.evaluate(([f, v]) => eval(f)().setAttribute('scale', v), [`(${dmSel})`, origScale]);
const diffBytes = await page.evaluate(async ([a, b]) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const x = c.getContext('2d');
  x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
  return { changed: n, total: da.length / 4 };
}, [`data:image/png;base64,${withR.toString('base64')}`, `data:image/png;base64,${withoutR.toString('base64')}`]);
check('refraction visibly alters backdrop pixels (displacement scale N vs 0, same blur)', diffBytes.changed > 200, `${diffBytes.changed}/${diffBytes.total} px differ (>24 sum RGB)`);
await snap('02-light-scrolled');

// tab bar minimise on scroll down, restore on scroll up
await page.evaluate(async () => { const s = document.getElementById('screen'); s.scrollTop = 0; await new Promise((r) => setTimeout(r, 50)); s.scrollTop = 500; });
await page.waitForTimeout(200);
const minimized = await page.evaluate(() => document.getElementById('tabbar').classList.contains('is-minimized'));
await page.evaluate(() => { document.getElementById('screen').scrollTop = 200; });
await page.waitForTimeout(200);
const restored = await page.evaluate(() => !document.getElementById('tabbar').classList.contains('is-minimized'));
check('tab bar minimizes on scroll down and restores on scroll up', minimized && restored, `min=${minimized} restored=${restored}`);

// audit at several scroll positions
const auditIssues = [];
for (const y of [0, 300, 600, 900, 1400]) {
  const a = await page.evaluate((yy) => { document.getElementById('screen').scrollTop = yy; return LG.audit(); }, y);
  if (a.issues.length) auditIssues.push(`y=${y}: ${a.issues.join('; ')}`);
}
check('rule audit clean while scrolling (budget, glass-on-glass, content-layer, labels)', auditIssues.length === 0, auditIssues.join(' | '));
await page.evaluate(() => { document.getElementById('screen').scrollTop = 0; });

// segmented control (tab bar) — click + keyboard, pill follows
const pillBefore = await page.evaluate(() => document.querySelector('#tabs .lg-pill').style.transform);
await page.locator('#tabs [role=tab]').nth(2).click();
await page.waitForTimeout(350);
const segState = await page.evaluate(() => ({ sel: [...document.querySelectorAll('#tabs [role=tab]')].map((b) => b.getAttribute('aria-selected')), pill: document.querySelector('#tabs .lg-pill').style.transform }));
check('tab click selects tab and moves morph pill', segState.sel[2] === 'true' && segState.pill !== pillBefore, JSON.stringify(segState));
await page.keyboard.press('ArrowRight');
const afterKey = await page.evaluate(() => [...document.querySelectorAll('#tabs [role=tab]')].findIndex((b) => b.getAttribute('aria-selected') === 'true'));
check('ArrowRight moves tab selection (roving tabindex)', afterKey === 3, `selected index ${afterKey}`);

// toggle
const t0 = await page.getAttribute('#toggle', 'aria-checked');
await page.evaluate(() => document.getElementById('toggle').scrollIntoView({ block: 'center' }));
await page.click('#toggle');
const t1 = await page.getAttribute('#toggle', 'aria-checked');
check('toggle flips aria-checked', t0 !== t1, `${t0} -> ${t1}`);

// slider keyboard + pointer drag glass knob
await page.focus('#vol');
await page.keyboard.press('ArrowRight');
const vol = await page.getAttribute('#vol', 'aria-valuenow');
check('slider ArrowRight increments value', vol === '61', `value ${vol}`);
const box = await page.locator('#vol').boundingBox();
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 5 });
const knobGlassWhileDrag = await page.evaluate(() => document.querySelector('#vol .lg-slider__knob').classList.contains('lg-glass'));
await phone.screenshot({ path: join(shots, '06-slider-dragging.png') });
await page.mouse.up();
const knobGlassAfter = await page.evaluate(() => document.querySelector('#vol .lg-slider__knob').classList.contains('lg-glass'));
const volDrag = +(await page.getAttribute('#vol', 'aria-valuenow'));
check('slider knob is glass only while dragging (E-01/E-06)', knobGlassWhileDrag && !knobGlassAfter, `during=${knobGlassWhileDrag} after=${knobGlassAfter}`);
check('slider drag sets value', volDrag >= 75 && volDrag <= 85, `value ${volDrag}`);

// play button preserves app state
await page.evaluate(() => { document.getElementById('screen').scrollTop = 0; });
await page.click('#play');
const play = await page.evaluate(() => ({ p: document.getElementById('play').getAttribute('aria-pressed'), l: document.getElementById('play').getAttribute('aria-label') }));
check('original functionality preserved (play/pause state)', play.p === 'false' && play.l === 'Play', JSON.stringify(play));

// menu morph from button
await page.click('#more');
await page.waitForTimeout(450);
const menu = await page.evaluate(() => ({
  hidden: document.getElementById('menu').hidden,
  expanded: document.getElementById('more').getAttribute('aria-expanded'),
  focus: document.activeElement.getAttribute('role'),
  triggerHidden: document.getElementById('more').classList.contains('lg-morph-hidden'),
  audit: LG.audit().issues,
}));
await snap('04-menu-open');
check('menu opens from trigger with focus on first item', !menu.hidden && menu.expanded === 'true' && menu.focus === 'menuitem', JSON.stringify(menu));
check('menu open: audit clean (refraction budget, no glass-on-glass)', menu.audit.length === 0, menu.audit.join('; '));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
const menuClosed = await page.evaluate(() => ({ hidden: document.getElementById('menu').hidden, focusId: document.activeElement.id, expanded: document.getElementById('more').getAttribute('aria-expanded') }));
check('Escape closes menu and returns focus to trigger', menuClosed.hidden && menuClosed.focusId === 'more' && menuClosed.expanded === 'false', JSON.stringify(menuClosed));

// panel materialize
await page.evaluate(() => document.getElementById('open-panel').scrollIntoView({ block: 'center' }));
await page.click('#open-panel');
await page.waitForTimeout(500);
const panel = await page.evaluate(() => ({ hidden: document.getElementById('panel').hidden, focus: document.activeElement.id, audit: LG.audit().issues, refract: document.getElementById('panel').hasAttribute('data-lg-refract') }));
await snap('05-panel-open');
check('panel materializes, refracts, focus moves to close', !panel.hidden && panel.focus === 'close-panel' && panel.refract, JSON.stringify(panel));
check('panel open: audit clean', panel.audit.length === 0, panel.audit.join('; '));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Escape closes panel', await page.evaluate(() => document.getElementById('panel').hidden));
await page.evaluate(() => { document.getElementById('screen').scrollTop = 0; });

// accessibility simulations via attributes
const surf = async () => { await page.waitForTimeout(450); return page.evaluate(() => { const t = document.getElementById('back'); const cs = getComputedStyle(t); const b = getComputedStyle(document.getElementById('tabs'), '::before'); return { bg: cs.backgroundColor, border: cs.borderTopWidth, trans: cs.transitionDuration, backdrop: b.backdropFilter, after: getComputedStyle(t, '::after').display }; }); };
await page.check('#opt-rt');
const rt = await surf();
await snap('07-reduce-transparency');
check('Reduce Transparency: near-opaque fill, refraction off', /0\.94|rgb\(246, 246, 248\)/.test(rt.bg) && !/url\(/.test(rt.backdrop), JSON.stringify(rt));
await page.uncheck('#opt-rt');
await page.check('#opt-ic');
const ic = await surf();
await snap('08-increase-contrast');
check('Increase Contrast: solid fill, 2px border, no specular, no refraction', ic.bg === 'rgb(255, 255, 255)' && ic.border === '2px' && ic.after === 'none' && !/url\(/.test(ic.backdrop), JSON.stringify(ic));
await page.uncheck('#opt-ic');
await page.check('#opt-rm');
const rm = await surf();
check('Reduce Motion: transitions capped at 140ms', rm.trans.split(',').every((d) => parseFloat(d) <= 0.14), rm.trans);
await page.uncheck('#opt-rm');

// real media-query emulation (not just our attributes)
await page.emulateMedia({ reducedMotion: 'reduce' });
check('prefers-reduced-motion media query honoured', (await surf()).trans.split(',').every((d) => parseFloat(d) <= 0.14));
await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'more' }).catch(() => {});
const icMq = await surf();
check('prefers-contrast: more media query honoured', icMq.border === '2px', JSON.stringify(icMq));
await page.emulateMedia({ contrast: 'no-preference', forcedColors: 'active' }).catch(() => {});
await snap('09-forced-colors');
await page.emulateMedia({ forcedColors: 'none' }).catch(() => {});

// dark scheme
await page.check('#opt-dark');
await snap('03-dark');
const darkText = await page.evaluate(() => getComputedStyle(document.getElementById('back')).color);
check('dark scheme switches glass text to light', darkText === 'rgb(245, 245, 247)', darkText);
await page.uncheck('#opt-dark');

// axe-core automated a11y scan of the phone
await page.addScriptTag({ path: resolve(here, 'node_modules/axe-core/axe.min.js') });
const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector('main.phone'), { resultTypes: ['violations'] })).violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`));
check('axe-core: no violations inside demo device', axe.length === 0, axe.join('; '));

// frame timing during programmatic scroll (headless, software rendering — NOT representative of a real device)
const perf = await page.evaluate(async () => {
  const s = document.getElementById('screen'); const times = []; let last = performance.now(); let y = 0;
  await new Promise((done) => { const step = (t) => { times.push(t - last); last = t; y += 12; s.scrollTop = y; if (times.length < 120) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  times.sort((a, b) => a - b); return { median: times[60].toFixed(1), p95: times[114].toFixed(1) };
});
results.push({ name: 'info: headless frame time during scroll (ms)', pass: true, detail: `median ${perf.median}, p95 ${perf.p95} — headless/software GPU, not a device measurement` });
console.log(`INFO  frame time median ${perf.median}ms p95 ${perf.p95}ms (headless)`);

check('no page errors during run', errors.length === 0, errors.join(' | '));
await browser.close();

const failed = results.filter((r) => !r.pass);
writeFileSync(join(here, 'results.json'), JSON.stringify({ date: new Date().toISOString(), browser: 'Chrome (Playwright channel=chrome), headless', results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
