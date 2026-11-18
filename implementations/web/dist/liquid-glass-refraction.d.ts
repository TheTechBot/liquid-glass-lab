// Types for the v2 WebGL2 refraction engine (implementations/web/src/liquid-glass-refraction.js).
export type GlassShape =
  | { type: 'rect' }
  | { type: 'roundedRect'; radius: number }
  | { type: 'circle' }
  | { type: 'ellipse' }
  | { type: 'capsule' }
  | { type: 'path'; d: string; viewBox?: [number, number, number, number]; fillRule?: 'nonzero' | 'evenodd' }
  | { type: 'polygon'; points: Array<[number, number]>; units?: 'fraction' | 'px' }
  | { type: 'union'; k: number; rects: Array<{ x: number; y: number; w: number; h: number; r?: number }>; hmin?: number };
export interface GlassMaterial {
  profile: 'rim' | 'physical';
  ior: number; thickness: number; curvature: number; refraction: number; edge: number; fresnel: number;
  blur: number; tint: string; reflection: number; dispersion: number; shadow: number; lightAngle: number; maxOffset: number;
}
export type Backdrop = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
export type GlassPreset = 'signature' | 'control' | 'media' | 'overlay' | 'overlay-dark';
export interface AttachOptions {
  backdrop?: Backdrop;
  /** Base material; default 'signature' (the user's chosen look). `material` overrides on top. */
  preset?: GlassPreset;
  /** Re-upload the backdrop every frame (video, animated canvas you don't redraw via renderNow). */
  dynamic?: boolean;
  shape?: GlassShape;
  material?: Partial<GlassMaterial>;
  /** Where the backdrop is displayed on screen; default backdrop.getBoundingClientRect(). */
  backdropRect?: () => DOMRect;
  interactiveLight?: boolean;
  /** 0 final, 1 normals, 2 UV offset, 3 distance bands */
  debug?: 0 | 1 | 2 | 3;
}
export interface GlassHandle {
  readonly active: boolean;
  update(o: Partial<AttachOptions>): void;
  resume(): void;
  destroy(): void;
}
export const SIGNATURE: Readonly<GlassMaterial>;
export const DEFAULT_MATERIAL: Readonly<GlassMaterial>;
export const PRESETS: Readonly<Record<GlassPreset, Readonly<GlassMaterial>>>;
export function autoAttach(root?: ParentNode, opts?: { observe?: boolean }): GlassHandle[];
export function shapeFromElement(el: HTMLElement): GlassShape;
export function attach(el: HTMLElement, opts?: AttachOptions): GlassHandle;
export function isSupported(): boolean;
export const supportInfo: { reason: string };
export function refresh(): void;
export function disableAll(): void;
export function enableAll(): void;
export function invalidate(src: Backdrop): void;
export function renderNow(): void;
export function stats(): { frames: number; lastMs: number; avgMs: number; instances: number; renderer: string } | null;
declare const LGRefraction: {
  attach: typeof attach; autoAttach: typeof autoAttach; shapeFromElement: typeof shapeFromElement; SIGNATURE: typeof SIGNATURE; PRESETS: typeof PRESETS; isSupported: typeof isSupported; supportInfo: typeof supportInfo; refresh: typeof refresh;
  disableAll: typeof disableAll; enableAll: typeof enableAll; invalidate: typeof invalidate; renderNow: typeof renderNow;
  stats: typeof stats; DEFAULT_MATERIAL: typeof DEFAULT_MATERIAL;
};
export default LGRefraction;
