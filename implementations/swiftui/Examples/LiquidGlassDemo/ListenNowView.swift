import SwiftUI
import LiquidGlassKit

/// Mirrors the web demo. Content layer = plain views. Glass only on floating controls/overlays.
struct ListenNowView: View {
    // existing app state — unchanged by adopting glass
    @State private var isPlaying = true
    @State private var section = "foryou"
    @State private var volume = 60.0
    @State private var crossfade = true
    @State private var showPanel = false
    @State private var log = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    hero
                    // In-content picker: system segmented style (no custom glass in content layer).
                    Picker("Section", selection: $section) {
                        Text("For You").tag("foryou")
                        Text("Library").tag("library")
                        Text("Browse").tag("browse")
                    }
                    .pickerStyle(.segmented)

                    // Content cards: NO glass (HIG Materials: don't use Liquid Glass in the content layer).
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        ForEach(["Morning Run", "Deep Focus", "Night Drive", "Weekend"], id: \.self) { name in
                            VStack(alignment: .leading, spacing: 4) {
                                RoundedRectangle(cornerRadius: 18).fill(.tint.gradient).frame(height: 110)
                                Text(name).font(.subheadline.weight(.semibold))
                            }
                            .padding(12)
                            .background(.background, in: .rect(cornerRadius: 26))
                        }
                    }

                    // System controls: Slider/Toggle knobs become glass during interaction automatically on iOS 26.
                    VStack {
                        LabeledContent("Volume") { Slider(value: $volume, in: 0...100) }
                        Toggle("Crossfade", isOn: $crossfade)
                    }
                    .padding()
                    .background(.background, in: .rect(cornerRadius: 26))

                    HStack {
                        Button("Favourite") { log = "fav" }.lgButtonStyle()
                        Button("Sleep timer…") { withAnimation { showPanel = true } }.lgButtonStyle(prominent: true)
                    }
                    Text(log).font(.footnote).foregroundStyle(.secondary)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Listen Now")
            .toolbar {
                // Toolbar items get glass automatically; group related items (E-01). No custom backgrounds (R6).
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add to library", systemImage: "plus") { log = "added" }
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("More", systemImage: "ellipsis") {
                        Button("Share", systemImage: "square.and.arrow.up") { log = "share" }
                        Button("Remove", systemImage: "trash", role: .destructive) { log = "removed" }
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if showPanel {
                    LGFloatingPanel("Sleep timer", onClose: { withAnimation { showPanel = false } }) {
                        Text("Custom overlay using glassEffect in a rounded rect.")
                            .foregroundStyle(.secondary)
                    }
                    .transition(.lgMaterialize)
                    .padding(.bottom, 8)
                }
            }
        }
    }

    private var hero: some View {
        ZStack(alignment: .bottom) {
            LinearGradient(colors: [.orange, .pink, .purple, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
                .frame(height: 380)
                .overlay(alignment: .topLeading) {
                    VStack(alignment: .leading) {
                        Text("Golden Hour").font(.title.bold())
                        Text("Lab Sessions").font(.headline)
                    }
                    .foregroundStyle(.white)
                    .padding(20)
                }
            // Clear glass over media + dimming (only legit use of .clear).
            LGMediaControls(isPlaying: $isPlaying, onPrevious: { log = "prev" }, onNext: { log = "next" })
                .padding(.bottom, 22)
        }
        .clipShape(.rect(cornerRadius: 34))
        .overlay(alignment: .topTrailing) {
            LGExpandingActions(actions: [
                .init(id: "like", systemImage: "heart", label: "Like") { log = "like" },
                .init(id: "share", systemImage: "square.and.arrow.up", label: "Share") { log = "share" },
            ])
            .padding(12)
        }
    }
}

#Preview { RootView() }
