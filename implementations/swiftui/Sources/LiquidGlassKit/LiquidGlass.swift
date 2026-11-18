// LiquidGlassKit — core modifiers.
//
// APPLE API (real Liquid Glass, iOS/iPadOS/macOS 26+), per developer.apple.com (evidence E-02…E-05):
//   Glass (.regular / .clear / .identity, .tint(_:), .interactive(_:))
//   View.glassEffect(_:in:)          GlassEffectContainer(spacing:content:)
//   View.glassEffectID(_:in:)        View.glassEffectUnion(id:namespace:)
//   View.glassEffectTransition(_:)   PrimitiveButtonStyle.glass / .glassProminent
//
// OUR CODE: the `lg*` wrappers add (1) an availability fallback to SwiftUI materials on iOS 17–18 /
// macOS 14–15, and (2) the design-system rules (layer, tint-sparingly, clear-glass dimming).
// The fallback is NOT Liquid Glass; it is a standard material.

import SwiftUI

// MARK: - Configuration

public enum LGVariant: Sendable, Equatable {
    /// Default. Adapts for legibility; use for text-heavy surfaces (HIG Materials, E-06).
    case regular
    /// Highly translucent. Only over media-rich content, with dimming, with bold bright foreground (E-07).
    case clear
}

/// Where a surface lives. Glass is for `.control`, `.navigation`, `.overlay` only (HIG: not in the content layer).
public enum LGLayer: Sendable { case control, navigation, overlay }

// MARK: - Base modifier

public struct LGGlassModifier<S: Shape>: ViewModifier {
    let variant: LGVariant
    let tint: Color?
    let interactive: Bool
    let shape: S
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    @ViewBuilder
    public func body(content: Content) -> some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            // Real Liquid Glass. The system applies Reduce Transparency / Increase Contrast / Reduce Motion itself.
            content.glassEffect(makeGlass(), in: shape)
        } else {
            // Fallback (approximation): standard material. We honour accessibility manually.
            content
                .background {
                    if reduceTransparency || contrast == .increased {
                        shape.fill(Color(white: 0.96).opacity(0.97))
                            .overlay(shape.stroke(Color.primary, lineWidth: contrast == .increased ? 1.5 : 0))
                    } else {
                        shape.fill(variant == .clear ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(.regularMaterial))
                            .overlay(shape.fill(tint.map { AnyShapeStyle($0.opacity(0.85)) } ?? AnyShapeStyle(Color.clear)))
                            .overlay(shape.stroke(.white.opacity(0.35), lineWidth: 0.5))
                    }
                }
                .shadow(color: .black.opacity(0.12), radius: 12, y: 6)
        }
    }

    @available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *)
    private func makeGlass() -> Glass {
        var g: Glass = (variant == .clear) ? .clear : .regular
        if let tint { g = g.tint(tint) }
        if interactive { g = g.interactive() }
        return g
    }
}

public extension View {
    /// Liquid Glass with a capsule (Apple's default shape for `glassEffect`).
    /// Apply AFTER other appearance modifiers (Apple: glassEffect captures the content it is applied to).
    func lgGlass(_ variant: LGVariant = .regular, tint: Color? = nil, interactive: Bool = false) -> some View {
        modifier(LGGlassModifier(variant: variant, tint: tint, interactive: interactive, shape: Capsule()))
    }

    /// Liquid Glass in a custom shape, e.g. `.rect(cornerRadius: LGTokens.Radius.lg)` for larger components.
    func lgGlass<S: Shape>(_ variant: LGVariant = .regular, tint: Color? = nil, interactive: Bool = false, in shape: S) -> some View {
        modifier(LGGlassModifier(variant: variant, tint: tint, interactive: interactive, shape: shape))
    }

    /// Morph identity inside an `LGContainer` (≈ glassEffectID). No-op before OS 26.
    @ViewBuilder
    func lgGlassID<ID: Hashable & Sendable>(_ id: ID, in namespace: Namespace.ID) -> some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            self.glassEffectID(id, in: namespace)
        } else {
            self
        }
    }

    /// Merge several views into one glass shape (≈ glassEffectUnion). No-op before OS 26.
    @ViewBuilder
    func lgGlassUnion<ID: Hashable & Sendable>(id: ID, namespace: Namespace.ID) -> some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            self.glassEffectUnion(id: id, namespace: namespace)
        } else {
            self
        }
    }

    /// HIG: dark dimming layer of 35% behind clear glass when the media underneath is bright (E-06).
    func lgClearDimming(_ enabled: Bool = true, in shape: some Shape = Rectangle()) -> some View {
        background { if enabled { shape.fill(.black.opacity(LGTokens.clearDimmingOpacity)) } }
    }

    /// System glass button styles on OS 26, bordered fallbacks before.
    @ViewBuilder
    func lgButtonStyle(prominent: Bool = false) -> some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            if prominent { self.buttonStyle(.glassProminent) } else { self.buttonStyle(.glass) }
        } else {
            if prominent { self.buttonStyle(.borderedProminent) } else { self.buttonStyle(.bordered) }
        }
    }
}

// MARK: - Container

/// Groups glass shapes so they render together, blend by `spacing`, and can morph (≈ GlassEffectContainer).
/// Apple: combining effects in a container improves rendering performance (E-01, E-05).
public struct LGContainer<Content: View>: View {
    let spacing: CGFloat?
    let content: Content

    public init(spacing: CGFloat? = LGTokens.containerSpacing, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    @ViewBuilder
    public var body: some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}
