import SwiftUI

/// Spacing scale 4/8/12/16/24/32/48 (Ledger).
enum Spacing {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    static let xxxl: CGFloat = 48
    /// Phone side gutter.
    static let gutter: CGFloat = 16
}

/// Radii: 4 for controls, 6 for panels and wells. Never above 6 except pills (`Capsule`).
enum Radius {
    static let xs: CGFloat = 2
    static let sm: CGFloat = 4
    static let md: CGFloat = 6
}

/// Control sizes (touch sizes where the web is smaller).
enum Sizes {
    /// Every tappable control is at least this tall.
    static let control: CGFloat = 44
    static let controlSmall: CGFloat = 32
    static let hairline: CGFloat = 1
    static let statusDot: CGFloat = 8
    static let sheetPadding: CGFloat = 20
}

/// Motion tokens. Every animation goes through these so Reduce Motion is honored.
enum Motion {
    /// cubic-bezier(0.2, 0, 0, 1)
    static func ease(_ duration: Double) -> Animation {
        .timingCurve(0.2, 0, 0, 1, duration: duration)
    }

    static let fast = ease(0.15)
    static let enter = ease(0.2)
    /// Loading blocks breathe on this period (no shimmer).
    static let breathe: Double = 1.6
    static let stagger: Double = 0.04
}

private struct RiseModifier: ViewModifier {
    let delay: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 6)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(Motion.enter.delay(delay)) { shown = true }
            }
    }
}

extension View {
    /// Enter with a 6 pt rise and fade (200 ms). Stagger lists with `index * Motion.stagger`.
    func rise(delay: Double = 0) -> some View {
        modifier(RiseModifier(delay: delay))
    }

    /// The standard screen background.
    func canvasBackground() -> some View {
        background(Color.canvas.ignoresSafeArea())
    }
}
