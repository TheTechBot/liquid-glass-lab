/*
 * Liquid Glass Lab — web behaviour layer (APPROXIMATION, not Apple's renderer).
 * No dependencies. ES module + window.LG global.
 *
 *  LG.init(root?)              wire all [data-lg-*] behaviour under root
 *  LG.refract(el, size?)       attach SVG displacement refraction (Chromium only)
 *  LG.morphIndicator(group)    move shared .lg-pill to selected item (FLIP-style)
 *  LG.openMenu(trigger, menu)  grow menu from trigger, trigger dematerializes
 *  LG.closeMenu(menu)
 *  LG.materialize(el) / LG.dematerialize(el)
 *  LG.prefs()                  current accessibility preferences
 *  LG.audit(root?)             budget + rule checks, returns report object
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
// keep in sync with design-system/tokens/tokens.json -> refraction
const SIZES = { sm: { scale: 24, edge: 0.30 }, md: { scale: 44, edge: 0.32 }, lg: { scale: 60, edge: 0.22 } };
const BUDGET = { glass: 6, refract: 2 };
let defs = null;
let uid = 0;

// ---------- preferences ----------
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
export function prefs() {
  const html = document.documentElement;
  return {
    reduceMotion: mq('(prefers-reduced-motion: reduce)') || html.hasAttribute('data-lg-rm'),
    reduceTransparency: mq('(prefers-reduced-transparency: reduce)') || html.hasAttribute('data-lg-rt'),
    increaseContrast: mq('(prefers-contrast: more)') || html.hasAttribute('data-lg-ic'),
    forcedColors: mq('(forced-colors: active)'),
  };
}

// Chromium is the only engine that applies SVG filter references inside backdrop-filter (evidence E-10).
// navigator.userAgentData is Chromium-only; combined with CSS.supports it is a feature-ish check, not UA string sniffing.
export function supportsRefraction() {
  try {
    return !!(window.CSS && CSS.supports('backdrop-filter', 'url(#a)') && navigator.userAgentData);
  } catch { return false; }
}

function refractionAllowed() {
  const p = prefs();
  return supportsRefraction() && !p.reduceTransparency && !p.increaseContrast && !p.forcedColors;
}

// ---------- displacement map ----------
// Rounded-rect signed distance field -> edge-normal displacement. R = x offset, G = y offset, 128 = none.
// Inside a band of width `edge*min(w,h)` from the border, pixels sample *inward* with a quadratic falloff,
// which reads as a convex lens rim. Shape constants are our estimate, not Apple's lens function.
function displacementMap(w, h, r, edgeFrac) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  const cx = c.width / 2, cy = c.height / 2;
  const rr = Math.min(r, cx, cy);
  const band = Math.max(2, edgeFrac * Math.min(c.width, c.height));
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const sx = Math.sign(x + 0.5 - cx) || 1, sy = Math.sign(y + 0.5 - cy) || 1;
      const px = Math.abs(x + 0.5 - cx) - (cx - rr);
      const py = Math.abs(y + 0.5 - cy) - (cy - rr);
      const qx = Math.max(px, 0), qy = Math.max(py, 0);
      const outside = Math.hypot(qx, qy);
      const sdf = outside + Math.min(Math.max(px, py), 0) - rr; // <0 inside
      let nx = 0, ny = 0;
      if (outside > 0) { nx = (qx / outside) * sx; ny = (qy / outside) * sy; }
      else if (px > py) nx = sx; else ny = sy;
      const depth = -sdf;
      let m = 0;
      if (depth >= 0 && depth < band) { const t = 1 - depth / band; m = t * t; }
      const i = (y * c.width + x) * 4;
      d[i] = 128 - nx * m * 127;
      d[i + 1] = 128 - ny * m * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function ensureDefs() {
  if (defs && defs.isConnected) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

const refracted = new WeakMap();
const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  for (const e of entries) buildFilter(e.target);
}) : null;

function buildFilter(el) {
  const state = refracted.get(el);
  if (!state) return;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return;
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const cfg = SIZES[state.size] || SIZES.md;
  const url = displacementMap(rect.width, rect.height, radius, cfg.edge);
  const f = state.filter;
  f.setAttribute('x', '0'); f.setAttribute('y', '0');
  f.setAttribute('width', String(rect.width)); f.setAttribute('height', String(rect.height));
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  f.innerHTML = '';
  const fi = document.createElementNS(SVG_NS, 'feImage');
  fi.setAttribute('href', url);
  fi.setAttribute('x', '0'); fi.setAttribute('y', '0');
  fi.setAttribute('width', String(rect.width)); fi.setAttribute('height', String(rect.height));
  fi.setAttribute('preserveAspectRatio', 'none');
  fi.setAttribute('result', 'map');
  const dm = document.createElementNS(SVG_NS, 'feDisplacementMap');
  dm.setAttribute('in', 'SourceGraphic');
  dm.setAttribute('in2', 'map');
  dm.setAttribute('scale', String(cfg.scale * (state.boost || 1)));
  dm.setAttribute('xChannelSelector', 'R');
  dm.setAttribute('yChannelSelector', 'G');
  f.append(fi, dm);
  state.dm = dm;
}

export function refract(el, size = el.dataset.lgSize || 'md') {
  if (!refractionAllowed() || refracted.has(el)) return false;
  const id = `lg-refract-${++uid}`;
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.id = id;
  ensureDefs().appendChild(filter);
  refracted.set(el, { filter, size, boost: 1 });
  el.style.setProperty('--lg-filter', `url(#${id})`);
  el.setAttribute('data-lg-refract', '');
  buildFilter(el);
  ro && ro.observe(el);
  return true;
}

function setBoost(el, boost) {
  const s = refracted.get(el);
  if (!s || !s.dm) return;
  s.boost = boost;
  s.dm.setAttribute('scale', String((SIZES[s.size] || SIZES.md).scale * boost));
}

// ---------- interaction: specular + press flex ----------
function wireInteractive(el) {
  if (el.__lgWired) return;
  el.__lgWired = true;
  let start = null;
  el.addEventListener('pointermove', (e) => {
    if (prefs().reduceMotion) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lg-px', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--lg-py', `${((e.clientY - r.top) / r.height) * 100}%`);
    if (start && !prefs().reduceMotion) {
      // gel-like stretch along drag axis, capped by tokens.motion.stretchMax (0.06)
      const dx = Math.max(-1, Math.min(1, (e.clientX - start.x) / 80));
      const dy = Math.max(-1, Math.min(1, (e.clientY - start.y) / 80));
      el.style.setProperty('--lg-sx', String(1 + Math.abs(dx) * 0.06 - Math.abs(dy) * 0.03));
      el.style.setProperty('--lg-sy', String(1 + Math.abs(dy) * 0.06 - Math.abs(dx) * 0.03));
    }
  });
  el.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY };
    el.classList.add('is-pressed');
    setBoost(el, 1.25);
  });
  const end = () => {
    start = null;
    el.classList.remove('is-pressed');
    el.style.removeProperty('--lg-sx');
    el.style.removeProperty('--lg-sy');
    setBoost(el, 1);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { end(); el.style.setProperty('--lg-py', '0%'); el.style.setProperty('--lg-px', '50%'); });
  el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') el.classList.add('is-pressed'); });
  el.addEventListener('keyup', end);
}

// ---------- morphing indicator (segmented control / tab bar) ----------
export function morphIndicator(group) {
  let pill = group.querySelector(':scope > .lg-pill');
  if (!pill) { pill = document.createElement('span'); pill.className = 'lg-pill'; pill.setAttribute('aria-hidden', 'true'); group.prepend(pill); }
  const sel = group.querySelector('[aria-selected="true"],[aria-checked="true"]');
  if (!sel) { pill.style.opacity = '0'; return; }
  pill.style.opacity = '1';
  pill.style.width = `${sel.offsetWidth}px`;
  pill.style.transform = `translateX(${sel.offsetLeft}px)`;
}

function wireSegmented(group) {
  if (group.__lgWired) return;
  group.__lgWired = true;
  const items = [...group.querySelectorAll('[role="tab"],[role="radio"]')];
  const attr = items[0] && items[0].getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-selected';
  const select = (btn, focus) => {
    items.forEach((b) => { b.setAttribute(attr, String(b === btn)); b.tabIndex = b === btn ? 0 : -1; });
    if (focus) btn.focus();
    morphIndicator(group);
    group.dispatchEvent(new CustomEvent('lg-change', { detail: { value: btn.dataset.value ?? btn.textContent.trim() }, bubbles: true }));
  };
  items.forEach((b) => {
    b.addEventListener('click', () => select(b));
    b.addEventListener('keydown', (e) => {
      const i = items.indexOf(b);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); select(items[(i + 1) % items.length], true); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); select(items[(i - 1 + items.length) % items.length], true); }
    });
  });
  items.forEach((b) => { b.tabIndex = b.getAttribute(attr) === 'true' ? 0 : -1; });
  morphIndicator(group);
  ro && new ResizeObserver(() => morphIndicator(group)).observe(group);
}

// ---------- materialize ----------
export function materialize(el) {
  el.hidden = false;
  if (prefs().reduceMotion || !el.animate) return Promise.resolve();
  setBoost(el, 0.01);
  const a = el.animate(
    [{ opacity: 0, transform: 'scale(0.94)', filter: 'blur(4px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }],
    { duration: 280, easing: 'cubic-bezier(0.34, 1.36, 0.64, 1)' });
  // refraction ramps in with the shape (lensing modulates, not just opacity — E-07)
  const t0 = performance.now();
  const ramp = (t) => { const k = Math.min(1, (t - t0) / 280); setBoost(el, k); if (k < 1) requestAnimationFrame(ramp); };
  requestAnimationFrame(ramp);
  return a.finished.catch(() => {});
}
export function dematerialize(el) {
  if (prefs().reduceMotion || !el.animate) { el.hidden = true; return Promise.resolve(); }
  const a = el.animate(
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.94)' }],
    { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  return a.finished.then(() => { el.hidden = true; }).catch(() => { el.hidden = true; });
}

// ---------- button -> menu morph ----------
export function openMenu(trigger, menu) {
  const host = menu.offsetParent || menu.parentElement;
  menu.hidden = false;
  const tr = trigger.getBoundingClientRect();
  // anchor to the trigger's glass group so the menu never overlaps another glass surface (no glass on glass)
  const anchor = (trigger.closest('.lg-glass') || trigger).getBoundingClientRect();
  const hr = host.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let left = anchor.right - hr.left - mr.width;
  if (left < 8) left = anchor.left - hr.left;
  let top = anchor.bottom - hr.top + 8;
  if (top + mr.height > hr.height - 8) top = anchor.top - hr.top - mr.height - 8;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  const ox = tr.left + tr.width / 2 - (hr.left + Math.max(8, left));
  const oy = tr.top + tr.height / 2 - (hr.top + Math.max(8, top));
  menu.style.setProperty('--lg-origin', `${ox}px ${oy}px`);
  trigger.setAttribute('aria-expanded', 'true');
  // the glass shape that "becomes" the menu: the trigger's own surface if it is alone in it, else the trigger
  const surf = trigger.closest('.lg-glass');
  const morphEl = surf && surf.querySelectorAll('button,[role="button"],a[href]').length === 1 ? surf : trigger;
  morphEl.classList.add('lg-morph-hidden');
  if (!prefs().reduceMotion && menu.animate) {
    const sx = tr.width / mr.width, sy = tr.height / mr.height;
    menu.animate(
      [{ transform: `scale(${sx}, ${sy})`, borderRadius: '999px', opacity: 0.6 }, { transform: 'scale(1)', borderRadius: getComputedStyle(menu).borderRadius, opacity: 1 }],
      { duration: 340, easing: 'cubic-bezier(0.34, 1.36, 0.64, 1)' });
  }
  const first = menu.querySelector('[role="menuitem"]');
  first && first.focus();
  const onKey = (e) => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(menu); }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Tab') closeMenu(menu, false);
  };
  const onDoc = (e) => { if (!menu.contains(e.target) && e.target !== trigger) closeMenu(menu); };
  menu.__lg = { trigger, morphEl, onKey, onDoc };
  menu.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
}
export function closeMenu(menu, refocus = true) {
  const s = menu.__lg;
  if (!s) return;
  menu.removeEventListener('keydown', s.onKey);
  document.removeEventListener('pointerdown', s.onDoc);
  menu.__lg = null;
  s.trigger.setAttribute('aria-expanded', 'false');
  const done = () => { menu.hidden = true; s.morphEl.classList.remove('lg-morph-hidden'); if (refocus) s.trigger.focus(); };
  if (prefs().reduceMotion || !menu.animate) return done();
  const tr = s.trigger.getBoundingClientRect(), mr = menu.getBoundingClientRect();
  menu.animate(
    [{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${tr.width / mr.width}, ${tr.height / mr.height})`, opacity: 0.4, borderRadius: '999px' }],
    { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }).finished.then(done, done);
}

// ---------- slider ----------
function wireSlider(sl) {
  if (sl.__lgWired) return;
  sl.__lgWired = true;
  const knob = sl.querySelector('.lg-slider__knob');
  const fill = sl.querySelector('.lg-slider__fill');
  const min = +(sl.getAttribute('aria-valuemin') ?? 0), max = +(sl.getAttribute('aria-valuemax') ?? 100);
  const set = (v) => {
    v = Math.round(Math.max(min, Math.min(max, v)));
    sl.setAttribute('aria-valuenow', String(v));
    const pct = ((v - min) / (max - min)) * 100;
    knob.style.left = `${pct}%`; fill.style.width = `${pct}%`;
    sl.dispatchEvent(new CustomEvent('lg-change', { detail: { value: v }, bubbles: true }));
  };
  const fromX = (x) => { const r = sl.getBoundingClientRect(); set(min + ((x - r.left) / r.width) * (max - min)); };
  sl.addEventListener('pointerdown', (e) => {
    sl.setPointerCapture(e.pointerId);
    sl.classList.add('is-dragging');
    knob.classList.add('lg-glass', 'lg-glass--sm'); // knob lifts into glass only while interacting (E-01)
    fromX(e.clientX);
  });
  sl.addEventListener('pointermove', (e) => { if (sl.classList.contains('is-dragging')) fromX(e.clientX); });
  const up = () => { sl.classList.remove('is-dragging'); knob.classList.remove('lg-glass', 'lg-glass--sm'); };
  sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
  sl.addEventListener('keydown', (e) => {
    const v = +sl.getAttribute('aria-valuenow');
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(v + step); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(v - step); }
    if (e.key === 'Home') { e.preventDefault(); set(min); }
    if (e.key === 'End') { e.preventDefault(); set(max); }
  });
  set(+(sl.getAttribute('aria-valuenow') ?? 50));
}

// ---------- toggle ----------
function wireToggle(t) {
  if (t.__lgWired) return;
  t.__lgWired = true;
  t.addEventListener('pointerdown', () => t.classList.add('is-pressed'));
  const up = () => t.classList.remove('is-pressed');
  t.addEventListener('pointerup', up); t.addEventListener('pointerleave', up);
  t.addEventListener('click', () => {
    const on = t.getAttribute('aria-checked') !== 'true';
    t.setAttribute('aria-checked', String(on));
    t.dispatchEvent(new CustomEvent('lg-change', { detail: { value: on }, bubbles: true }));
  });
}

// ---------- tab bar minimize on scroll (E-01 tabBarMinimizeBehavior analogue) ----------
function wireMinimize(bar) {
  if (bar.__lgWired) return;
  bar.__lgWired = true;
  const sel = bar.getAttribute('data-lg-minimize-on');
  const scroller = sel ? document.querySelector(sel) : window;
  let last = 0;
  const pos = () => (scroller === window ? window.scrollY : scroller.scrollTop);
  scroller.addEventListener('scroll', () => {
    const y = pos();
    if (Math.abs(y - last) < 6) return;
    bar.classList.toggle('is-minimized', y > last && y > 40);
    last = y;
  }, { passive: true });
}

// ---------- audit ----------
export function audit(root = document) {
  // visible = rendered, not morph-hidden, and not clipped out by any scrolling/clipping ancestor
  const vis = (el) => {
    if (el.closest('[hidden]') || el.classList.contains('lg-morph-hidden')) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) {
        const pr = p.getBoundingClientRect();
        if (r.bottom <= pr.top || r.top >= pr.bottom) return false;
      }
    }
    return r.bottom > 0 && r.top < innerHeight;
  };
  const glass = [...root.querySelectorAll('.lg-glass')].filter(vis);
  const refracting = glass.filter((g) => g.hasAttribute('data-lg-refract'));
  const nested = glass.filter((g) => g.parentElement && g.parentElement.closest('.lg-glass'));
  const contentLayer = glass.filter((g) => { const l = g.closest('[data-lg-layer]'); return l && l.getAttribute('data-lg-layer') === 'content'; });
  const unlabeled = [...root.querySelectorAll('.lg-btn--icon')].filter((b) => !(b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.textContent.trim()));
  const mixed = [...root.querySelectorAll('.lg-group,[data-lg-container]')].filter((c) => {
    const kids = c.querySelectorAll('.lg-glass');
    const clear = [...kids].filter((k) => k.classList.contains('lg-glass--clear')).length;
    return clear > 0 && clear < kids.length;
  });
  // glass-on-glass also happens without DOM nesting: two glass rects overlapping on screen
  const overlaps = [];
  for (let i = 0; i < glass.length; i++) for (let j = i + 1; j < glass.length; j++) {
    const a = glass[i].getBoundingClientRect(), b = glass[j].getBoundingClientRect();
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ix > 2 && iy > 2 && !glass[i].contains(glass[j]) && !glass[j].contains(glass[i])) overlaps.push([glass[i], glass[j]]);
  }
  const issues = [];
  if (glass.length > BUDGET.glass) issues.push(`budget: ${glass.length} glass surfaces visible (max ${BUDGET.glass})`);
  if (refracting.length > BUDGET.refract) issues.push(`budget: ${refracting.length} refracting surfaces visible (max ${BUDGET.refract})`);
  nested.forEach((n) => issues.push(`glass-on-glass: ${describe(n)}`));
  overlaps.forEach(([a, b]) => issues.push(`overlapping glass: ${describe(a)} / ${describe(b)}`));
  contentLayer.forEach((n) => issues.push(`glass in content layer: ${describe(n)}`));
  unlabeled.forEach((n) => issues.push(`icon button without accessible name: ${describe(n)}`));
  mixed.forEach((n) => issues.push(`regular and clear mixed in one group: ${describe(n)}`));
  return { visibleGlass: glass.length, refracting: refracting.length, issues };
}
function describe(el) { return el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`; }

// ---------- init ----------
export function init(root = document) {
  const html = document.documentElement;
  html.classList.toggle('lg-refract-on', refractionAllowed());
  root.querySelectorAll('[data-lg-interactive]').forEach(wireInteractive);
  root.querySelectorAll('.lg-segmented').forEach(wireSegmented);
  root.querySelectorAll('.lg-slider').forEach(wireSlider);
  root.querySelectorAll('.lg-toggle').forEach(wireToggle);
  root.querySelectorAll('[data-lg-minimize-on]').forEach(wireMinimize);
  if (refractionAllowed()) root.querySelectorAll('.lg-glass[data-lg-refract-auto]').forEach((el) => refract(el));
  root.querySelectorAll('[data-lg-menu-trigger]').forEach((t) => {
    if (t.__lgMenu) return;
    t.__lgMenu = true;
    const menu = document.getElementById(t.getAttribute('data-lg-menu-trigger'));
    t.setAttribute('aria-haspopup', 'menu');
    t.setAttribute('aria-expanded', 'false');
    t.setAttribute('aria-controls', menu.id);
    t.addEventListener('click', () => (menu.hidden ? openMenu(t, menu) : closeMenu(menu)));
    menu.addEventListener('click', (e) => { if (e.target.closest('[role="menuitem"]')) closeMenu(menu); });
  });
  const r = audit(root);
  if (r.issues.length) console.warn('[liquid-glass] audit', r.issues);
  return r;
}

/** Re-evaluate refraction after the user toggles a11y attributes on <html>. */
export function refresh(root = document) {
  const on = refractionAllowed();
  document.documentElement.classList.toggle('lg-refract-on', on);
  if (on) root.querySelectorAll('.lg-glass[data-lg-refract-auto]').forEach((el) => refract(el));
}

const LG = { init, refresh, refract, morphIndicator, openMenu, closeMenu, materialize, dematerialize, prefs, audit, supportsRefraction };
if (typeof window !== 'undefined') window.LG = LG;
export default LG;
