// Demo app for LiquidGlassKit. Deployment target: iOS 26.0 (uses system Liquid Glass + iOS 26 tab APIs).
// Create an iOS App project in Xcode 26, delete its generated App/ContentView files, add these two files,
// and add the LiquidGlassKit package (File ▸ Add Package Dependencies ▸ Add Local…). See ../../VALIDATION.md.

import SwiftUI
import LiquidGlassKit

@main
struct LiquidGlassDemoApp: App {
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

/// System TabView: adopts Liquid Glass automatically on iOS 26 (rule R6 — no custom tab bar on native).
struct RootView: View {
    @State private var query = ""
    var body: some View {
        TabView {
            Tab("Listen Now", systemImage: "play.circle.fill") { ListenNowView() }
            Tab("Browse", systemImage: "square.grid.2x2.fill") { Text("Browse") }
            Tab("Library", systemImage: "square.stack.fill") { Text("Library") }
            // Search tab: system separates it at the trailing end (Adopting Liquid Glass, E-01).
            Tab(role: .search) {
                NavigationStack { Text("Search").searchable(text: $query) }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}
