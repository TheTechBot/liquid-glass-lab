#!/usr/bin/env node
// Tests for the Apple-shaped API (implementations/web/src/liquid-glass-effect.js) via dist/liquid-glass-effect-demo.html.
// Headless Chrome + SwiftShader: checks behaviour and geometry, not Apple parity.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(here, '../implementations/web/dist/liquid-glass-effect-demo.html');
const results = []; const check = (id, name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${info ? '  — ' + info : ''}`); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, ...opts });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(1200); return { p, errs, ctx };
}
{
  const { p, errs } = await page();
  const r = await p.evaluate(() => ({
    surfaces: [...document.querySelectorAll('.lgx-surface')].map((s) => s.getAttribute('data-lg-renderer')),
    single: [...document.querySelectorAll('.chip,.tabs')].map((s) => s.getAttribute('data-lg-renderer')),
    itemsHaveOwnCanvas: [...document.querySelectorAll('[data-glass-container] [data-glass]')].some((e) => e.querySelector(':scope>.lg-gl-canvas')),
  }));
  check('G1', 'every container renders ONE WebGL surface', r.surfaces.length === 3 && r.surfaces.every((x) => x === 'webgl'), JSON.stringify(r.surfaces));
  check('G2', 'standalone glassEffect elements render with WebGL', r.single.every((x) => x === 'webgl'), JSON.stringify(r.single));
  check('G3', 'no glass-on-glass: items inside a container have no own canvas', !r.itemsHaveOwnCanvas);
  const fuse = await p.evaluate(() => {
    const s = document.querySelector('.toolbar [data-glass-container] .lgx-surface').__lgRefraction.opts.shape;
    const [a, b] = s.rects; const mx = (a.x + a.w + b.x) / 2, my = a.y + a.h / 2;
    return { gap: Math.round(b.x - a.x - a.w), k: s.k, inside: window.LGRefraction.buildShapeSdf(s, 10, 10, 2) && null, mx, my, rects: s.rects };
  });
  const d = await p.evaluate(({ mx, my }) => {
    const s = document.querySelector('.toolbar [data-glass-container] .lgx-surface').__lgRefraction.opts.shape;
    // same smooth-union maths as the engine
    const sd = (px, py, q) => { const r = Math.min(q.r, q.w / 2, q.h / 2), qx = Math.abs(px - q.x - q.w / 2) - q.w / 2 + r, qy = Math.abs(py - q.y - q.h / 2) - q.h / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
    const sm = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
    return sm(sd(mx, my, s.rects[0]), sd(mx, my, s.rects[1]), s.k);
  }, fuse);
  check('G4', 'GlassEffectContainer(spacing:12) fuses items 10 px apart (bridge inside the shape)', d < 0, `gap ${fuse.gap}px, field at midpoint ${d.toFixed(2)}`);
  const morph = await p.evaluate(async () => {
    const tg = document.querySelector('.toggle').getBoundingClientRect();
    document.querySelector('.toggle').click();
    await new Promise((r) => setTimeout(r, 20));
    const a = document.querySelector('.a-rotate').getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 900));
    const b = document.querySelector('.a-rotate').getBoundingClientRect();
    const rects = document.querySelector('#actions .lgx-surface').__lgRefraction.opts.shape.rects.length;
    return { startDist: Math.hypot(a.left + a.width / 2 - tg.left - tg.width / 2, a.top + a.height / 2 - tg.top - tg.height / 2), endDist: Math.hypot(b.left + b.width / 2 - tg.left - tg.width / 2, b.top + b.height / 2 - tg.top - tg.height / 2), rects };
  });
  check('M1', 'new glass grows out of the toggle (glassEffectID morph)', morph.startDist < 25 && morph.endDist > 60, `start ${morph.startDist.toFixed(1)}px → end ${morph.endDist.toFixed(1)}px`);
  check('M2', 'container surface includes all 5 shapes after expanding', morph.rects === 5, `${morph.rects}`);
  const coll = await p.evaluate(async () => {
    document.querySelector('.toggle').click();
    await new Promise((r) => setTimeout(r, 60));
    const mid = document.querySelector('#actions .lgx-surface').__lgRefraction.opts.shape.rects.length;
    await new Promise((r) => setTimeout(r, 900));
    const end = document.querySelector('#actions .lgx-surface').__lgRefraction.opts.shape.rects.length;
    return { mid, end };
  });
  check('M3', 'removed glass is absorbed (phantoms during collapse, 1 shape after)', coll.mid > 1 && coll.end === 1, JSON.stringify(coll));
  const id = await p.evaluate(async () => { const b = document.getElementById('idbtn'); b.click(); await new Promise((r) => setTimeout(r, 100)); const off = b.getAttribute('data-lg-renderer'); b.click(); await new Promise((r) => setTimeout(r, 200)); return { off, on: b.getAttribute('data-lg-renderer') }; });
  check('V1', '.identity removes glass, .regular brings it back', id.off === null && id.on === 'webgl', JSON.stringify(id));
  const inter = await p.evaluate(async () => {
    const b = document.querySelector('.chip'); const r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10 }));
    await new Promise((x) => setTimeout(x, 300));
    const s = b.getBoundingClientRect().width / r.width, illum = getComputedStyle(b.querySelector('.lgx-illum')).opacity;
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { s, illum };
  });
  check('I1', '.interactive(): press scales up and lights up under the finger', inter.s > 1.05 && +inter.illum > 0.5, `scale ${inter.s.toFixed(3)}, illum ${inter.illum}`);
  const tint = await p.evaluate(() => document.querySelector('.chip.tinted').__lgRefraction.opts.material.tint);
  check('V2', '.tint() reaches the material', /rgba\(10,\s*100,\s*224/.test(tint), tint);
  check('E1', 'no page errors', errs.length === 0, errs.join(' | '));
}
{
  const { p, errs, ctx } = await page({ reducedMotion: 'reduce' });
  const r = await p.evaluate(async () => { const tg = document.querySelector('.toggle').getBoundingClientRect(); document.querySelector('.toggle').click(); await new Promise((x) => setTimeout(x, 30)); const a = document.querySelector('.a-rotate').getBoundingClientRect(); return Math.hypot(a.left + a.width / 2 - tg.left - tg.width / 2, a.top + a.height / 2 - tg.top - tg.height / 2); });
  check('A1', 'Reduce Motion: no morph travel (items appear in place)', r > 60, `${r.toFixed(1)}px from toggle at 30 ms`);
  await ctx.close();
}
{
  const { p, ctx } = await page();
  const r = await p.evaluate(async () => { document.documentElement.setAttribute('data-lg-rt', ''); window.LGRefraction.refresh(); await new Promise((x) => setTimeout(x, 100)); return { surf: document.querySelector('#actions .lgx-surface').getAttribute('data-lg-renderer'), item: document.querySelector('.toggle').classList.contains('lg-glass') }; });
  check('A2', 'Reduce Transparency: merged surface off, items get the accessible v1 material', r.surf === 'fallback' && r.item, JSON.stringify(r));
  await ctx.close();
}
await browser.close();
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
