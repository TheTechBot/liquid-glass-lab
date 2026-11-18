/**
 * Liquid Glass Lab — React Native, platform-aware.
 *
 *  iOS 26+ (API present)  → REAL Liquid Glass via expo-glass-effect (UIVisualEffectView under the hood, E-09).
 *  iOS < 26               → expo-blur BlurView with system material tint (standard material, NOT Liquid Glass).
 *  Android                → translucent fill (default) or expo-blur when the app supplies a BlurTargetView.
 *                           Android has no system Liquid Glass; this is an approximation.
 *
 * Accessibility: expo's isLiquidGlassAvailable() does not reflect user settings (E-09), so we read
 * AccessibilityInfo ourselves and fall back to opaque fills under Reduce Transparency.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View,
  useColorScheme, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
  type PressableProps, type StyleProp, type ViewProps, type ViewStyle, type ColorValue,
} from 'react-native';
import { GlassView, GlassContainer, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { tokens } from './tokens';

export type GlassVariant = 'regular' | 'clear';
export type GlassTier = 'native-liquid-glass' | 'blur-material' | 'translucent-fill';

// ---------------------------------------------------------------------------
// capabilities + accessibility
// ---------------------------------------------------------------------------
export interface GlassCapabilities {
  tier: GlassTier;
  reduceTransparency: boolean;
  reduceMotion: boolean;
  scheme: 'light' | 'dark';
}

function detectTier(): GlassTier {
  if (Platform.OS === 'ios') {
    // isGlassEffectAPIAvailable guards against iOS 26 betas without the API (crash risk, E-09).
    try { if (isGlassEffectAPIAvailable() && isLiquidGlassAvailable()) return 'native-liquid-glass'; } catch { /* fall through */ }
    return 'blur-material';
  }
  return 'translucent-fill';
}

const CapsCtx = createContext<GlassCapabilities | null>(null);

export function LiquidGlassProvider({ children, forceTier }: { children: React.ReactNode; forceTier?: GlassTier }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [rt, setRt] = useState(false);
  const [rm, setRm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled().then(setRt).catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled().then(setRm).catch(() => {});
    const a = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setRt);
    const b = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => { a.remove(); b.remove(); };
  }, []);
  const value = useMemo<GlassCapabilities>(() => ({ tier: forceTier ?? detectTier(), reduceTransparency: rt, reduceMotion: rm, scheme }), [forceTier, rt, rm, scheme]);
  return <CapsCtx.Provider value={value}>{children}</CapsCtx.Provider>;
}

export function useGlassCapabilities(): GlassCapabilities {
  const ctx = useContext(CapsCtx);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return ctx ?? { tier: detectTier(), reduceTransparency: false, reduceMotion: false, scheme };
}

// ---------------------------------------------------------------------------
// GlassSurface
// ---------------------------------------------------------------------------
export interface GlassSurfaceProps extends ViewProps {
  variant?: GlassVariant;
  tint?: ColorValue;
  interactive?: boolean;
  radius?: number;
  /** Android only: element to blur behind (expo-blur BlurTargetView ref). Without it Android uses a fill. */
  androidBlurTarget?: React.ComponentProps<typeof BlurView>['blurTarget'];
}

/**
 * Do NOT animate opacity on this component or its parents on iOS 26: glass may not render at opacity < 1
 * (expo known issue, E-09). Animate a wrapper's transform instead, or switch variant to 'none'.
 */
export function GlassSurface({ variant = 'regular', tint, interactive, radius = tokens.radius.capsule, style, children, androidBlurTarget, ...rest }: GlassSurfaceProps) {
  const caps = useGlassCapabilities();
  const m = tokens.material;
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };

  if (caps.reduceTransparency) {
    return (
      <View style={[shape, { backgroundColor: m.reducedTransparency[caps.scheme].fill }, style]} {...rest}>
        {children}
      </View>
    );
  }

  if (caps.tier === 'native-liquid-glass') {
    return (
      <GlassView glassEffectStyle={variant} tintColor={tint} isInteractive={interactive} style={[shape, style]} {...rest}>
        {children}
      </GlassView>
    );
  }

  if (caps.tier === 'blur-material' || androidBlurTarget) {
    const blurTint = variant === 'clear'
      ? (caps.scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight')
      : (caps.scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight');
    return (
      <BlurView
        intensity={variant === 'clear' ? 30 : 70}
        tint={Platform.OS === 'ios' ? blurTint : caps.scheme}
        blurTarget={androidBlurTarget}
        blurMethod={androidBlurTarget ? 'dimezisBlurViewSdk31Plus' : undefined}
        style={[shape, styles.rim, tint ? { backgroundColor: tint } : null, style]}
        {...rest}
      >
        {children}
      </BlurView>
    );
  }

  // translucent-fill (Android default)
  const fill = variant === 'clear' ? m.clear[caps.scheme].fill : m.regular[caps.scheme].fillThick;
  return (
    <View style={[shape, styles.rim, { backgroundColor: tint ?? fill }, style]} {...rest}>
      {children}
    </View>
  );
}

/** Group glass so shapes render together and can merge (iOS 26). Plain View elsewhere. */
export function GlassGroup({ spacing = tokens.spacing.xl, style, children, ...rest }: ViewProps & { spacing?: number }) {
  const caps = useGlassCapabilities();
  if (caps.tier === 'native-liquid-glass' && !caps.reduceTransparency) {
    return <GlassContainer spacing={spacing} style={style} {...rest}>{children}</GlassContainer>;
  }
  return <View style={style} {...rest}>{children}</View>;
}

// ---------------------------------------------------------------------------
// GlassButton — press flex (Glass.interactive() analogue on non-native tiers)
// ---------------------------------------------------------------------------
export interface GlassButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label?: string;
  icon?: React.ReactNode;
  variant?: GlassVariant;
  /** Tint only the single primary action (E-07). */
  prominent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassButton({ label, icon, variant = 'regular', prominent, style, accessibilityLabel, onPressIn, onPressOut, ...rest }: GlassButtonProps) {
  const caps = useGlassCapabilities();
  const scale = useRef(new Animated.Value(1)).current;
  const native = caps.tier === 'native-liquid-glass';
  const animate = (to: number) => {
    if (native) return; // isInteractive glass provides its own system response
    if (caps.reduceMotion) { scale.setValue(1); return; }
    Animated.spring(scale, { toValue: to, stiffness: tokens.motion.spring.stiffness, damping: tokens.motion.spring.damping, mass: 1, useNativeDriver: true }).start();
  };
  const iconOnly = !!icon && !label;
  if (__DEV__ && iconOnly && !accessibilityLabel) console.warn('[liquid-glass] icon-only GlassButton needs accessibilityLabel');
  const text = prominent ? tokens.tint.accentText : tokens.material.regular[caps.scheme].text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={iconOnly ? 6 : undefined}
      onPressIn={(e) => { animate(tokens.motion.pressScale); onPressIn?.(e); }}
      onPressOut={(e) => { animate(1); onPressOut?.(e); }}
      {...rest}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <GlassSurface variant={variant} interactive tint={prominent ? tokens.tint.accent : undefined}
          style={[styles.btn, iconOnly && styles.iconBtn, style]}>
          {icon}
          {label ? <Text style={[styles.btnText, { color: text }]}>{label}</Text> : null}
        </GlassSurface>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// SegmentedControl / FloatingTabBar with animated pill
// ---------------------------------------------------------------------------
export interface Segment<V extends string> { value: V; label: string; icon?: React.ReactNode }
export function GlassSegmentedControl<V extends string>({ segments, value, onChange, accessibilityLabel, style }: {
  segments: Segment<V>[]; value: V; onChange: (v: V) => void; accessibilityLabel: string; style?: StyleProp<ViewStyle>;
}) {
  const caps = useGlassCapabilities();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    const cfg = caps.reduceMotion
      ? { duration: tokens.motion.reducedMotionDuration, easing: Easing.out(Easing.quad), useNativeDriver: false }
      : null;
    if (cfg) Animated.parallel([Animated.timing(x, { ...cfg, toValue: l.x }), Animated.timing(w, { ...cfg, toValue: l.width })]).start();
    else Animated.parallel([
      Animated.spring(x, { toValue: l.x, stiffness: tokens.motion.spring.stiffness, damping: tokens.motion.spring.damping, useNativeDriver: false }),
      Animated.spring(w, { toValue: l.width, stiffness: tokens.motion.spring.stiffness, damping: tokens.motion.spring.damping, useNativeDriver: false }),
    ]).start();
  }, [value, layouts, caps.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const textColor = tokens.material.regular[caps.scheme].text;
  return (
    <GlassSurface style={[styles.seg, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <Animated.View pointerEvents="none" style={[styles.pill, { left: x, width: w, backgroundColor: caps.scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)' }]} />
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <Pressable key={s.value} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={s.label}
            onPress={() => onChange(s.value)} style={styles.segItem}
            onLayout={(e: LayoutChangeEvent) => { const { x: lx, width } = e.nativeEvent.layout; setLayouts((p) => ({ ...p, [s.value]: { x: lx, width } })); }}>
            {s.icon}
            <Text style={[styles.segText, { color: textColor, opacity: selected ? 1 : 0.62 }]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </GlassSurface>
  );
}

/** Returns an onScroll handler + `minimized` flag (≈ tabBarMinimizeBehavior(.onScrollDown)). */
export function useMinimizeOnScroll(threshold = 40) {
  const [minimized, setMin] = useState(false);
  const last = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (Math.abs(y - last.current) < 6) return;
    setMin(y > last.current && y > threshold);
    last.current = y;
  };
  return { minimized, onScroll };
}

export function FloatingTabBar<V extends string>({ tabs, value, onChange, onSearch, minimized, bottomInset = 28 }: {
  tabs: Segment<V>[]; value: V; onChange: (v: V) => void; onSearch?: () => void; minimized?: boolean; bottomInset?: number;
}) {
  const caps = useGlassCapabilities();
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const to = minimized ? 0.86 : 1;
    if (caps.reduceMotion) s.setValue(to);
    else Animated.spring(s, { toValue: to, stiffness: 300, damping: 28, useNativeDriver: true }).start();
  }, [minimized, caps.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View accessibilityRole="tabbar" style={[styles.tabbar, { bottom: bottomInset, transform: [{ scale: s }] }]}>
      <GlassGroup style={styles.tabRow}>
        <GlassSegmentedControl segments={tabs} value={value} onChange={onChange} accessibilityLabel="Tabs" style={{ flex: 1, height: tokens.size.tabBar }} />
        {onSearch ? <GlassButton accessibilityLabel="Search" onPress={onSearch} icon={<Text style={{ fontSize: 20 }}>⌕</Text>} style={{ width: tokens.size.tabBar, height: tokens.size.tabBar }} /> : null}
      </GlassGroup>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Media controls — clear glass + HIG 35% dimming (E-06)
// ---------------------------------------------------------------------------
export function GlassMediaControls({ playing, onToggle, onPrev, onNext, dim = true }: {
  playing: boolean; onToggle: () => void; onPrev: () => void; onNext: () => void; dim?: boolean;
}) {
  return (
    <View style={styles.mediaWrap}>
      {dim ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
      <GlassSurface variant="clear" style={styles.media}>
        {[['⏮', 'Previous track', onPrev], [playing ? '⏸' : '▶', playing ? 'Pause' : 'Play', onToggle], ['⏭', 'Next track', onNext]].map(([g, l, fn]) => (
          <Pressable key={l as string} accessibilityRole="button" accessibilityLabel={l as string} onPress={fn as () => void} style={styles.mediaBtn}>
            <Text style={styles.mediaGlyph}>{g as string}</Text>
          </Pressable>
        ))}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  rim: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.45)' },
  btn: { minHeight: tokens.size.controlMd, paddingHorizontal: tokens.spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.xs },
  iconBtn: { width: tokens.size.controlMd, paddingHorizontal: 0 },
  btnText: { fontSize: 15, fontWeight: '600' },
  seg: { flexDirection: 'row', padding: 4, alignItems: 'stretch' },
  segItem: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, zIndex: 1 },
  segText: { fontSize: 13, fontWeight: '600' },
  pill: { position: 'absolute', top: 4, bottom: 4, borderRadius: 999 },
  tabbar: { position: 'absolute', left: 16, right: 16 },
  tabRow: { flexDirection: 'row', gap: tokens.spacing.sm },
  mediaWrap: { alignSelf: 'center', borderRadius: 999, padding: 0 },
  dim: { backgroundColor: tokens.material.clear.dimming.value, borderRadius: 999, margin: -16 },
  media: { flexDirection: 'row', padding: 6, gap: 6 },
  mediaBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  mediaGlyph: { color: '#fff', fontSize: 24, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
});
