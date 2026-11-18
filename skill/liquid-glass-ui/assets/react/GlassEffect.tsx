/*
 * GlassEffect.tsx — SwiftUI-shaped Liquid Glass for React (web), on our WebGL2 engine. Approximation, not Apple's renderer.
 *
 *   SwiftUI                                   React
 *   Text("Hi").padding().glassEffect()        <GlassEffect>Hi</GlassEffect>
 *   .glassEffect(.clear, in: .circle)         <GlassEffect glass={Glass.clear} shape="circle">
 *   .regular.tint(.blue).interactive()        glass={Glass.regular.tint('#0a64e0').interactive()}
 *   isOn ? .regular : .identity               glass={isOn ? Glass.regular : Glass.identity}
 *   GlassEffectContainer(spacing: 30) { … }   <GlassEffectContainer spacing={30}> … </GlassEffectContainer>
 *   .glassEffectID("crop", in: ns)            <GlassEffect glassID="crop">
 *   withAnimation(.bouncy) { open.toggle() }  const animate = useGlassAnimation(); animate(() => setOpen(o => !o))
 *
 * Needs a drawable scene marked data-lg-backdrop-source (canvas / img / video) behind the glass.
 */
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Glass, glassEffect, glassEffectContainer } from './liquid-glass-effect.js';
import type { GlassEffectContainerHandle, GlassEffectHandle, GlassEffectShape } from './liquid-glass-effect.js';
import type { Backdrop } from './liquid-glass-refraction.js';

export { Glass };
export type { GlassEffectShape };

const ContainerCtx = createContext<React.MutableRefObject<GlassEffectContainerHandle | null> | null>(null);

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (v: T) => refs.forEach((r) => { if (typeof r === 'function') r(v); else if (r) (r as React.MutableRefObject<T>).current = v; });
}

export interface GlassEffectProps extends React.HTMLAttributes<HTMLElement> {
  glass?: Glass;
  shape?: GlassEffectShape;
  /** Morph identity inside a GlassEffectContainer (≈ glassEffectID). */
  glassID?: string;
  backdrop?: React.RefObject<Backdrop>;
  as?: keyof JSX.IntrinsicElements;
}

export const GlassEffect = forwardRef<HTMLElement, GlassEffectProps>(function GlassEffect(
  { glass = Glass.regular, shape = 'capsule', glassID, backdrop, as = 'div', ...rest }, ref,
) {
  const el = useRef<HTMLElement | null>(null);
  const container = useContext(ContainerCtx);
  const handle = useRef<GlassEffectHandle | { set(g: Glass): void; destroy(): void } | null>(null);
  useLayoutEffect(() => {
    const node = el.current; if (!node) return;
    const c = container?.current;
    if (c) { handle.current = c.add(node, glass, shape); }
    else handle.current = glassEffect(node, glass, { in: shape, backdrop: backdrop?.current ?? undefined });
    return () => { handle.current?.destroy(); handle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const h = handle.current as any; if (!h) return;
    if (typeof h.set === 'function') h.set(glass); else h.update(glass);
  }, [glass]);
  const Tag = as as any;
  return <Tag ref={mergeRefs(el, ref)} data-glass-id={glassID} data-glass-shape={typeof shape === 'string' || typeof shape === 'number' ? String(shape) : undefined} {...rest} />;
});

export interface GlassEffectContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: number;
  backdrop?: React.RefObject<Backdrop>;
}

export const GlassEffectContainer = forwardRef<HTMLDivElement, GlassEffectContainerProps>(function GlassEffectContainer(
  { spacing = 0, backdrop, children, ...rest }, ref,
) {
  const el = useRef<HTMLDivElement | null>(null);
  const handle = useRef<GlassEffectContainerHandle | null>(null);
  // the callback ref runs before children's layout effects, so the container exists when they attach
  const setEl = useCallback((n: HTMLDivElement | null) => {
    el.current = n;
    if (n && !handle.current) handle.current = glassEffectContainer(n, { spacing, backdrop: backdrop?.current ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { handle.current?.destroy(); handle.current = null; }, []);
  return (
    <ContainerCtx.Provider value={handle}>
      <div ref={mergeRefs(setEl, ref)} {...rest}>{children}</div>
    </ContainerCtx.Provider>
  );
});

/** withAnimation(.bouncy) for a container: `const animate = useGlassAnimation(containerRef); animate(() => setOpen(v => !v))`. */
export function useGlassAnimation(containerRef: React.RefObject<HTMLElement>) {
  return useCallback((update: () => void, opts?: { duration?: number }) => {
    const c = (containerRef.current as any)?.__lgxContainer as GlassEffectContainerHandle | undefined;
    if (!c) { update(); return; }
    c.withAnimation(() => flushSync(update), opts);
  }, [containerRef]);
}
