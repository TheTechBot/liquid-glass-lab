// Types for liquid-glass-effect.js — Apple-shaped (SwiftUI iOS 26) Liquid Glass API for the web.
import type { Backdrop, GlassShape } from './liquid-glass-refraction.js';
export type GlassVariantName = 'regular' | 'clear' | 'identity';
export declare class Glass {
  static readonly regular: Glass;
  static readonly clear: Glass;
  static readonly identity: Glass;
  readonly variant: GlassVariantName;
  readonly tintColor: string | null;
  readonly isInteractive: boolean;
  /** Semantic tint — primary action only. */
  tint(color: string): Glass;
  /** Press scale + bounce, touch illumination, shimmer, light follows the finger. */
  interactive(on?: boolean): Glass;
}
/** 'capsule' (default, like SwiftUI) | 'circle' | 'rect' | 'auto' | corner radius | { cornerRadius } | engine shape */
export type GlassEffectShape = 'capsule' | 'circle' | 'rect' | 'ellipse' | 'auto' | number | { cornerRadius: number } | GlassShape;
export interface GlassEffectOptions { in?: GlassEffectShape; backdrop?: Backdrop; dynamic?: boolean }
export interface GlassEffectHandle { el: HTMLElement; readonly glass: Glass; update(g: Glass): GlassEffectHandle; destroy(): void }
export declare function glassEffect(el: HTMLElement, glass?: Glass, opts?: GlassEffectOptions): GlassEffectHandle;
export interface GlassEffectContainerOptions { spacing?: number; backdrop?: Backdrop; dynamic?: boolean }
export interface GlassEffectContainerHandle {
  el: HTMLElement;
  add(child: HTMLElement, glass?: Glass, shape?: GlassEffectShape): { el: HTMLElement; set(g: Glass): void; destroy(): void };
  remove(child: HTMLElement): void;
  /** withAnimation(.bouncy) { … } — change the DOM inside; [data-glass-id] items morph. */
  withAnimation(mutate: () => void, opts?: { duration?: number }): void;
  refresh(): void;
  destroy(): void;
}
export declare function glassEffectContainer(el: HTMLElement, opts?: GlassEffectContainerOptions): GlassEffectContainerHandle;
export declare function glassFromAttrs(el: Element): Glass;
export declare function autoGlass(root?: ParentNode): { containers: GlassEffectContainerHandle[]; glass: GlassEffectHandle[] };
declare const LGGlass: { Glass: typeof Glass; glassEffect: typeof glassEffect; glassEffectContainer: typeof glassEffectContainer; glassFromAttrs: typeof glassFromAttrs; autoGlass: typeof autoGlass };
export default LGGlass;
