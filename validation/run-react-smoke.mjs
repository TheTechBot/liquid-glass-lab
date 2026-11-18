#!/usr/bin/env node
// Smoke test for the React implementation's built demo (implementations/react/dist-demo).
// Build first: cd implementations/react && npm i && npm run build:demo
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../implementations/react/dist-demo');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try { const u = decodeURIComponent(req.url.split('?')[0]); const p = join(root, u === '/' ? 'index.html' : u); const body = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) errors.push(m.text()); if (m.type() === 'warning' && m.text().includes('liquid-glass')) errors.push('audit warning: ' + m.text()); });
await page.goto(url);
await page.waitForSelector('.lg-tabbar');
await page.waitForTimeout(600);
check('React demo renders without errors or audit warnings', errors.length === 0, errors.join(' | '));
await page.locator('main.phone').screenshot({ path: join(here, 'screenshots/20-react-rest.png') });
const media = await page.evaluate(() => document.querySelector('[data-testid=media]').dataset.lgRenderer);
check('v2 WebGL refraction active on media controls (refraction prop)', media === 'webgl', `data-lg-renderer=${media}`);

await page.click('[data-testid=play]');
check('existing state logic preserved (play toggles)', (await page.getAttribute('[data-testid=play]', 'aria-pressed')) === 'false');

await page.getByRole('tab', { name: 'Library' }).last().click();
await page.waitForTimeout(350);
check('FloatingTabBar selection updates', (await page.getByRole('tab', { name: 'Library' }).last().getAttribute('aria-selected')) === 'true');

await page.click('[data-testid=more]');
await page.waitForTimeout(450);
const menuOpen = await page.evaluate(() => { const m = document.querySelector('[role=menu]'); return { hidden: m.hidden, focus: document.activeElement.getAttribute('role'), audit: window.LG.audit().issues }; });
check('GlassMenu opens, focuses first item, audit clean', !menuOpen.hidden && menuOpen.focus === 'menuitem' && menuOpen.audit.length === 0, JSON.stringify(menuOpen));
await page.locator('main.phone').screenshot({ path: join(here, 'screenshots/21-react-menu.png') });
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
check('menu item onSelect runs and menu closes', (await page.textContent('[data-testid=log]')) === 'share' && await page.evaluate(() => document.querySelector('[role=menu]').hidden));

await page.click('[data-testid=open-panel]');
await page.waitForTimeout(800);
const pnl = await page.evaluate(() => ({ panel: !document.querySelector('[data-testid=panel]').hidden, barHidden: document.querySelector('.lg-tabbar').hidden, audit: window.LG.audit().issues }));
check('FloatingPanel materializes and hides tab bar (no glass on glass)', pnl.panel && pnl.barHidden && pnl.audit.length === 0, JSON.stringify(pnl));
await page.locator('main.phone').screenshot({ path: join(here, 'screenshots/22-react-panel.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
check('panel closes on Escape and tab bar returns', await page.evaluate(() => document.querySelector('[data-testid=panel]').hidden && !document.querySelector('.lg-tabbar').hidden));

await page.getByRole('switch', { name: 'Reduce transparency' }).click();
await page.waitForTimeout(400);
check('Provider override sets data-lg-rt on <html>', await page.evaluate(() => document.documentElement.hasAttribute('data-lg-rt')));
check('no errors during run', errors.length === 0, errors.join(' | '));

await browser.close(); server.close();
await writeFile(join(here, 'results-react.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
