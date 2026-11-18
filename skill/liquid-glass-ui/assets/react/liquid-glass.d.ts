// Types for the shared vanilla core (implementations/web/src/liquid-glass.js, synced by web/build.mjs).
export interface Prefs { reduceMotion: boolean; reduceTransparency: boolean; increaseContrast: boolean; forcedColors: boolean }
export interface AuditReport { visibleGlass: number; refracting: number; issues: string[] }
export function init(root?: ParentNode): AuditReport;
export function refresh(root?: ParentNode): void;
export function refract(el: HTMLElement, size?: 'sm' | 'md' | 'lg'): boolean;
export function morphIndicator(group: HTMLElement): void;
export function openMenu(trigger: HTMLElement, menu: HTMLElement): void;
export function closeMenu(menu: HTMLElement, refocus?: boolean): void;
export function materialize(el: HTMLElement): Promise<void>;
export function dematerialize(el: HTMLElement): Promise<void>;
export function prefs(): Prefs;
export function audit(root?: ParentNode): AuditReport;
export function supportsRefraction(): boolean;
declare const LG: {
  init: typeof init; refresh: typeof refresh; refract: typeof refract; morphIndicator: typeof morphIndicator;
  openMenu: typeof openMenu; closeMenu: typeof closeMenu; materialize: typeof materialize; dematerialize: typeof dematerialize;
  prefs: typeof prefs; audit: typeof audit; supportsRefraction: typeof supportsRefraction;
};
export default LG;
