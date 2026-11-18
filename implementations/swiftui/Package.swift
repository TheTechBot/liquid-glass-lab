// swift-tools-version: 6.0
// LiquidGlassKit — thin, rule-enforcing layer over Apple's real Liquid Glass APIs (iOS/macOS 26),
// with a material fallback for earlier OS versions. NOT compiled in this project (Windows host) —
// see VALIDATION.md for Mac/Xcode steps.
import PackageDescription

let package = Package(
    name: "LiquidGlassKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "LiquidGlassKit", targets: ["LiquidGlassKit"])],
    targets: [.target(name: "LiquidGlassKit")]
)
