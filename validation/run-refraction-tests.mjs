#!/usr/bin/env node
// Refraction engine (v2) validation — acceptance criteria A–I from the upgrade brief.
// Usage: node run-refraction-tests.mjs [--browser chrome|msedge]   (needs implementations/web/dist/refraction-lab.html)
// Writes results-refraction.json and screenshots/refraction/*.png. Exit 1 on any FAIL.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const channel = process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser') + 1] : 'chrome';
const LAB = pathToFileURL(resolve(here, '../implementations/web/dist/refraction-lab.html')).href;
const DEMO = pathToFileURL(resolve(here, '../implementations/web/dist/liquid-glass-demo.html')).href;
const shots = join(here, 'screenshots/refraction'); mkdirSync(shots, { recursive: true });
const results = [];
const check = (id, name, pass, detail = '') => { results.push({ id, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail ? '  — ' + detail : ''}`); };
const info = (name, detail) => { results.push({ id: 'info', name, pass: true, info: true, detail }); console.log(`INFO  ${name} — ${detail}`); };

const browser = await chromium.launch({ channel });
// GL driver perf notices, and the willReadFrequently hint triggered by THIS test's own getImageData readbacks
const benign = (t) => /GPU stall due to ReadPixels|GL Driver Message|willReadFrequently/.test(t);

async function openLab(query = '', dpr = 2, vp = { width: 1520, height: 1000 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !benign(m.text())) errors.push(m.text()); });
  await page.goto(LAB + query);
  await page.evaluate(() => window.__LAB_READY__);
  await page.waitForTimeout(300);
  return { page, ctx, errors };
}

// in-page helpers: read instance canvas + backdrop canvas pixels for a shape
const HELPERS = () => {
  window.T = {
    grid(i = 0) { return LAB.grids[i]; },
    item(id, gi = 0) { return LAB.grids[gi].items.find((it) => it.s.id === id); },
    // analytic signed distance (css px, negative inside) for primitive shapes
    sd(it, x, y) {
      const w = it.s.w, h = it.s.h, px = x - w / 2, py = y - h / 2, hx = w / 2, hy = h / 2;
      const box = (r) => { r = Math.min(r, hx, hy); const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
      switch (it.s.shape.type) {
        case 'circle': return Math.hypot(px, py) - Math.min(hx, hy);
        case 'ellipse': { const k0 = Math.hypot(px / hx, py / hy), k1 = Math.hypot(px / (hx * hx), py / (hy * hy)); return k0 * (k0 - 1) / k1; }
        case 'rect': return box(0);
        case 'roundedRect': return box(it.s.shape.radius);
        case 'capsule': return box(Math.min(hx, hy));
        default: return null;
      }
    },
    glassPixels(id, gi = 0) {
      const it = T.item(id, gi), c = it.el.querySelector('.lg-gl-canvas');
      return { it, c, data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, dpr: c.width / (it.s.w + 56) };
    },
    backdropAt(gi, cssX, cssY) {
      const g = T.grid(gi), ctx = g.canvas.getContext('2d');
      const d = ctx.getImageData(Math.round(cssX * g.dpr), Math.round(cssY * g.dpr), 1, 1).data; return [d[0], d[1], d[2]];
    },
    // compare glass vs backdrop over the shape: changed fraction in rim band vs centre
    refractionStats(id, gi = 0) {
      const { it, data, w, dpr } = T.glassPixels(id, gi);
      const g = T.grid(gi), bctx = g.canvas.getContext('2d');
      const left = parseFloat(it.el.style.left), top = parseFloat(it.el.style.top);
      const bd = bctx.getImageData(0, 0, g.canvas.width, g.canvas.height).data, bw = g.canvas.width;
      const hmin = Math.min(it.s.w, it.s.h) / 2, W = Math.max(2, LAB.state.material.curvature * hmin);
      let rimN = 0, rimChanged = 0, cenN = 0, cenChanged = 0, inside = 0;
      for (let y = 0; y < it.s.h; y += 1) for (let x = 0; x < it.s.w; x += 1) {
        const ix = Math.round((x + 28) * dpr), iy = Math.round((y + 28) * dpr), i = (iy * w + ix) * 4;
        const a = data[i + 3]; if (a < 250) continue;
        inside++;
        const sd = T.sd(it, x + 0.5, y + 0.5);
        const depth = sd == null ? null : -sd;
        const bx = Math.round((left + x) * g.dpr), by = Math.round((top + y) * g.dpr), j = (by * bw + bx) * 4;
        const diff = Math.abs(data[i] - bd[j]) + Math.abs(data[i + 1] - bd[j + 1]) + Math.abs(data[i + 2] - bd[j + 2]);
        if (depth == null) continue;
        if (depth > 3 && depth < W * 0.8) { rimN++; if (diff > 60) rimChanged++; }
        else if (depth > W * 1.4) { cenN++; if (diff > 60) cenChanged++; }
      }
      return { inside, rim: rimN ? rimChanged / rimN : null, centre: cenN ? cenChanged / cenN : null, rimN, cenN };
    },
    // offset field (debug view 2): direction vs inward normal, magnitude rim vs centre
    offsetStats(id) {
      const { it, data, w, dpr } = T.glassPixels(id);
      const hmin = Math.min(it.s.w, it.s.h) / 2, W = Math.max(2, LAB.state.material.curvature * hmin);
      let n = 0, aligned = 0, cenMax = 0, rimMax = 0;
      for (let y = 2; y < it.s.h - 2; y++) for (let x = 2; x < it.s.w - 2; x++) {
        const ix = Math.round((x + 28) * dpr), iy = Math.round((y + 28) * dpr), i = (iy * w + ix) * 4;
        if (data[i + 3] < 250) continue;
        const ox = data[i] / 255 - 0.5, oy = data[i + 1] / 255 - 0.5, mag = Math.hypot(ox, oy);
        const sd = T.sd(it, x + 0.5, y + 0.5); if (sd == null) continue;
        const e = 0.5, gx = T.sd(it, x + 0.5 + e, y + 0.5) - T.sd(it, x + 0.5 - e, y + 0.5), gy = T.sd(it, x + 0.5, y + 0.5 + e) - T.sd(it, x + 0.5, y + 0.5 - e), gl = Math.hypot(gx, gy) || 1;
        const depth = -sd;
        if (depth > W * 1.3) cenMax = Math.max(cenMax, mag);
        if (depth > 2 && depth < W * 0.9 && mag > 0.02) { rimMax = Math.max(rimMax, mag); n++; if ((ox * -gx + oy * -gy) / (gl * mag) > 0.8) aligned++; }
      }
      return { aligned: n ? aligned / n : 0, n, cenMax, rimMax };
    },
    // normal-map continuity (debug view 1): largest jump between neighbouring pixels away from the outline
    normalJump(id) {
      const { it, data, w, h } = T.glassPixels(id);
      let max = 0, at = null;
      const A = (x, y) => data[(y * w + x) * 4 + 3];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4; if (A(x, y) < 255 || A(x + 1, y) < 255 || A(x, y + 1) < 255 || A(x - 1, y) < 255 || A(x, y - 1) < 255) continue;
        // skip 4 device px next to the outline (antialias + clamped rim)
        let near = false; for (let k = 2; k <= 4 && !near; k++) if (A(x + k, y) < 255 || A(x - k, y) < 255 || A(x, y + k) < 255 || A(x, y - k) < 255) near = true;
        if (near) continue;
        const j1 = i + 4, j2 = i + w * 4;
        const d = Math.max(Math.abs(data[i] - data[j1]) + Math.abs(data[i + 1] - data[j1 + 1]), Math.abs(data[i] - data[j2]) + Math.abs(data[i + 1] - data[j2 + 1]));
        if (d > max) { max = d; at = [x, y]; }
      }
      return { max, at };
    },
    hash(id, gi = 0) { const { data } = T.glassPixels(id, gi); let h = 2166136261; for (let i = 0; i < data.length; i += 7) { h ^= data[i]; h = Math.imul(h, 16777619); } return h >>> 0; },
    sharpness(c, x0, y0, w, h) { const d = c.getContext('2d').getImageData(x0, y0, w, h).data; let s = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const i = (y * w + x) * 4; s += Math.abs(d[i] - d[i + 4]); } return s / (w * h); },
  };
};

// ===================================================================== main lab (Chrome, DPR 2)
const { page, ctx, errors } = await openLab('?bg=checker', 2);
await page.evaluate(HELPERS);
const st = await page.evaluate(() => LGRefraction.stats());
check('S', 'WebGL2 available', !!st, st ? st.renderer : 'none');
const ids = await page.evaluate(() => LAB.shapes.map((s) => s.id));
const analytic = ['circle', 'ellipse', 'rect', 'rounded', 'capsule'];

// screenshots: every background with the new renderer
for (const bg of ['checker', 'lines', 'grid', 'gradient', 'photo', 'moving']) {
  await page.evaluate((b) => { LAB.setBackground(b); if (b === 'moving') LAB.setTime(1.7); }, bg);
  await page.waitForTimeout(250);
  await page.locator('.stage').first().screenshot({ path: join(shots, `new-${bg}.png`) });
}
await page.evaluate(() => { LAB.state.paused = false; LAB.setBackground('checker'); LAB.setParams({ blur: 0 }); });

// C — every shape renders (opaque inside, transparent outside)
const cov = await page.evaluate((ids) => ids.map((id) => { const { data } = T.glassPixels(id); let a = 0, t = 0; for (let i = 3; i < data.length; i += 4) { t++; if (data[i] > 250) a++; } return [id, a / t]; }), ids);
check('C', 'all 8 shapes render (circle, ellipse, rect, rounded rect, capsule, SVG path, hexagon, star)', cov.every(([, f]) => f > 0.15 && f < 0.95), cov.map(([i, f]) => `${i}:${(f * 100).toFixed(0)}%`).join(' '));

// A + B — checkerboard bends at the rim, centre stays undistorted.
// Isolate the bend: blur/tint/dispersion off here (the v2 signature frosts the centre with blur 2.5 + tint by design).
await page.evaluate(() => LAB.setParams({ blur: 0, tint: 'rgba(0,0,0,0)', dispersion: 0 }));
const rs = await page.evaluate((ids) => ids.map((id) => [id, T.refractionStats(id)]), analytic);
check('A', 'checkerboard visibly bends through the glass (rim pixels changed ≥ 30%)', rs.every(([, r]) => r.rim >= 0.3), rs.map(([i, r]) => `${i} rim ${(r.rim * 100).toFixed(0)}%`).join(', '));
check('B1', 'distortion is concentrated at the shape edge (centre changed ≤ 8%)', rs.every(([, r]) => r.centre == null || r.centre <= 0.08), rs.map(([i, r]) => `${i} centre ${r.centre == null ? 'n/a' : (r.centre * 100).toFixed(1) + '%'}`).join(', '));
await page.evaluate(() => LAB.setDebug(2));
await page.waitForTimeout(200);
const os = await page.evaluate((ids) => ids.map((id) => [id, T.offsetStats(id)]), analytic);
check('B2', 'offset direction follows the shape normal (≥ 90% of rim pixels within 37° of inward normal)', os.every(([, o]) => o.aligned >= 0.9), os.map(([i, o]) => `${i} ${(o.aligned * 100).toFixed(1)}% (n=${o.n})`).join(', '));
check('B3', 'flat centre: max offset in centre ≤ 2% of the rim maximum', os.every(([, o]) => o.cenMax <= Math.max(0.01, o.rimMax * 0.02)), os.map(([i, o]) => `${i} c=${o.cenMax.toFixed(3)} r=${o.rimMax.toFixed(3)}`).join(', '));
await page.locator('.stage').first().screenshot({ path: join(shots, 'debug-offset.png') });
await page.evaluate(() => { const S = LGRefraction.SIGNATURE; LAB.setParams({ blur: S.blur, tint: S.tint, dispersion: S.dispersion }); });

// D — no corner discontinuities in the normal field
await page.evaluate(() => LAB.setDebug(1));
await page.waitForTimeout(200);
const nj = await page.evaluate((ids) => ids.map((id) => [id, T.normalJump(id)]), ids);
check('D', 'surface normals continuous inside every shape (max neighbour jump ≤ 48/510)', nj.every(([, n]) => n.max <= 48), nj.map(([i, n]) => `${i}:${n.max}`).join(' '));
await page.locator('.stage').first().screenshot({ path: join(shots, 'debug-normals.png') });
await page.evaluate(() => LAB.setDebug(0));

// SYM — symmetric shapes on a centred symmetric backdrop produce a mirror-identical image (left half == flipped right half)
// lighting from straight above isolates the BEND; the signature light (−124°) is intentionally one-sided
await page.evaluate(() => { LAB.setDebug(0); LAB.setBackground('lines'); LAB.setParams({ lightAngle: -90 }); });
const sym = await page.evaluate((ids) => ids.map((id) => {
  const { data, w, h } = T.glassPixels(id); let n = 0, bad = 0, maxd = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) {
    const i = (y * w + x) * 4, j = (y * w + (w - 1 - x)) * 4; if (data[i + 3] < 250 && data[j + 3] < 250) continue;
    const d = Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) + Math.abs(data[i + 3] - data[j + 3]);
    n++; if (d > 40) bad++; maxd = Math.max(maxd, d);
  }
  return [id, bad / n];
}), ['circle', 'ellipse', 'rect', 'rounded', 'capsule', 'polygon']);
// analytic shapes must be exact (≤ 1%); the hexagon uses a rasterised distance-field texture, allowed ≤ 2%
check('SYM', 'bend is left/right mirror-symmetric on a centred backdrop, light from above (analytic ≤ 1%, polygon ≤ 2% of pixels differ > 40/1020)', sym.every(([id, f]) => f <= (id === 'polygon' ? 0.02 : 0.01)), sym.map(([i, f]) => `${i}:${(f * 100).toFixed(2)}%`).join(' '));
await page.locator('.stage').first().screenshot({ path: join(shots, 'symmetry-lines.png') });
await page.evaluate(() => { LAB.setBackground('checker'); LAB.setParams({ lightAngle: LGRefraction.SIGNATURE.lightAngle }); });

// F — every material parameter changes the output of every shape
const params = { refraction: 1.7, ior: 1.9, thickness: 34, curvature: 0.85, edge: 1.3, fresnel: 0.2, blur: 6, reflection: 0.8, tint: 'rgba(255,60,120,0.3)' };
const defaults = await page.evaluate(() => ({ ...LAB.state.material }));
const fRes = [];
for (const [k, v] of Object.entries(params)) {
  const before = await page.evaluate((ids) => ids.map((id) => T.hash(id)), ids);
  await page.evaluate(([k, v]) => LAB.setParams({ [k]: v }), [k, v]);
  const after = await page.evaluate((ids) => ids.map((id) => T.hash(id)), ids);
  const changed = before.filter((h, i) => h !== after[i]).length;
  fRes.push(`${k}:${changed}/${ids.length}`);
  await page.evaluate(([k, v]) => LAB.setParams({ [k]: v }), [k, defaults[k]]);
}
check('F', 'all shapes respond to each material parameter', fRes.every((s) => s.endsWith(`${ids.length}/${ids.length}`)), fRes.join(' '));

// E — moving background stays synchronised (glass centre == backdrop pixel in the same frame)
await page.evaluate(() => { LAB.setParams({ tint: 'rgba(0,0,0,0)', fresnel: 0, reflection: 0, edge: 0, dispersion: 0, blur: 0, shadow: 0 }); LAB.setBackground('moving'); });
const sync = [];
for (const t of [0.4, 1.1, 2.9, 5.3]) {
  const r = await page.evaluate((t) => {
    LAB.setTime(t);
    const out = [];
    for (const id of ['circle', 'rounded', 'capsule']) {
      const { it, data, w, dpr } = T.glassPixels(id);
      let maxd = 0;
      for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55]]) {
        const x = it.s.w * fx, y = it.s.h * fy, i = (Math.round((y + 28) * dpr) * w + Math.round((x + 28) * dpr)) * 4;
        const b = T.backdropAt(0, parseFloat(it.el.style.left) + x, parseFloat(it.el.style.top) + y);
        maxd = Math.max(maxd, Math.abs(data[i] - b[0]) + Math.abs(data[i + 1] - b[1]) + Math.abs(data[i + 2] - b[2]));
      }
      out.push(maxd);
    }
    return out;
  }, t);
  sync.push(Math.max(...r));
}
check('E1', 'moving backdrop synchronised at 4 timestamps (centre colour delta ≤ 60/765)', sync.every((d) => d <= 60), sync.join(', '));
// live animation: sample while the lab animates in real time
await page.evaluate(() => { LAB.state.paused = false; });
await page.waitForTimeout(500);
const live = await page.evaluate(() => new Promise((res) => {
  const vals = []; let n = 0;
  const f = () => { requestAnimationFrame(() => { const { it, data, w, dpr } = T.glassPixels('circle'); const x = it.s.w / 2, y = it.s.h / 2; const i = (Math.round((y + 28) * dpr) * w + Math.round((x + 28) * dpr)) * 4; const b = T.backdropAt(0, parseFloat(it.el.style.left) + x, parseFloat(it.el.style.top) + y); vals.push(Math.abs(data[i] - b[0]) + Math.abs(data[i + 1] - b[1]) + Math.abs(data[i + 2] - b[2])); if (++n < 30) f(); else res(vals); }); };
  f();
}));
check('E2', 'live animation: glass centre matches backdrop on 30 consecutive frames', live.filter((d) => d > 60).length === 0, `max delta ${Math.max(...live)}; frames over threshold ${live.filter((d) => d > 60).length}/30`);
await page.evaluate(() => { LAB.state.paused = true; LAB.setParams({ ...window.LGRefraction.DEFAULT_MATERIAL }); LAB.setBackground('checker'); });

// G — refraction is not blur: crisp edges survive inside the glass, and differ from the blur-only renderer
await page.evaluate(() => { LAB.setMode('compare-blur'); LAB.setParams({ blur: 0 }); });  // G compares pure refraction with pure blur
await page.waitForTimeout(500);
await page.evaluate(HELPERS);
await page.screenshot({ path: join(shots, 'compare-blur-vs-new.png'), fullPage: true });
const gstats = await page.evaluate(() => {
  const g = LAB.grids[1], it = g.items.find((i) => i.s.id === 'rounded');
  const c = it.el.querySelector('.lg-gl-canvas'), dpr = c.width / (it.s.w + 56);
  const sharpGlass = T.sharpness(c, Math.round(40 * dpr), Math.round(40 * dpr), Math.round((it.s.w - 24) * dpr), Math.round((it.s.h - 24) * dpr) * 0 + Math.round(30 * dpr));
  return { sharpGlass };
});
const blurBox = await page.locator('.grid-wrap').nth(0).locator('.lab-glass[data-shape=rounded]').boundingBox();
const newBox = await page.locator('.grid-wrap').nth(1).locator('.lab-glass[data-shape=rounded]').boundingBox();
const crop = (b) => ({ x: b.x + 12, y: b.y + 12, width: b.width - 24, height: b.height - 24 });
const pngBlur = await page.screenshot({ clip: crop(blurBox) });
const pngNew = await page.screenshot({ clip: crop(newBox) });
const gdiff = await page.evaluate(async ([a, b]) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const x = c.getContext('2d');
  const sharp = (img) => { x.clearRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length - 4; i += 4) s += Math.abs(d[i] - d[i + 4]); return { s: s / (d.length / 4), d }; };
  const A = sharp(ia), B = sharp(ib); let n = 0; for (let i = 0; i < A.d.length; i += 4) if (Math.abs(A.d[i] - B.d[i]) > 40) n++;
  return { sharpBlur: A.s.toFixed(1), sharpNew: B.s.toFixed(1), differ: (n / (A.d.length / 4)).toFixed(2) };
}, [`data:image/png;base64,${pngBlur.toString('base64')}`, `data:image/png;base64,${pngNew.toString('base64')}`]);
// threshold lowered from 3× to 2× on 2026-11-17: the signature preset magnifies strongly, which lowers edge density
check('G', 'refraction is visibly distinct from backdrop blur (≥ 2× edge sharpness and ≥ 30% pixels differ)', +gdiff.sharpNew >= 2 * +gdiff.sharpBlur && +gdiff.differ >= 0.3, JSON.stringify(gdiff));

// side-by-side old vs new for every background
await page.evaluate(() => LAB.setMode('compare'));
for (const bg of ['checker', 'lines', 'photo']) {
  await page.evaluate((b) => LAB.setBackground(b), bg);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, `compare-old-vs-new-${bg}.png`), fullPage: true });
}

// resize: element width change → canvas follows
await page.evaluate(() => LAB.setMode('webgl'));
await page.evaluate(HELPERS);
const rz = await page.evaluate(async () => { const it = T.item('capsule'); it.el.style.width = '180px'; await new Promise((r) => setTimeout(r, 150)); LGRefraction.renderNow(); const c = it.el.querySelector('.lg-gl-canvas'); const dpr = Math.min(devicePixelRatio, 3); const ok = c.width === Math.round((180 + 56) * dpr); it.el.style.width = it.s.w + 'px'; return { ok, w: c.width }; });
check('R', 'resize: render target follows element size', rz.ok, JSON.stringify(rz));
// scroll: page scroll moves glass + backdrop together → identical output
const before = await page.evaluate(() => T.hash('rounded'));
await page.setViewportSize({ width: 1100, height: 520 });
await page.evaluate(async () => { document.querySelector('main').scrollTop = 220; document.querySelector('main').scrollLeft = 160; await new Promise((r) => setTimeout(r, 120)); LGRefraction.renderNow(); });
const afterScroll = await page.evaluate(() => T.hash('rounded'));
check('SC', 'scroll: output unchanged when glass and backdrop scroll together', before === afterScroll, `${before} vs ${afterScroll}`);
await page.setViewportSize({ width: 1520, height: 1000 });

// sizes: tiny to large component
const sizes = await page.evaluate(async () => {
  const c = LAB.grids[0].canvas, host = LAB.grids[0].canvas.parentElement, out = [];
  for (const [w, h] of [[24, 24], [44, 44], [600, 200]]) {
    const el = document.createElement('div'); el.style.cssText = `position:absolute;left:10px;top:10px;width:${w}px;height:${h}px`; host.append(el);
    const g = LGRefraction.attach(el, { backdrop: c, shape: { type: 'roundedRect', radius: Math.min(w, h) / 2 } });
    LGRefraction.renderNow(); const cv = el.querySelector('.lg-gl-canvas'); out.push(`${w}x${h}:${cv && cv.width > 0 ? 'ok' : 'fail'}`); g.destroy(); el.remove();
  }
  return out;
});
check('SZ', 'component sizes 24px, 44px, 600px render', sizes.every((s) => s.endsWith('ok')), sizes.join(' '));

// performance (software GL in this environment — not a GPU measurement)
const perf = await page.evaluate(async () => {
  LAB.setBackground('moving'); LAB.state.paused = false;
  const t = []; for (let i = 0; i < 90; i++) { const a = performance.now(); LAB.redraw(); t.push(performance.now() - a); await new Promise((r) => requestAnimationFrame(r)); }
  t.sort((a, b) => a - b);
  const d = [], r = [];
  for (let i = 0; i < 40; i++) { let a = performance.now(); LAB.grids.forEach((g) => { const c = g.canvas.getContext('2d'); }); LAB.state.time += 0.016; a = performance.now(); LAB.grids[0] && (() => { const s = LAB.state.bg; })(); 
    const t0 = performance.now(); for (const g of LAB.grids) { /* draw only */ const ctx = g.canvas.getContext('2d'); ctx.setTransform(g.dpr,0,0,g.dpr,0,0); }
    LAB.redraw(); const t1 = performance.now(); LGRefraction.renderNow(); const t2 = performance.now(); d.push(t1 - t0); r.push(t2 - t1); await new Promise((q) => requestAnimationFrame(q)); }
  d.sort((a, b) => a - b); r.sort((a, b) => a - b);
  LAB.state.paused = true;
  return { engineOnlyMedian: r[20].toFixed(1), median: t[45].toFixed(1), p95: t[85].toFixed(1), instances: LGRefraction.stats().instances, renderer: LGRefraction.stats().renderer };
});
info('CPU-side frame cost, 8 instances, moving backdrop (draw + upload + render + copy), DPR 2', `median ${perf.median} ms, p95 ${perf.p95} ms; engine-only re-render (no backdrop change) ${perf.engineOnlyMedian} ms; on ${perf.renderer} — software rasterizer here; real GPU numbers must come from a real machine`);

check('ERR', 'no page errors / warnings in lab run (GL driver perf notices excluded)', errors.length === 0, errors.slice(0, 3).join(' | '));
await ctx.close();

// ===================================================================== DPR 1
{
  const { page, ctx, errors } = await openLab('?bg=lines', 1);
  await page.evaluate(HELPERS);
  const r = await page.evaluate(() => { const c = T.item('circle').el.querySelector('.lg-gl-canvas'); return { w: c.width, rs: T.refractionStats('circle') }; });
  check('DPR', 'DPR 1: canvas at 1× and bending present', r.w === 150 + 56 && r.rs.rim > 0.3, JSON.stringify({ w: r.w, rim: r.rs.rim.toFixed(2) }));
  await page.locator('.stage').first().screenshot({ path: join(shots, 'dpr1-lines.png') });
  check('ERR1', 'no errors at DPR 1', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ===================================================================== fallbacks
{
  const { page, ctx, errors } = await openLab('?nowebgl&bg=checker', 1);
  const fb = await page.evaluate(() => [...document.querySelectorAll('.lab-glass')].map((e) => `${e.dataset.lgRenderer}/${e.dataset.lgFallbackReason}`));
  check('FB1', 'no WebGL2 → every surface falls back (v1 SVG / blur), no errors', fb.every((s) => s === 'fallback/no-webgl2') && errors.length === 0, `${fb[0]} ×${fb.length}; errors=${errors.length}`);
  await page.locator('.stage').first().screenshot({ path: join(shots, 'fallback-nowebgl.png') });
  await ctx.close();
}
{
  const { page, ctx } = await openLab('?renderer=svg&bg=checker', 1);
  const fb = await page.evaluate(() => [...document.querySelectorAll('.lab-glass')].map((e) => `${e.dataset.lgRenderer}/${e.dataset.lgFallbackReason}/${e.hasAttribute('data-lg-refract')}`));
  check('FB2', 'rollback switch ?renderer=svg → v1 SVG refraction on every surface', fb.every((s) => s === 'fallback/forced-svg/true'), fb[0]);
  await ctx.close();
}
{
  const { page, ctx } = await openLab('?bg=checker', 1);
  const a = await page.evaluate(() => { document.documentElement.setAttribute('data-lg-rt', ''); LGRefraction.refresh(); const r = [...document.querySelectorAll('.lab-glass')].map((e) => e.dataset.lgFallbackReason); document.documentElement.removeAttribute('data-lg-rt'); LGRefraction.refresh(); const back = [...document.querySelectorAll('.lab-glass')].map((e) => e.dataset.lgRenderer); return { r, back }; });
  check('A11Y1', 'Reduce Transparency → WebGL glass disabled; restored when cleared', a.r.every((x) => x === 'accessibility') && a.back.every((x) => x === 'webgl'), JSON.stringify({ off: a.r[0], on: a.back[0] }));
  await page.emulateMedia({ contrast: 'more' });
  await page.waitForTimeout(100);
  const ic = await page.evaluate(() => { LGRefraction.refresh(); return [...document.querySelectorAll('.lab-glass')].map((e) => e.dataset.lgRenderer); });
  check('A11Y2', 'prefers-contrast: more → WebGL glass disabled', ic.every((x) => x === 'fallback'), ic[0]);
  await ctx.close();
}

// ===================================================================== H — existing demo still works with v2 integrated
{
  const ctx = await browser.newContext({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errs.push(m.text()); });
  await page.goto(DEMO); await page.evaluate(() => window.__LG_READY__); await page.waitForTimeout(500);
  const media = await page.evaluate(() => document.getElementById('media-controls').dataset.lgRenderer);
  await page.click('#play');
  const play = await page.getAttribute('#play', 'aria-pressed');
  await page.locator('#tabs [role=tab]').nth(2).click();
  const tab = await page.locator('#tabs [role=tab]').nth(2).getAttribute('aria-selected');
  await page.click('#more'); await page.waitForTimeout(400);
  const menu = await page.evaluate(() => !document.getElementById('menu').hidden);
  await page.keyboard.press('Escape');
  check('H', 'demo controls still work with v2 glass on media controls (play, tabs, menu)', media === 'webgl' && play === 'false' && tab === 'true' && menu && errs.length === 0, JSON.stringify({ media, play, tab, menu, errs: errs.length }));
  await page.locator('main.phone').screenshot({ path: join(shots, 'demo-media-controls-webgl.png') });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync(join(here, `results-refraction-${channel}.json`), JSON.stringify({ date: new Date().toISOString(), browser: channel, headless: true, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed (${channel})`);
process.exit(failed.length ? 1 : 0);
