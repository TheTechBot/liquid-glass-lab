// LiquidGlassKit — reusable components built on the lg* modifiers.
// Rule R6: prefer SYSTEM components (NavigationStack toolbars, TabView, sheets, menus, Picker(.segmented)).
// They adopt Liquid Glass automatically on OS 26. Use these custom components only for custom floating UI.

import SwiftUI

// MARK: - Segmented control with morphing glass selection

/// Floating segmented control. On OS 26 the selection pill morphs between segments via glassEffectID.
/// For an ordinary in-content picker, prefer `Picker(...).pickerStyle(.segmented)` (system adopts the new look).
public struct LGSegmentedControl<Value: Hashable & Sendable>: View {
    @Binding var selection: Value
    let options: [(value: Value, label: String)]
    let accessibilityLabel: String
    @Namespace private var ns
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ accessibilityLabel: String, selection: Binding<Value>, options: [(value: Value, label: String)]) {
        self.accessibilityLabel = accessibilityLabel
        self._selection = selection
        self.options = options
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(options.indices, id: \.self) { i in
                let opt = options[i]
                let selected = opt.value == selection
                Button {
                    withAnimation(reduceMotion ? .easeOut(duration: 0.14) : .spring(response: 0.32, dampingFraction: 0.78)) {
                        selection = opt.value
                    }
                } label: {
                    Text(opt.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(selected ? .primary : .secondary)
                        .padding(.horizontal, LGTokens.Spacing.lg)
                        .frame(minHeight: 36)
                        .background {
                            if selected {
                                Capsule().fill(.primary.opacity(0.12))
                                    .matchedGeometryEffect(id: "pill", in: ns)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
        .padding(4)
        .lgGlass()
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
    }
}

// MARK: - Button that morphs into an action cluster (button → menu morph, E-01 / E-05)

/// A glass button that expands into a row of glass actions. Uses GlassEffectContainer + glassEffectID so
/// the shapes morph on OS 26. For a standard dropdown, prefer SwiftUI `Menu` (adopts glass automatically).
public struct LGExpandingActions: View {
    public struct Action: Identifiable {
        public let id: String
        public let systemImage: String
        public let label: String
        public let perform: () -> Void
        public init(id: String, systemImage: String, label: String, perform: @escaping () -> Void) {
            self.id = id; self.systemImage = systemImage; self.label = label; self.perform = perform
        }
    }

    let actions: [Action]
    @State private var expanded = false
    @Namespace private var ns
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(actions: [Action]) { self.actions = actions }

    public var body: some View {
        LGContainer(spacing: LGTokens.Spacing.xl) {
            HStack(spacing: LGTokens.Spacing.md) {
                if expanded {
                    ForEach(actions) { a in
                        Button(action: a.perform) {
                            Image(systemName: a.systemImage)
                                .font(.system(size: 20, weight: .semibold))
                                .frame(width: LGTokens.Size.controlMd, height: LGTokens.Size.controlMd)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(a.label)
                        .lgGlass(interactive: true)
                        .lgGlassID(a.id, in: ns)
                    }
                }
                Button {
                    withAnimation(reduceMotion ? .easeOut(duration: 0.14) : .spring(response: 0.38, dampingFraction: 0.8)) {
                        expanded.toggle()
                    }
                } label: {
                    Image(systemName: expanded ? "xmark" : "ellipsis")
                        .font(.system(size: 20, weight: .semibold))
                        .frame(width: LGTokens.Size.controlMd, height: LGTokens.Size.controlMd)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(expanded ? "Close actions" : "More actions")
                .lgGlass(interactive: true)
                .lgGlassID("toggle", in: ns)
            }
        }
    }
}

// MARK: - Media controls (clear glass + dimming)

/// Clear glass is only for controls over media-rich content, with dimming and bold bright glyphs (E-06, E-07).
public struct LGMediaControls: View {
    @Binding var isPlaying: Bool
    let onPrevious: () -> Void
    let onNext: () -> Void
    /// Set false when the media underneath is already dark (HIG: dimming not needed then).
    var dimBrightContent: Bool

    public init(isPlaying: Binding<Bool>, dimBrightContent: Bool = true, onPrevious: @escaping () -> Void, onNext: @escaping () -> Void) {
        self._isPlaying = isPlaying
        self.dimBrightContent = dimBrightContent
        self.onPrevious = onPrevious
        self.onNext = onNext
    }

    public var body: some View {
        HStack(spacing: LGTokens.Spacing.lg) {
            control("backward.fill", "Previous track", onPrevious)
            control(isPlaying ? "pause.fill" : "play.fill", isPlaying ? "Pause" : "Play") { isPlaying.toggle() }
            control("forward.fill", "Next track", onNext)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, LGTokens.Spacing.lg)
        .padding(.vertical, LGTokens.Spacing.sm)
        .lgGlass(.clear)
        .lgClearDimming(dimBrightContent, in: Capsule().inset(by: -16))
    }

    private func control(_ symbol: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 24, weight: .bold))
                .frame(width: LGTokens.Size.hitTarget, height: LGTokens.Size.hitTarget)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Floating panel (overlay layer)

/// Custom floating panel. Prefer `.sheet` with detents — system sheets adopt glass and inset themselves on OS 26.
public struct LGFloatingPanel<Content: View>: View {
    let title: String
    let onClose: () -> Void
    let content: Content

    public init(_ title: String, onClose: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.title = title
        self.onClose = onClose
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: LGTokens.Spacing.md) {
            HStack {
                Text(title).font(.title2.weight(.bold))
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.body.weight(.semibold))
                        .frame(width: LGTokens.Size.hitTarget, height: LGTokens.Size.hitTarget)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            content
        }
        .padding(LGTokens.Spacing.xl)
        .lgGlass(in: .rect(cornerRadius: LGTokens.Radius.xl))
        .padding(.horizontal, 10)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

/// Materialize transition for custom glass that appears/disappears outside a container.
public extension AnyTransition {
    static var lgMaterialize: AnyTransition {
        .scale(scale: 0.94).combined(with: .opacity)
    }
}
