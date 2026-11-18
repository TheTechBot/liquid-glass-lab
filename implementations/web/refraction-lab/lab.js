// Refraction Test Lab — compares the v1 SVG renderer, blur-only, and the v2 WebGL2 engine on identical backdrops.
// Deterministic hooks for automated tests live on window.LAB.
import LGRefraction, { DEFAULT_MATERIAL } from '../src/liquid-glass-refraction.js';
import LG from '../src/liquid-glass.js';

const SHAPES = [
  { id: 'circle', label: 'Circle', w: 150, h: 150, shape: { type: 'circle' }, css: '50%' },
  { id: 'ellipse', label: 'Ellipse', w: 230, h: 140, shape: { type: 'ellipse' }, css: '50%' },
  { id: 'rect', label: 'Rectangle', w: 210, h: 130, shape: { type: 'rect' }, css: '0' },
  { id: 'rounded', label: 'Rounded rect', w: 210, h: 130, shape: { type: 'roundedRect', radius: 30 }, css: '30px' },
  { id: 'capsule', label: 'Capsule', w: 240, h: 84, shape: { type: 'capsule' }, css: '999px' },
  { id: 'path', label: 'SVG path (blob)', w: 200, h: 160,
    shape: { type: 'path', viewBox: [0, 0, 200, 160], d: 'M100 8C150 4 196 40 192 86C188 132 146 156 98 152C50 148 6 126 8 80C10 34 50 12 100 8Z' },
    clip: "path('M100 8C150 4 196 40 192 86C188 132 146 156 98 152C50 148 6 126 8 80C10 34 50 12 100 8Z')" },
  { id: 'polygon', label: 'Polygon (hexagon)', w: 180, h: 160,
    shape: { type: 'polygon', points: [[0.25, 0.03], [0.75, 0.03], [0.99, 0.5], [0.75, 0.97], [0.25, 0.97], [0.01, 0.5]] },
    clip: 'polygon(25% 3%, 75% 3%, 99% 50%, 75% 97%, 25% 97%, 1% 50%)' },
  { id: 'star', label: 'Polygon (star, concave)', w: 180, h: 170,
    shape: { type: 'polygon', points: starPoints(5, 0.5, 0.22) }, clip: `polygon(${starPoints(5, 0.5, 0.22).map(([x, y]) => `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`).join(',')})` },
];
function starPoints(n, R, r) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n; const rad = i % 2 ? r : R; pts.push([0.5 + Math.cos(a) * rad, 0.52 + Math.sin(a) * rad]); }
  return pts;
}

const CELL_W = 290, CELL_H = 230, COLS = 4;
const M = 90; // backdrop margin around the grid so edge cells never sample past the texture edge (keeps symmetry)
const state = {
  bg: 'checker', mode: 'webgl', time: 0, paused: false, debug: 0,
  material: { ...DEFAULT_MATERIAL },
  photo: null,
};
const grids = [];

// ---------------------------------------------------------------- backdrops (drawn per cell → identical per shape)
function drawCell(ctx, kind, w, h, t) {
  // Patterns are centred on the shape centre (cx, cy) and mirror-symmetric about it, so a symmetric bend
  // gives a mirror-identical image (left half == mirrored right half). Photo and moving backgrounds are not symmetric by nature.
  const cx = w / 2, cy = h / 2 + 8;
  ctx.save();
  if (kind === 'checker' || kind === 'moving') {
    const s = 20, ox = kind === 'moving' ? (t * 40) % (s * 2) : 0, oy = kind === 'moving' ? (t * 25) % (s * 2) : 0;
    ctx.fillStyle = '#fff'; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M); ctx.fillStyle = '#111';
    // one square centred on the shape centre
    const x0 = cx - s / 2 + ox, y0 = cy - s / 2 + oy;
    for (let j = -Math.ceil((h + M) / s) - 2; j <= Math.ceil((h + M) / s) + 2; j++) for (let i = -Math.ceil((w + M) / s) - 2; i <= Math.ceil((w + M) / s) + 2; i++)
      if (((i + j) % 2 + 2) % 2 === 0) ctx.fillRect(x0 + i * s, y0 + j * s, s, s);
    if (kind === 'moving') {
      ctx.fillStyle = '#ff2d55'; ctx.beginPath(); ctx.arc(cx + Math.cos(t * 1.3) * w * 0.32, cy + Math.sin(t * 1.7) * h * 0.3, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#0a84ff'; ctx.font = '700 28px system-ui,sans-serif'; ctx.fillText('MOVING', ((t * 60) % (w + 160)) - 140, h * 0.32);
    }
  } else if (kind === 'lines') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M); ctx.fillStyle = '#000';
    for (let k = -20; k <= 20; k++) ctx.fillRect(cx + k * 16 - 1.5, -M, 3, h + 2 * M);          // vertical line through the centre
    ctx.fillStyle = '#e0002a'; for (let k = -9; k <= 9; k++) ctx.fillRect(-M, cy + k * 28 - 1.5, w + 2 * M, 3);
  } else if (kind === 'grid') {
    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M); ctx.fillStyle = '#1b1b1b';
    for (let k = -70; k <= 70; k++) { ctx.fillRect(cx + k * 6 - 0.5, -M, 1, h + 2 * M); ctx.fillRect(-M, cy + k * 6 - 0.5, w + 2 * M, 1); }
  } else if (kind === 'gradient') {
    const g = ctx.createLinearGradient(0, -M, 0, h + M);                                         // vertical: left/right symmetric
    ['#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#5e5ce6', '#bf5af2'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M);
    const r = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5); r.addColorStop(0, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M);
  } else if (kind === 'photo') {
    const im = state.photo;
    if (im && im.naturalWidth) { const W2 = w + 2 * M, H2 = h + 2 * M; const sc = Math.max(W2 / im.naturalWidth, H2 / im.naturalHeight); const iw = im.naturalWidth * sc, ih = im.naturalHeight * sc; ctx.drawImage(im, (w - iw) / 2, (h - ih) / 2, iw, ih); }
    else { ctx.fillStyle = '#334'; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M); }
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '600 13px system-ui,sans-serif'; ctx.fillText('The quick brown fox jumps over the lazy dog', 10, h - 12);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- grid of shapes
function makeGrid(host, renderer, title) {
  const wrap = document.createElement('section'); wrap.className = 'grid-wrap';
  wrap.innerHTML = `<h2>${title}</h2>`;
  const stage = document.createElement('div'); stage.className = 'stage';
  const rows = Math.ceil(SHAPES.length / COLS);
  stage.style.width = `${CELL_W * COLS + 2 * M}px`; stage.style.height = `${CELL_H * rows + 2 * M}px`;
  const canvas = document.createElement('canvas'); canvas.className = 'backdrop';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = (CELL_W * COLS + 2 * M) * dpr; canvas.height = (CELL_H * rows + 2 * M) * dpr;
  stage.append(canvas);
  const items = SHAPES.map((s, i) => {
    const cx = M + (i % COLS) * CELL_W, cy = M + Math.floor(i / COLS) * CELL_H, col = i % COLS, row = Math.floor(i / COLS);
    const label = document.createElement('div'); label.className = 'cell-label'; label.textContent = s.label;
    label.style.left = `${cx + 8}px`; label.style.top = `${cy + 6}px`;
    const el = document.createElement('div');
    el.className = 'lab-glass'; el.dataset.shape = s.id;
    el.style.cssText = `left:${cx + (CELL_W - s.w) / 2}px;top:${cy + (CELL_H - s.h) / 2 + 8}px;width:${s.w}px;height:${s.h}px;`;
    el.innerHTML = '<span>Aa</span>';
    stage.append(label, el);
    return { s, el, cx, cy, col, row, rows, handle: null };
  });
  wrap.append(stage); host.append(wrap);
  const g = { renderer, canvas, items, dpr, wrap };
  applyRenderer(g);
  grids.push(g);
  return g;
}

function applyRenderer(g) {
  for (const it of g.items) {
    it.handle && it.handle.destroy && it.handle.destroy();
    it.handle = null;
    const el = it.el;
    el.classList.remove('lg-glass', 'old-v1', 'blur-only');
    el.removeAttribute('data-lg-refract'); el.style.removeProperty('--lg-filter');
    el.style.borderRadius = it.s.css || '0'; el.style.clipPath = it.s.clip || '';
    if (g.renderer === 'webgl') {
      el.style.borderRadius = ''; el.style.clipPath = '';
      it.handle = LGRefraction.attach(el, { backdrop: g.canvas, shape: it.s.shape, material: state.material, debug: state.debug });
    } else if (g.renderer === 'svg') {
      el.classList.add('lg-glass', 'old-v1');
      LG.refract(el, 'md');
    } else {
      el.classList.add('lg-glass', 'blur-only');
    }
  }
}

function drawGrid(g) {
  const ctx = g.canvas.getContext('2d');
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  for (const it of g.items) {
    // edge cells also paint the outer margin so the backdrop continues past the grid
    const x0 = it.cx - (it.col === 0 ? M : 0), y0 = it.cy - (it.row === 0 ? M : 0);
    const x1 = it.cx + CELL_W + (it.col === COLS - 1 || it === g.items[g.items.length - 1] ? M : 0), y1 = it.cy + CELL_H + (it.row === it.rows - 1 ? M : 0);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip(); ctx.translate(it.cx, it.cy);
    drawCell(ctx, state.bg, CELL_W, CELL_H, state.time);
    ctx.restore();
  }
  LGRefraction.invalidate(g.canvas);
}

function redraw() { grids.forEach(drawGrid); LGRefraction.renderNow(); }

// animation: draw backdrop, then render glass synchronously in the same frame (acceptance E)
let last = performance.now();
function tick(now) {
  const dt = (now - last) / 1000; last = now;
  if (state.bg === 'moving' && !state.paused) { state.time += dt; redraw(); }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- controls
const CONTROLS = [
  ['refraction', 'Refraction strength', 0, 2, 0.01],
  ['ior', 'Refractive index', 1.0, 2.4, 0.01],
  ['thickness', 'Glass thickness (px)', 0, 120, 1],
  ['curvature', 'Curvature (bevel width)', 0.05, 1, 0.01],
  ['edge', 'Edge intensity', 0, 1.5, 0.01],
  ['fresnel', 'Fresnel strength', 0, 1, 0.01],
  ['blur', 'Background blur (px)', 0, 20, 0.5],
  ['reflection', 'Reflection strength', 0, 1, 0.01],
  ['dispersion', 'Dispersion', 0, 0.2, 0.005],
  ['shadow', 'Shadow', 0, 1, 0.01],
  ['maxOffset', 'Max bend clamp (× half-size)', 0.1, 2, 0.05],
  ['lightAngle', 'Light angle (deg)', -180, 180, 1],
];
function buildControls() {
  const box = document.getElementById('controls');
  for (const [k, label, min, max, step] of CONTROLS) {
    const row = document.createElement('label'); row.className = 'ctl';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${state.material[k]}" data-k="${k}"><output>${state.material[k]}</output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { setParams({ [k]: +inp.value }); out.textContent = inp.value; });
    box.append(row);
  }
  const tint = document.createElement('label'); tint.className = 'ctl';
  tint.innerHTML = '<span>Tint colour / amount</span><span class="tintrow"><input type="color" value="#ffffff" id="tint-c"><input type="range" min="0" max="0.6" step="0.01" value="0.06" id="tint-a"></span><output id="tint-o">0.06</output>';
  box.append(tint);
  const upd = () => { const c = document.getElementById('tint-c').value, a = +document.getElementById('tint-a').value; document.getElementById('tint-o').textContent = a; const n = parseInt(c.slice(1), 16); setParams({ tint: `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})` }); };
  tint.querySelectorAll('input').forEach((i) => i.addEventListener('input', upd));
  document.getElementById('bg').addEventListener('change', (e) => setBackground(e.target.value));
  document.getElementById('mode').addEventListener('change', (e) => setMode(e.target.value));
  document.getElementById('debug').addEventListener('change', (e) => setDebug(+e.target.value));
  document.getElementById('pause').addEventListener('change', (e) => { state.paused = e.target.checked; });
  const syncInputs = () => { document.querySelectorAll('#controls input[type=range][data-k]').forEach((i) => { i.value = state.material[i.dataset.k]; i.nextElementSibling.textContent = i.value; }); document.getElementById('profile').value = state.material.profile; };
  document.getElementById('reset').addEventListener('click', () => { setParams({ ...DEFAULT_MATERIAL }); syncInputs(); });
  document.getElementById('profile').addEventListener('change', (e) => setParams({ profile: e.target.value }));
  document.getElementById('copy').addEventListener('click', async () => {
    const txt = JSON.stringify(state.material, null, 2); const msg = document.getElementById('copy-msg');
    try { await navigator.clipboard.writeText(txt); msg.textContent = 'Copied. Paste it to Claude.'; }
    catch { msg.textContent = 'Clipboard blocked — select the text below and copy it.'; }
  });
  showSettings();
  document.getElementById('photo-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const im = new Image(); im.onload = () => { state.photo = im; setBackground('photo'); document.getElementById('bg').value = 'photo'; }; im.src = URL.createObjectURL(f);
  });
}

function showSettings() {
  const pre = document.getElementById('settings-json'); if (pre) pre.textContent = JSON.stringify(state.material, null, 2);
}
function setParams(p) {
  Object.assign(state.material, p);
  showSettings();
  grids.forEach((g) => g.items.forEach((it) => it.handle && it.handle.update && it.handle.update({ material: p })));
  LGRefraction.renderNow();
}
function setDebug(d) { state.debug = d; grids.forEach((g) => g.items.forEach((it) => it.handle && it.handle.update && it.handle.update({ debug: d }))); LGRefraction.renderNow(); }
function setBackground(b) { state.bg = b; const sel = document.getElementById('bg'); if (sel && sel.value !== b) sel.value = b; redraw(); }
function setMode(mode) {
  state.mode = mode;
  const sel = document.getElementById('mode'); if (sel && sel.value !== mode) sel.value = mode;
  const host = document.getElementById('grids');
  grids.splice(0).forEach((g) => { g.items.forEach((it) => it.handle && it.handle.destroy && it.handle.destroy()); g.wrap.remove(); });
  if (mode === 'compare') { makeGrid(host, 'svg', 'Old renderer — v1 SVG backdrop-filter (Chromium)'); makeGrid(host, 'webgl', 'New renderer — v2 WebGL2 SDF refraction'); }
  else if (mode === 'compare-blur') { makeGrid(host, 'blur', 'Ordinary backdrop blur only'); makeGrid(host, 'webgl', 'New renderer — v2 WebGL2 SDF refraction'); }
  else makeGrid(host, mode, { webgl: 'New renderer — v2 WebGL2 SDF refraction', svg: 'Old renderer — v1 SVG backdrop-filter', blur: 'Ordinary backdrop blur only' }[mode]);
  redraw();
  updateStatus();
}
function setTime(t) { state.time = t; state.paused = true; const p = document.getElementById('pause'); if (p) p.checked = true; redraw(); }

function updateStatus() {
  const s = LGRefraction.stats();
  document.getElementById('status').textContent = s
    ? `WebGL2: yes · ${s.renderer} · ${s.instances} instances · render ${s.avgMs.toFixed(2)} ms/frame (CPU-side, includes upload + copy)`
    : `WebGL2: NO (${LGRefraction.supportInfo.reason}) — showing fallback renderer`;
}

async function init() {
  LG.init();
  const im = new Image(); im.src = document.getElementById('photo-src').getAttribute('href');
  await im.decode().catch(() => {}); state.photo = im;
  buildControls();
  const qs = new URLSearchParams(location.search);
  if (qs.get('bg')) { state.bg = qs.get('bg'); document.getElementById('bg').value = state.bg; }
  const mode = qs.get('mode') || 'webgl'; document.getElementById('mode').value = mode;
  setMode(mode);
  setInterval(updateStatus, 1000);
  requestAnimationFrame(tick);
}

window.LAB = { setParams, setBackground, setMode, setTime, setDebug, state, grids, shapes: SHAPES, redraw, CELL_W, CELL_H, COLS };
window.__LAB_READY__ = init().then(() => true);
