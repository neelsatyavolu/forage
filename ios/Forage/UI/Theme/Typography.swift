import SwiftUI

/// Bundled faces (PostScript names), registered through `UIAppFonts` in Info.plist.
enum FontFace: String, CaseIterable {
    case sans = "Geist-Regular"
    case sansMedium = "Geist-Medium"
    case sansSemibold = "Geist-SemiBold"
    case mono = "GeistMono-Regular"
    case monoMedium = "GeistMono-Medium"
    /// Newsreader: what people read (titles, place names, AI reasons, empty states).
    case serif = "Newsreader-Regular"
}

/// Ledger type scale. Newsreader for reading, Geist for controls, Geist Mono for every number,
/// date, score, distance, price and label (sentence case, never uppercase-tracked).
/// Apply with `.textStyle(_:)`, which sets face, size (Dynamic Type aware), tracking and line spacing.
enum TextStyle: CaseIterable {
    /// Screen title, serif 32 (the web's mobile page title).
    case title
    /// Serif 24: a place name on its own screen, sheet heroes.
    case titleSmall
    /// Serif 18: ledes, AI reasons, taste summary, empty states.
    case lede
    /// Sans medium 16: sheet titles, row titles that need weight.
    case headline
    /// Sans 15: default body.
    case body
    /// Sans 14: secondary body, row titles.
    case bodySmall
    /// Sans medium 14 / 13.
    case button, buttonSmall
    /// Sans 12: captions under rows.
    case caption
    /// Mono 12: section labels, field labels, meta, errors.
    case label
    /// Mono 14: inline numbers (distance, price, dates).
    case mono
    /// Mono 20: scores in rows.
    case score
    /// Mono 28: a score on its own screen.
    case scoreLarge

    var face: FontFace {
        switch self {
        case .title, .titleSmall, .lede: .serif
        case .headline, .button, .buttonSmall: .sansMedium
        case .label, .mono, .score, .scoreLarge: .mono
        case .body, .bodySmall, .caption: .sans
        }
    }

    var size: CGFloat {
        switch self {
        case .title: 32
        case .titleSmall: 24
        case .lede: 18
        case .headline: 16
        case .body: 15
        case .bodySmall, .button, .mono: 14
        case .buttonSmall: 13
        case .caption, .label: 12
        case .score: 20
        case .scoreLarge: 28
        }
    }

    /// Line height as a multiple of the size (CSS `line-height`).
    var lineHeight: CGFloat {
        switch self {
        case .title: 1.1
        case .titleSmall: 1.2
        case .lede: 1.5
        case .body: 1.55
        case .bodySmall: 1.45
        case .score, .scoreLarge: 1.0
        default: 1.4
        }
    }

    /// Tracking in em.
    var trackingEm: CGFloat {
        switch self {
        case .title, .titleSmall: -0.01
        default: 0
        }
    }

    var relativeTo: Font.TextStyle {
        switch self {
        case .title, .scoreLarge: .largeTitle
        case .titleSmall: .title2
        case .lede, .score: .title3
        case .headline: .headline
        case .body: .body
        case .bodySmall, .button, .buttonSmall, .mono: .callout
        case .caption, .label: .caption
        }
    }

    var font: Font { .custom(face.rawValue, size: size, relativeTo: relativeTo) }
    var tracking: CGFloat { trackingEm * size }
    var lineSpacing: CGFloat { max(0, (lineHeight - 1.15) * size) }
    var isMono: Bool { face == .mono || face == .monoMedium }
}

extension Font {
    /// A bundled face at a fixed design size that still scales with Dynamic Type.
    static func forage(_ face: FontFace, size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(face.rawValue, size: size, relativeTo: style)
    }
}

private struct TextStyleModifier: ViewModifier {
    let style: TextStyle

    func body(content: Content) -> some View {
        content
            .font(style.font)
            .tracking(style.tracking)
            .lineSpacing(style.lineSpacing)
            .monospacedDigit()
    }
}

extension View {
    /// Applies a Ledger type style.
    func textStyle(_ style: TextStyle) -> some View {
        modifier(TextStyleModifier(style: style))
    }
}
