(function(){
/*
 * liquid-glass-effect.js — Apple-shaped Liquid Glass API for the web, on top of our WebGL2 refraction engine.
 *
 * Mirrors SwiftUI (iOS 26) names so the same mental model works everywhere:
 *   SwiftUI                                         Web (this file)
 *   .glassEffect()                                  glassEffect(el)                         // .regular, capsule
 *   .glassEffect(.regular, in: RoundedRectangle(12)) glassEffect(el, Glass.regular, { in: { cornerRadius: 12 } })
 *   .glassEffect(.clear)                            glassEffect(el, Glass.clear)
 *   .glassEffect(isOn ? .regular : .identity)       glassEffect(el, isOn ? Glass.regular : Glass.identity)
 *   .regular.tint(.blue).interactive()              Glass.regular.tint('#0a84ff').interactive()
 *   GlassEffectContainer(spacing: 30) { … }         glassEffectContainer(el, { spacing: 30 })
 *   .glassEffectID("crop", in: ns)                  <button data-glass-id="crop">
 *   withAnimation(.bouncy) { isExpanded.toggle() }  container.withAnimation(() => { …change DOM… })
 *
 * Declarative: data-glass="regular|clear|identity" data-glass-tint="#0a84ff" data-glass-interactive
 *              data-glass-shape="capsule|circle|rect|12"  ·  container: data-glass-container="30"  → autoGlass()
 *
 * Honest scope: this is an approximation (SDF refraction + smooth-union merging), NOT Apple's renderer.
 * Behaviour copied from Apple's docs: glass cannot sample glass, so glass inside a container is drawn as ONE
 * surface; shapes closer than `spacing` blend into each other; IDs morph between layouts.
 */
const LGRefraction = window.LGRefraction; const { SIGNATURE, PRESETS } = LGRefraction;

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
const reduceMotion = () => mq('(prefers-reduced-motion: reduce)') || document.documentElement.hasAttribute('data-lg-rm');

// ---------------------------------------------------------------------------------------------------------------
// Glass value (immutable, chainable like SwiftUI's Glass)
// ---------------------------------------------------------------------------------------------------------------
class Glass {
  constructor(variant, tintColor = null, isInteractive = false) { this.variant = variant; this.tintColor = tintColor; this.isInteractive = isInteractive; Object.freeze(this); }
  /** Semantic tint (use for the primary action only). */
  tint(color) { return new Glass(this.variant, color, this.isInteractive); }
  /** Press scale + bounce, touch illumination, shimmer, light follows the finger. */
  interactive(on = true) { return new Glass(this.variant, this.tintColor, on); }
  /** Material handed to the engine. Signature bend is kept for every variant. */
  material() {
    if (this.variant === 'clear') return { ...SIGNATURE, blur: 0.6, tint: this.tintColor ? toTint(this.tintColor, 0.45) : 'rgba(255,255,255,0.05)', reflection: 0.5 };
    const base = PRESETS.control;
    return this.tintColor ? { ...base, tint: toTint(this.tintColor, 0.62) } : { ...base };
  }
}
Glass.regular = new Glass('regular');
Glass.clear = new Glass('clear');
Glass.identity = new Glass('identity');

let cctx;
function toTint(css, alpha) {
  cctx = cctx || document.createElement('canvas').getContext('2d');
  cctx.fillStyle = '#000'; cctx.fillStyle = css; const v = cctx.fillStyle;
  if (v.startsWith('#')) { const n = parseInt(v.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})`; }
  return v; // already has its own alpha
}

// ---------------------------------------------------------------------------------------------------------------
// styles for interactive feedback (injected once)
// ---------------------------------------------------------------------------------------------------------------
const CSS = `
.lgx-item{position:relative;transform-origin:center;transition:transform .42s cubic-bezier(.34,1.56,.64,1)}
.lgx-item.lgx-pressed{transform:scale(1.1);transition-duration:.18s}
.lgx-illum{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s;
  background:radial-gradient(circle at var(--lgx-x,50%) var(--lgx-y,50%),rgba(255,255,255,.42),rgba(255,255,255,0) 60%);mix-blend-mode:plus-lighter}
.lgx-pressed>.lgx-illum{opacity:1}
.lgx-shimmer{position:absolute;inset:0;border-radius:inherit;pointer-events:none;overflow:hidden}
.lgx-shimmer::after{content:"";position:absolute;inset:-20% -60%;background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.45) 50%,transparent 60%);transform:translateX(-100%)}
.lgx-shine>.lgx-shimmer::after{animation:lgx-sweep .7s ease-out}
@keyframes lgx-sweep{to{transform:translateX(100%)}}
.lgx-container{position:relative;isolation:isolate}
.lgx-surface{position:absolute;inset:calc(-1*var(--lgx-bleed,18px));pointer-events:none;z-index:-1}
.lgx-enter{opacity:0}
.lgx-content-fade{transition:opacity .3s ease .08s}
@media (prefers-reduced-motion: reduce){.lgx-item,.lgx-item.lgx-pressed{transition:none;transform:none}.lgx-shine>.lgx-shimmer::after{animation:none}}
`;
function injectCss() { if (document.getElementById('lgx-css')) return; const s = document.createElement('style'); s.id = 'lgx-css'; s.textContent = CSS; document.head.appendChild(s); }

function findBackdrop(el) {
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const all = [...document.querySelectorAll('[data-lg-backdrop-source]')];
  return all.find((b) => { const q = b.getBoundingClientRect(); return cx >= q.left && cx <= q.right && cy >= q.top && cy <= q.bottom; }) || all[0] || null;
}
function parseShape(sh, el) {
  if (sh == null || sh === 'capsule') return { type: 'capsule' };
  if (sh === 'auto') return LGRefraction.shapeFromElement(el);
  if (sh === 'circle' || sh === 'rect' || sh === 'ellipse') return { type: sh };
  if (typeof sh === 'number' || /^\d+(\.\d+)?$/.test(sh)) return { type: 'roundedRect', radius: +sh };
  if (sh.cornerRadius != null) return { type: 'roundedRect', radius: sh.cornerRadius };
  return sh; // raw engine shape
}
function cornerOf(shape, w, h) {
  if (shape.type === 'capsule' || shape.type === 'circle' || shape.type === 'ellipse') return Math.min(w, h) / 2;
  if (shape.type === 'rect') return 0;
  return shape.radius ?? 16;
}

// ---------------------------------------------------------------------------------------------------------------
// interactive behaviour (shared by single glass and container items)
// ---------------------------------------------------------------------------------------------------------------
function makeInteractive(el, onLight) {
  el.classList.add('lgx-item');
  if (!el.querySelector(':scope>.lgx-illum')) {
    const a = document.createElement('span'); a.className = 'lgx-illum'; a.setAttribute('aria-hidden', 'true');
    const b = document.createElement('span'); b.className = 'lgx-shimmer'; b.setAttribute('aria-hidden', 'true');
    el.append(a, b);
  }
  const pos = (e) => { const r = el.getBoundingClientRect(); el.style.setProperty('--lgx-x', `${e.clientX - r.left}px`); el.style.setProperty('--lgx-y', `${e.clientY - r.top}px`); onLight && onLight(e); };
  const down = (e) => { pos(e); el.classList.add('lgx-pressed'); el.classList.remove('lgx-shine'); void el.offsetWidth; if (!reduceMotion()) el.classList.add('lgx-shine'); };
  const up = () => el.classList.remove('lgx-pressed');
  const move = (e) => { if (el.classList.contains('lgx-pressed')) pos(e); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, up));
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.removeEventListener(t, up)); el.classList.remove('lgx-item', 'lgx-pressed', 'lgx-shine'); el.querySelectorAll(':scope>.lgx-illum,:scope>.lgx-shimmer').forEach((n) => n.remove()); };
}
function lightFrom(inst, el) {
  return (e) => {
    if (!inst || reduceMotion()) return;
    const r = el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy) || 1;
    inst.light = [dx / l, dy / l]; LGRefraction.engine()?.kick();
  };
}

// ---------------------------------------------------------------------------------------------------------------
// glassEffect(el, glass, { in: shape })
// ---------------------------------------------------------------------------------------------------------------
function glassEffect(el, glass = Glass.regular, opts = {}) {
  injectCss();
  if (el.__lgxContainerItem) { el.__lgxContainerItem.set(glass); return el.__lgxContainerItem; } // inside a container: one shared surface
  if (el.__lgxHandle) return el.__lgxHandle.update(glass);
  let handle = null, undoInteractive = null, current = null;
  const shape = parseShape(opts.in, el);
  const api = {
    el, get glass() { return current; },
    update(g) {
      current = g;
      if (g.variant === 'identity') { handle && handle.destroy(); handle = null; el.classList.remove('lg-glass', 'lg-glass--clear', 'lg-glass--tinted'); undoInteractive && undoInteractive(); undoInteractive = null; return api; }
      el.classList.add('lg-glass'); el.classList.toggle('lg-glass--clear', g.variant === 'clear'); el.classList.toggle('lg-glass--tinted', !!g.tintColor);
      if (shape.type !== 'rect') el.style.borderRadius = el.style.borderRadius || `${cornerOf(shape, el.offsetWidth, el.offsetHeight)}px`;
      if (handle) handle.update({ material: g.material() });
      else handle = LGRefraction.attach(el, { backdrop: opts.backdrop || findBackdrop(el), shape, material: g.material(), dynamic: opts.dynamic });
      if (g.isInteractive && !undoInteractive) undoInteractive = makeInteractive(el, lightFrom(el.__lgRefraction, el));
      if (!g.isInteractive && undoInteractive) { undoInteractive(); undoInteractive = null; }
      return api;
    },
    destroy() { api.update(Glass.identity); delete el.__lgxHandle; },
  };
  el.__lgxHandle = api;
  return api.update(glass);
}

// ---------------------------------------------------------------------------------------------------------------
// glassEffectContainer(el, { spacing }) — children with data-glass / glassEffect() share ONE merged surface.
// ---------------------------------------------------------------------------------------------------------------
function glassEffectContainer(el, opts = {}) {
  injectCss();
  const spacing = opts.spacing ?? 0, bleed = Math.max(18, spacing);
  el.classList.add('lgx-container'); el.style.setProperty('--lgx-bleed', `${bleed}px`);
  const surface = document.createElement('div'); surface.className = 'lgx-surface'; surface.setAttribute('aria-hidden', 'true');
  el.prepend(surface);
  const items = new Map(); // element → { glass, undo }
  let phantoms = []; // shrinking shapes of removed items
  let loop = 0, until = 0, mat = null;

  const inst = () => surface.__lgRefraction;
  const itemShape = (it) => parseShape(it.el.getAttribute('data-glass-shape') || it.shapeOpt, it.el);
  function rects() {
    const s = surface.getBoundingClientRect(), out = [];
    let hmin = 1e9;
    for (const it of items.values()) {
      if (!it.el.isConnected || it.glass.variant === 'identity') continue;
      const r = it.el.getBoundingClientRect(); if (r.width < 1) continue;
      const sh = itemShape(it);
      out.push({ x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, r: cornerOf(sh, r.width, r.height) });
      hmin = Math.min(hmin, Math.min(it.el.offsetWidth, it.el.offsetHeight) / 2);
    }
    const now = performance.now();
    phantoms = phantoms.filter((p) => now < p.t1);
    for (const p of phantoms) {
      const t = Math.min(1, (now - p.t0) / (p.t1 - p.t0)), e = 1 - Math.pow(1 - t, 3), f = p.to(); // collapse into target
      const lerp = (a, b) => a + (b - a) * e;
      const w = lerp(p.w, Math.min(p.w, f.w) * 0.2), h = lerp(p.h, Math.min(p.h, f.h) * 0.2);
      const cx = lerp(p.x + p.w / 2, f.x + f.w / 2), cy = lerp(p.y + p.h / 2, f.y + f.h / 2);
      out.push({ x: cx - w / 2 - s.left, y: cy - h / 2 - s.top, w, h, r: Math.min(w, h) / 2 });
    }
    return { rects: out, hmin: hmin === 1e9 ? 0 : hmin };
  }
  function material() {
    // container uses the first tinted item's tint only if every item is tinted; otherwise regular/clear of the majority
    const gs = [...items.values()].map((i) => i.glass).filter((g) => g.variant !== 'identity');
    const clear = gs.length && gs.every((g) => g.variant === 'clear');
    return (clear ? Glass.clear : Glass.regular).material();
  }
  function sync() {
    const { rects: rs, hmin } = rects();
    const shape = { type: 'union', k: spacing * 2, rects: rs, hmin }; // k = 2·spacing → items whose gap ≤ spacing fuse
    const m = material(); const mk = JSON.stringify(m);
    if (!inst()) LGRefraction.attach(surface, { backdrop: opts.backdrop || findBackdrop(el), shape, material: m, dynamic: opts.dynamic });
    else inst().update(mk !== mat ? { shape, material: m } : { shape });
    mat = mk;
    // tinted items get their own colour as a soft inner fill (glass itself stays one surface)
    for (const it of items.values()) it.el.style.backgroundColor = it.glass.tintColor && fallbackActive() === false ? toTint(it.glass.tintColor, 0.55) : '';
  }
  const fallbackActive = () => surface.getAttribute('data-lg-renderer') !== 'webgl';
  function applyFallbackLook() {
    // accessibility / no WebGL → each item gets the v1 accessible material instead of the merged surface
    const fb = fallbackActive();
    for (const it of items.values()) { it.el.classList.toggle('lg-glass', fb && it.glass.variant !== 'identity'); it.el.classList.toggle('lg-glass--tinted', fb && !!it.glass.tintColor); }
  }
  function tick() {
    loop = 0; sync(); LGRefraction.renderNow();
    if (performance.now() < until || phantoms.length) loop = requestAnimationFrame(tick);
  }
  function animateFor(ms) { until = Math.max(until, performance.now() + ms); if (!loop) loop = requestAnimationFrame(tick); }

  function add(child, glass = Glass.regular, shapeOpt) {
    const it = { el: child, glass, shapeOpt, undo: null };
    items.set(child, it);
    child.__lgxContainerItem = { el: child, set(g) { it.glass = g; refreshItem(it); animateFor(450); }, destroy() { remove(child); } };
    refreshItem(it);
    return child.__lgxContainerItem;
  }
  function refreshItem(it) {
    const sh = itemShape(it);
    if (sh.type !== 'rect') it.el.style.borderRadius = `${cornerOf(sh, it.el.offsetWidth, it.el.offsetHeight)}px`;
    if (it.glass.isInteractive && it.glass.variant !== 'identity' && !it.undo) it.undo = makeInteractive(it.el, (e) => { lightFrom(inst(), it.el)(e); animateFor(500); });
    if ((!it.glass.isInteractive || it.glass.variant === 'identity') && it.undo) { it.undo(); it.undo = null; }
    if (it.undo && !it.kick) { it.kick = () => animateFor(600); ['pointerdown', 'pointerup', 'pointerleave'].forEach((t) => it.el.addEventListener(t, it.kick)); }
    applyFallbackLook();
  }
  function remove(child) { const it = items.get(child); if (!it) return; it.undo && it.undo(); items.delete(child); delete child.__lgxContainerItem; child.style.backgroundColor = ''; }

  /** withAnimation(.bouncy) { … } — run a DOM change; glass with matching data-glass-id morphs, new glass grows out of
   *  its nearest neighbour, removed glass is absorbed into its nearest neighbour. */
  function withAnimation(mutate, { duration = 500 } = {}) {
    const before = new Map(); // id → rect
    const byEl = new Map();
    for (const it of items.values()) { const r = it.el.getBoundingClientRect(); byEl.set(it.el, r); const id = it.el.getAttribute('data-glass-id'); if (id) before.set(id, r); }
    const prevEls = new Set(items.keys());
    mutate();
    scan();
    const rm = reduceMotion() ? 0 : duration;
    // removed items → phantoms collapsing into the nearest survivor
    for (const elx of prevEls) {
      if (items.has(elx) && elx.isConnected) continue;
      const r = byEl.get(elx); remove(elx);
      const target = nearest(r); if (!target || !rm) continue;
      const t0 = performance.now();
      phantoms.push({ x: r.left, y: r.top, w: r.width, h: r.height, t0, t1: t0 + rm * 0.8, to: () => target.getBoundingClientRect() });
    }
    // new / moved items → FLIP from old position (same id) or from the nearest previous glass
    for (const it of items.values()) {
      const now = it.el.getBoundingClientRect();
      const id = it.el.getAttribute('data-glass-id');
      let from = id && before.get(id);
      const isNew = !prevEls.has(it.el);
      if (!from && isNew) { const src = nearestRect(now, [...byEl.entries()].filter(([e]) => e.isConnected).map(([, r]) => r)); from = src; }
      if (!from || !rm) continue;
      const dx = (from.left + from.width / 2) - (now.left + now.width / 2), dy = (from.top + from.height / 2) - (now.top + now.height / 2);
      const sx = isNew ? Math.max(0.2, Math.min(1, from.width / now.width)) : from.width / now.width, sy = isNew ? Math.max(0.2, Math.min(1, from.height / now.height)) : from.height / now.height;
      const el2 = it.el, prev = el2.style.transition;
      el2.style.transition = 'none';
      el2.style.transform = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
      const kids = [...el2.children].filter((c) => !c.classList.contains('lgx-illum') && !c.classList.contains('lgx-shimmer'));
      if (isNew) kids.forEach((c) => { c.classList.add('lgx-content-fade'); c.style.opacity = '0'; });
      void el2.offsetWidth;
      el2.style.transition = `transform ${rm}ms cubic-bezier(.34,1.56,.64,1)`;
      el2.style.transform = '';
      if (isNew) requestAnimationFrame(() => kids.forEach((c) => { c.style.opacity = ''; }));
      setTimeout(() => { el2.style.transition = prev; }, rm + 30);
    }
    animateFor(rm + 120);
  }
  function nearest(r) {
    let best = null, bd = 1e9;
    for (const it of items.values()) { const q = it.el.getBoundingClientRect(); const d = Math.hypot(q.left + q.width / 2 - (r.left + r.width / 2), q.top + q.height / 2 - (r.top + r.height / 2)); if (d < bd) { bd = d; best = it.el; } }
    return best;
  }
  function nearestRect(r, list) {
    let best = null, bd = 1e9;
    for (const q of list) { const d = Math.hypot(q.left + q.width / 2 - (r.left + r.width / 2), q.top + q.height / 2 - (r.top + r.height / 2)); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  /** Pick up declarative children: [data-glass] inside this container. */
  function scan() {
    el.querySelectorAll('[data-glass]').forEach((c) => {
      if (items.has(c)) return;
      add(c, glassFromAttrs(c));
    });
    for (const c of [...items.keys()]) if (!c.isConnected || !el.contains(c)) remove(c);
  }
  const mo = new MutationObserver(() => applyFallbackLook());
  mo.observe(surface, { attributes: true, attributeFilter: ['data-lg-renderer'] });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => animateFor(50)) : null;
  ro && ro.observe(el);
  addEventListener('scroll', () => animateFor(80), { passive: true, capture: true });
  addEventListener('resize', () => animateFor(80));

  scan(); sync(); applyFallbackLook();
  const api = { el, add, remove, withAnimation, refresh() { scan(); animateFor(60); }, destroy() { cancelAnimationFrame(loop); mo.disconnect(); ro && ro.disconnect(); [...items.keys()].forEach(remove); inst() && inst().destroy(); surface.remove(); el.classList.remove('lgx-container'); } };
  el.__lgxContainer = api;
  return api;
}

// ---------------------------------------------------------------------------------------------------------------
// declarative
// ---------------------------------------------------------------------------------------------------------------
function glassFromAttrs(el) {
  const v = el.getAttribute('data-glass') || 'regular';
  let g = v === 'clear' ? Glass.clear : v === 'identity' ? Glass.identity : Glass.regular;
  const t = el.getAttribute('data-glass-tint'); if (t) g = g.tint(t);
  if (el.hasAttribute('data-glass-interactive')) g = g.interactive();
  return g;
}
/** Attach every [data-glass-container] and every standalone [data-glass] under root. */
function autoGlass(root = document) {
  const out = { containers: [], glass: [] };
  root.querySelectorAll('[data-glass-container]').forEach((c) => {
    if (c.__lgxContainer) return;
    out.containers.push(glassEffectContainer(c, { spacing: parseFloat(c.getAttribute('data-glass-container')) || 0 }));
  });
  root.querySelectorAll('[data-glass]').forEach((el) => {
    if (el.__lgxContainerItem || el.__lgRefraction || el.closest('[data-glass-container]')) return;
    out.glass.push(glassEffect(el, glassFromAttrs(el), { in: el.getAttribute('data-glass-shape') || 'capsule' }));
  });
  return out;
}

const LGGlass = { Glass, glassEffect, glassEffectContainer, glassFromAttrs, autoGlass };
if (typeof window !== 'undefined') window.LGGlass = LGGlass;

})();
