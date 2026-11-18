/**
 * Liquid Glass Lab — React components (web APPROXIMATION of iOS 26 Liquid Glass; not Apple's renderer).
 * Styling + behaviour are shared with the vanilla implementation in ./core.
 *
 * Wrap existing UI, don't rewrite it: every component forwards refs, native props and event handlers,
 * so swapping <button> for <GlassButton> keeps the app's logic intact.
 */
import React, {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect,
  useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import './liquid-glass.css';
// typed by ./liquid-glass.d.ts
import * as LG from './liquid-glass.js';
// v2 WebGL2 refraction engine, typed by ./liquid-glass-refraction.d.ts
import * as LGR from './liquid-glass-refraction.js';
import type { AttachOptions, GlassHandle, GlassMaterial, GlassShape, Backdrop, GlassPreset } from './liquid-glass-refraction.js';
export type { GlassMaterial, GlassShape, Backdrop, GlassPreset } from './liquid-glass-refraction.js';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------
export type GlassVariant = 'regular' | 'clear';
export type GlassSize = 'sm' | 'md' | 'lg';
export type GlassLayer = 'control' | 'navigation' | 'overlay';

export interface GlassPrefs {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  increaseContrast: boolean;
  forcedColors: boolean;
}

const DEV = typeof process !== 'undefined' && (process as any).env?.NODE_ENV !== 'production';
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (v: T) => refs.forEach((r) => {
    if (typeof r === 'function') r(v);
    else if (r) (r as React.MutableRefObject<T>).current = v;
  });
}

// ---------------------------------------------------------------------------
// provider: accessibility preferences (system media queries + optional app overrides)
// ---------------------------------------------------------------------------
const PrefsCtx = createContext<GlassPrefs>({ reduceMotion: false, reduceTransparency: false, increaseContrast: false, forcedColors: false });
export const useGlassPrefs = () => useContext(PrefsCtx);

export interface LiquidGlassProviderProps {
  children: React.ReactNode;
  /** App-level overrides (e.g. an in-app "Reduce transparency" setting). Applied as data-attributes on <html>. */
  overrides?: Partial<Pick<GlassPrefs, 'reduceMotion' | 'reduceTransparency' | 'increaseContrast'>>;
  /** Force a scheme for glass surfaces; default follows prefers-color-scheme. */
  scheme?: 'light' | 'dark';
}

export function LiquidGlassProvider({ children, overrides, scheme }: LiquidGlassProviderProps) {
  const [prefs, setPrefs] = useState<GlassPrefs>(() => (typeof window === 'undefined' ? { reduceMotion: false, reduceTransparency: false, increaseContrast: false, forcedColors: false } : LG.prefs()));
  useLayoutEffect(() => {
    const html = document.documentElement;
    const set = (attr: string, on?: boolean) => (on ? html.setAttribute(attr, '') : html.removeAttribute(attr));
    set('data-lg-rm', overrides?.reduceMotion);
    set('data-lg-rt', overrides?.reduceTransparency);
    set('data-lg-ic', overrides?.increaseContrast);
    if (scheme) html.setAttribute('data-lg-scheme', scheme); else html.removeAttribute('data-lg-scheme');
    LG.refresh();
    LGR.refresh();
    setPrefs(LG.prefs());
  }, [overrides?.reduceMotion, overrides?.reduceTransparency, overrides?.increaseContrast, scheme]);
  useEffect(() => {
    const qs = ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)'].map((q) => matchMedia(q));
    const on = () => { LG.refresh(); setPrefs(LG.prefs()); };
    qs.forEach((m) => m.addEventListener?.('change', on));
    return () => qs.forEach((m) => m.removeEventListener?.('change', on));
  }, []);
  return <PrefsCtx.Provider value={prefs}>{children}</PrefsCtx.Provider>;
}

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------
/** Wires pointer specular + press flex (Glass.interactive() analogue). */
export function useInteractive<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.setAttribute('data-lg-interactive', '');
    LG.init(el.parentElement ?? document);
  }, [enabled]);
  return ref;
}

/** Opt a surface into SVG refraction (Chromium only; no-op elsewhere or under a11y settings). */
export function useRefraction<T extends HTMLElement>(enabled: boolean, size: GlassSize = 'md') {
  const ref = useRef<T>(null);
  const prefs = useGlassPrefs();
  useEffect(() => {
    if (enabled && ref.current) LG.refract(ref.current, size);
  }, [enabled, size, prefs.reduceTransparency, prefs.increaseContrast]);
  return ref;
}

/**
 * v2 optical refraction (WebGL2). The backdrop must be drawable (canvas / img / video); DOM backdrops fall back
 * to v1 SVG refraction or blur automatically. Rollback at runtime: `?renderer=svg` or `liquidGlassRefraction.disableAll()`.
 */
export interface RefractionOptions {
  backdrop: React.RefObject<Backdrop | null>;
  /** Omit to read the element's border-radius (circle / ellipse / capsule / roundedRect / rect). */
  shape?: GlassShape;
  /** Default 'signature' — the chosen house look. */
  preset?: GlassPreset;
  material?: Partial<GlassMaterial>;
  /** true for <video> or a canvas you animate without calling liquidGlassRefraction.renderNow() */
  dynamic?: boolean;
  interactiveLight?: boolean;
}

export function useOpticalRefraction<T extends HTMLElement>(opts?: RefractionOptions) {
  const ref = useRef<T>(null);
  const handle = useRef<GlassHandle | null>(null);
  const shapeKey = JSON.stringify(opts?.shape ?? null);
  const matKey = JSON.stringify(opts?.material ?? null);
  // attach once the element and the backdrop exist; re-attach when the backdrop element changes
  useEffect(() => {
    const el = ref.current, bd = opts?.backdrop.current;
    if (!el || !opts || !bd) return;
    const o: AttachOptions = { backdrop: bd, shape: opts.shape ?? LGR.shapeFromElement(el), preset: opts.preset, material: opts.material, dynamic: opts.dynamic, interactiveLight: opts.interactiveLight };
    handle.current = LGR.attach(el, o);
    return () => { handle.current?.destroy(); handle.current = null; };
  }, [opts?.backdrop.current, !!opts]); // eslint-disable-line react-hooks/exhaustive-deps
  // live parameter updates without re-creating the instance
  useEffect(() => { handle.current?.update({ shape: opts?.shape, material: opts?.material }); }, [shapeKey, matKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// ---------------------------------------------------------------------------
// GlassSurface — base primitive (≈ .glassEffect(_:in:))
// ---------------------------------------------------------------------------
export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant;
  size?: GlassSize;
  /** Tint colour for the single primary action in a group (E-07: tint sparingly). */
  tint?: string | boolean;
  interactive?: boolean;
  refract?: boolean;
  /** Required layer classification; glass is not for the content layer. */
  layer?: GlassLayer;
  as?: keyof JSX.IntrinsicElements;
  /** v2 WebGL2 optical refraction over a drawable backdrop. Omit to keep v1 behaviour. */
  refraction?: RefractionOptions;
}

export const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(function GlassSurface(
  { variant = 'regular', size = 'md', tint, interactive, refract, layer = 'control', as = 'div', className, style, refraction, ...rest }, ref,
) {
  const iRef = useInteractive<HTMLElement>(!!interactive);
  const rRef = useRefraction<HTMLElement>(!!refract && !refraction, size);
  const oRef = useOpticalRefraction<HTMLElement>(refraction);
  const Tag = as as any;
  const tintStyle = typeof tint === 'string' ? ({ '--lg-tint': tint } as React.CSSProperties) : undefined;
  return (
    <Tag
      ref={mergeRefs(ref, iRef, rRef, oRef)}
      data-lg-layer={layer}
      data-lg-size={size}
      className={cx('lg-glass', variant === 'clear' && 'lg-glass--clear', size !== 'md' && `lg-glass--${size}`, tint && 'lg-glass--tinted', className)}
      style={{ ...tintStyle, ...style }}
      {...rest}
    />
  );
});

// ---------------------------------------------------------------------------
// Buttons (≈ .buttonStyle(.glass) / .glassProminent)
// ---------------------------------------------------------------------------
export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlassVariant;
  prominent?: boolean;
  tint?: string;
  size?: GlassSize;
  refract?: boolean;
  icon?: React.ReactNode;
  /** v2 WebGL2 optical refraction over a drawable backdrop. */
  refraction?: RefractionOptions;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'regular', prominent, tint, size = 'md', refract, icon, className, children, type = 'button', style, refraction, ...rest }, ref,
) {
  const iRef = useInteractive<HTMLButtonElement>(true);
  const rRef = useRefraction<HTMLButtonElement>(!!refract && !refraction, size);
  const oRef = useOpticalRefraction<HTMLButtonElement>(refraction);
  const iconOnly = !!icon && !children;
  if (DEV && iconOnly && !rest['aria-label'] && !rest['aria-labelledby']) {
    console.warn('[liquid-glass] icon-only GlassButton needs aria-label (Apple: provide an accessibility label for every icon).');
  }
  return (
    <button
      ref={mergeRefs(ref, iRef, rRef, oRef)}
      type={type}
      className={cx('lg-glass', 'lg-btn', iconOnly && 'lg-btn--icon', variant === 'clear' && 'lg-glass--clear', (prominent || tint) && 'lg-glass--tinted', size !== 'md' && `lg-glass--${size}`, className)}
      style={{ ...(tint ? ({ '--lg-tint': tint } as React.CSSProperties) : null), ...style }}
      {...rest}
    >
      {icon}
      {children != null && <span className="lg-label">{children}</span>}
    </button>
  );
});

/** Several actions sharing one glass background (toolbar grouping, E-01). Children should be <GroupButton>. */
export const GlassGroup = forwardRef<HTMLDivElement, GlassSurfaceProps>(function GlassGroup({ className, ...rest }, ref) {
  return <GlassSurface ref={ref as any} role="group" data-lg-container="" className={cx('lg-group', className)} {...rest} />;
});

export const GroupButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }>(
  function GroupButton({ icon, children, className, type = 'button', ...rest }, ref) {
    const iRef = useInteractive<HTMLButtonElement>(true);
    return (
      <button ref={mergeRefs(ref, iRef)} type={type} className={cx('lg-btn', !!icon && children == null && 'lg-btn--icon', className)} {...rest}>
        {icon}{children != null && <span>{children}</span>}
      </button>
    );
  });

// ---------------------------------------------------------------------------
// SegmentedControl (morphing pill ≈ GlassEffectContainer + glassEffectID)
// ---------------------------------------------------------------------------
export interface SegmentOption<V extends string> { value: V; label: React.ReactNode; icon?: React.ReactNode; ariaLabel?: string }
export interface SegmentedControlProps<V extends string> {
  options: Array<SegmentOption<V>>;
  value: V;
  onChange: (v: V) => void;
  'aria-label': string;
  /** 'glass' for floating controls; 'content' for in-page controls (no glass in content layer). */
  appearance?: 'glass' | 'content';
  refract?: boolean;
  className?: string;
}

export function SegmentedControl<V extends string>({ options, value, onChange, appearance = 'glass', refract, className, ...aria }: SegmentedControlProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  const rRef = useRefraction<HTMLDivElement>(!!refract && appearance === 'glass', 'md');
  const btns = useRef<Array<HTMLButtonElement | null>>([]);
  useLayoutEffect(() => { if (ref.current) LG.morphIndicator(ref.current); }, [value, options.length]);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => ref.current && LG.morphIndicator(ref.current));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const idx = options.findIndex((o) => o.value === value);
  const move = (d: number) => { const n = (idx + d + options.length) % options.length; onChange(options[n].value); btns.current[n]?.focus(); };
  return (
    <div
      ref={mergeRefs(ref, rRef)}
      role="tablist"
      aria-label={aria['aria-label']}
      data-lg-layer={appearance === 'glass' ? 'control' : undefined}
      className={cx('lg-segmented', appearance === 'glass' ? 'lg-glass' : 'lg-segmented--content', className)}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { btns.current[i] = el; }}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          aria-label={o.ariaLabel}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
          }}
        >
          {o.icon}{typeof o.label === 'string' ? <span>{o.label}</span> : o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FloatingTabBar (≈ TabView + .tabBarMinimizeBehavior(.onScrollDown), search tab separate)
// ---------------------------------------------------------------------------
export interface FloatingTabBarProps<V extends string> extends Omit<SegmentedControlProps<V>, 'appearance'> {
  /** Element that scrolls; tab bar minimizes on scroll down. */
  scrollRef?: React.RefObject<HTMLElement>;
  onSearch?: () => void;
  searchLabel?: string;
  /** Ref to the bar element, e.g. to pass to FloatingPanel.hideWhileOpen. */
  barRef?: React.Ref<HTMLDivElement>;
}
export function FloatingTabBar<V extends string>({ scrollRef, onSearch, searchLabel = 'Search', barRef, ...seg }: FloatingTabBarProps<V>) {
  const [min, setMin] = useState(false);
  useEffect(() => {
    const el = scrollRef?.current ?? window;
    let last = 0;
    const pos = () => (el === window ? window.scrollY : (el as HTMLElement).scrollTop);
    const on = () => { const y = pos(); if (Math.abs(y - last) < 6) return; setMin(y > last && y > 40); last = y; };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [scrollRef]);
  return (
    <nav aria-label="Main" data-lg-layer="navigation">
      <div ref={barRef} className={cx('lg-tabbar', min && 'is-minimized')}>
        <SegmentedControl {...seg} appearance="glass" refract={seg.refract ?? true} />
        {onSearch && (
          <GlassButton aria-label={searchLabel} onClick={onSearch} className="lg-tabbar__search"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>} />
        )}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// GlassMenu — morphs out of its trigger (button → menu, E-01)
// ---------------------------------------------------------------------------
export interface MenuItem { label: string; onSelect: () => void; icon?: React.ReactNode; destructive?: boolean; separatorBefore?: boolean }
export interface GlassMenuProps {
  /** Render-prop trigger; spread the given props onto a button (e.g. GroupButton / GlassButton). */
  trigger: (props: { ref: React.Ref<HTMLButtonElement>; onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => React.ReactElement;
  items: MenuItem[];
  label: string;
}
/**
 * The menu is portalled out of the trigger's glass group (otherwise it would be glass-on-glass) into the
 * nearest ancestor marked `data-lg-portal`, else document.body. That ancestor must be positioned.
 */
export function GlassMenu({ trigger, items, label }: GlassMenuProps) {
  const id = useId().replace(/:/g, '');
  const tRef = useRef<HTMLButtonElement>(null);
  const mRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setPortal((tRef.current?.closest('[data-lg-portal]') as HTMLElement | null) ?? document.body); }, []);
  const toggle = useCallback(() => {
    const t = tRef.current, m = mRef.current;
    if (!t || !m) return;
    if (m.hidden) { LG.refract(m, 'lg'); LG.openMenu(t, m); setOpen(true); }
    else { LG.closeMenu(m); setOpen(false); }
  }, []);
  useEffect(() => {
    const t = tRef.current;
    if (!t) return;
    const obs = new MutationObserver(() => setOpen(t.getAttribute('aria-expanded') === 'true'));
    obs.observe(t, { attributes: true, attributeFilter: ['aria-expanded'] });
    return () => obs.disconnect();
  }, []);
  return (
    <>
      {trigger({ ref: tRef, onClick: toggle, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': `lg-menu-${id}` })}
      {portal && createPortal(
      <div ref={mRef} id={`lg-menu-${id}`} role="menu" aria-label={label} hidden data-lg-layer="overlay" data-lg-size="lg" className="lg-glass lg-glass--lg lg-menu">
        {items.map((it, i) => (
          <React.Fragment key={i}>
            {it.separatorBefore && <div role="separator" />}
            <button role="menuitem" type="button" className={cx(it.destructive && 'is-destructive')}
              onClick={() => { it.onSelect(); if (mRef.current) LG.closeMenu(mRef.current); }}>
              <span>{it.label}</span>{it.icon}
            </button>
          </React.Fragment>
        ))}
      </div>,
        portal)}
    </>
  );
}

// ---------------------------------------------------------------------------
// FloatingPanel — overlay with materialize/dematerialize (lensing ramp, not plain fade)
// ---------------------------------------------------------------------------
export interface FloatingPanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  closeLabel?: string;
  /** Elements to dematerialize while open (e.g. the tab bar) so glass never stacks on glass. */
  hideWhileOpen?: Array<React.RefObject<HTMLElement>>;
}
export function FloatingPanel({ open, onClose, title, closeLabel = 'Close', hideWhileOpen = [], children, className, ...rest }: FloatingPanelProps) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    (async () => {
      if (open) {
        returnFocus.current = document.activeElement as HTMLElement;
        LG.refract(el, 'lg');
        for (const r of hideWhileOpen) if (r.current) await LG.dematerialize(r.current);
        await LG.materialize(el);
        closeRef.current?.focus();
      } else if (!el.hidden) {
        await LG.dematerialize(el);
        for (const r of hideWhileOpen) if (r.current) await LG.materialize(r.current);
        returnFocus.current?.focus();
      }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={ref} role="dialog" aria-modal="false" aria-labelledby={titleId} hidden data-lg-layer="overlay" data-lg-size="lg"
      className={cx('lg-glass lg-glass--lg lg-panel', className)} onKeyDown={(e) => e.key === 'Escape' && onClose()} {...rest}>
      <button ref={closeRef} type="button" className="lg-btn lg-btn--icon" aria-label={closeLabel} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <h2 id={titleId} style={{ margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Content-layer controls whose knob lifts into glass only while interacting (E-01, E-06)
// ---------------------------------------------------------------------------
export interface GlassSliderProps { value: number; onChange: (v: number) => void; min?: number; max?: number; 'aria-label'?: string; 'aria-labelledby'?: string; className?: string }
export function GlassSlider({ value, onChange, min = 0, max = 100, className, ...aria }: GlassSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, v)));
  const fromX = (x: number) => { const r = ref.current!.getBoundingClientRect(); onChange(clamp(min + ((x - r.left) / r.width) * (max - min))); };
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} {...aria}
      className={cx('lg-slider lg-focusable', drag && 'is-dragging', className)}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag(true); fromX(e.clientX); }}
      onPointerMove={(e) => drag && fromX(e.clientX)}
      onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1;
        const map: Record<string, number> = { ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step, Home: min, End: max };
        if (e.key in map) { e.preventDefault(); onChange(clamp(map[e.key])); }
      }}>
      <div className="lg-slider__track"><div className="lg-slider__fill" style={{ width: `${pct}%` }} /></div>
      <div className={cx('lg-slider__knob', drag && 'lg-glass lg-glass--sm')} style={{ left: `${pct}%` }} />
    </div>
  );
}

export interface GlassToggleProps { checked: boolean; onChange: (v: boolean) => void; 'aria-label'?: string; 'aria-labelledby'?: string; disabled?: boolean }
export function GlassToggle({ checked, onChange, disabled, ...aria }: GlassToggleProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} {...aria}
      className={cx('lg-toggle lg-focusable', pressed && 'is-pressed')}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      onClick={() => onChange(!checked)}>
      <span className="lg-toggle__knob" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ScrollEdge — legibility strip under floating bars (≈ scrollEdgeEffectStyle)
// ---------------------------------------------------------------------------
export function ScrollEdge({ edge, hard, height = 110 }: { edge: 'top' | 'bottom'; hard?: boolean; height?: number }) {
  return <div aria-hidden="true" className={cx('lg-scroll-edge', `lg-scroll-edge--${edge}`, hard && 'lg-scroll-edge--hard')} style={{ height }} />;
}

// ---------------------------------------------------------------------------
// Dev helper: run the rule audit and log issues (budget, glass-on-glass, content layer, labels)
// ---------------------------------------------------------------------------
export function useGlassAudit(deps: unknown[] = []) {
  useEffect(() => {
    if (!DEV) return;
    const id = setTimeout(() => { const r = LG.audit(); if (r.issues.length) console.warn('[liquid-glass] audit', r.issues); }, 300);
    return () => clearTimeout(id);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export const liquidGlass = LG;
export const liquidGlassRefraction = LGR;
