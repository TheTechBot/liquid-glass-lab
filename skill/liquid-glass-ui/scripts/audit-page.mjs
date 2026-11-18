#!/usr/bin/env node
// Audit any page that uses the liquid-glass web/React layer.
// Usage: node audit-page.mjs <url-or-file> [--shot out.png] [--scroll "#scroller"]
// Needs: npm i -D playwright axe-core && npx playwright install chromium
// Reports: LG.audit() rule issues (budget, glass-on-glass, content-layer glass, unlabeled icons, mixed variants)
//          at several scroll positions, axe-core violations, refraction tier, console errors.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (!args[0]) { console.error('usage: node audit-page.mjs <url|file> [--shot out.png] [--scroll selector]'); process.exit(2); }
const target = existsSync(args[0]) ? pathToFileURL(resolve(args[0])).href : args[0];
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : undefined; };
const require = createRequire(import.meta.url);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(target, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const hasLG = await page.evaluate(() => !!window.LG);
if (!hasLG) { console.error('window.LG not found: page does not load liquid-glass.js'); await browser.close(); process.exit(1); }

const scrollSel = opt('--scroll');
const issues = new Set();
for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
  const r = await page.evaluate(([sel, f]) => {
    const s = sel ? document.querySelector(sel) : document.scrollingElement;
    s.scrollTop = (s.scrollHeight - s.clientHeight) * f;
    return window.LG.audit();
  }, [scrollSel, frac]);
  await page.waitForTimeout(150);
  r.issues.forEach((i) => issues.add(i));
}
let axe = [];
try {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  axe = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`));
} catch { axe = ['axe-core not installed — skipped']; }
const refraction = await page.evaluate(() => window.LG.supportsRefraction());
// v2 engine usage: count of surfaces per renderer (webgl / fallback + reason)
const renderers = await page.evaluate(() => { const o = {}; document.querySelectorAll('[data-lg-renderer]').forEach((e) => { const k = e.dataset.lgRenderer + (e.dataset.lgFallbackReason ? `:${e.dataset.lgFallbackReason}` : ''); o[k] = (o[k] || 0) + 1; }); o.webgl2 = !!(window.LGRefraction && window.LGRefraction.isSupported()); return o; });
if (opt('--shot')) await page.screenshot({ path: opt('--shot'), fullPage: false });
await browser.close();

const report = { target, refraction: refraction ? 'svg-displacement (Chromium)' : 'blur-only', renderers, ruleIssues: [...issues], axe, consoleErrors: errors };
console.log(JSON.stringify(report, null, 2));
process.exit(report.ruleIssues.length || report.consoleErrors.length || axe.some((a) => !a.startsWith('axe-core not')) ? 1 : 0);
