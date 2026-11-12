import SwiftUI
import UIKit

/// Ledger color tokens, the exact values of the web's `app/globals.css` (dark / light).
/// Names follow the web's Tailwind names; `primary` and `body` are renamed `primaryFill` and
/// `bodyText` because SwiftUI already has `Color.primary`.
/// Blue (`accent`) is the only color; `ok`, `warn` and `danger` are for state only.
extension Color {
    static let canvas = Color(dark: 0x0E0E0D, light: 0xF7F5EF)
    static let card = Color(dark: 0x141413, light: 0xFBFAF6)
    /// Pressed rows and hover fills.
    static let hoverFill = Color(dark: 0x1A1A18, light: 0xEFECE4)
    /// The web's `--deep` (near black in both themes, for inverted panels).
    static let deep = Color(dark: 0x090908, light: 0x141413)

    static let ink = Color(dark: 0xF2F0EA, light: 0x16161A)
    /// Body text (long prose uses this, not ink).
    static let bodyText = Color(dark: 0xF2F0EA, darkAlpha: 0.86, light: 0x16161A, lightAlpha: 0.86)
    /// Labels, meta, secondary text.
    static let mute = Color(dark: 0xF2F0EA, darkAlpha: 0.55, light: 0x16161A, lightAlpha: 0.64)
    /// Placeholders and disabled text.
    static let stone = Color(dark: 0xF2F0EA, darkAlpha: 0.28, light: 0x16161A, lightAlpha: 0.28)

    /// Row dividers (`--line`).
    static let hairline = Color(dark: 0xF2F0EA, darkAlpha: 0.08, light: 0x16161A, lightAlpha: 0.10)
    /// Section rules and control borders (`--line-2`).
    static let hairlineStrong = Color(dark: 0xF2F0EA, darkAlpha: 0.18, light: 0x16161A, lightAlpha: 0.22)
    /// Text input borders (`--field`).
    static let fieldBorder = Color(dark: 0xF2F0EA, darkAlpha: 0.42, light: 0x16161A, lightAlpha: 0.50)

    /// Primary button fill: the brightest thing on screen.
    static let primaryFill = Color(dark: 0xF2F0EA, light: 0x16161A)
    static let primaryOn = Color(dark: 0x0E0E0D, light: 0xF7F5EF)
    static let primaryHover = Color(dark: 0xE4E1D9, light: 0x2A2A2F)

    /// The one color: links, focus, toggles on, selected state.
    static let accent = Color(dark: 0x4C8DFF, light: 0x2A63CC)
    static let accentHover = Color(dark: 0x6FA3FF, light: 0x1F4FA8)
    static let accentOn = Color(dark: 0x0E0E0D, light: 0xFFFFFF)
    /// Accent tint behind selected items.
    static let wash = Color(dark: 0x4C8DFF, darkAlpha: 0.10, light: 0x2A63CC, lightAlpha: 0.09)

    static let ok = Color(dark: 0x4FBF85, light: 0x1A7048)
    static let danger = Color(dark: 0xEE5A4B, light: 0xBC2E23)
    static let warn = Color(dark: 0xD9A23A, light: 0x8A5E12)
    static let scrim = Color(dark: 0x090908, darkAlpha: 0.70, light: 0x16161A, lightAlpha: 0.40)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(uiColor: UIColor(hex: hex, alpha: alpha))
    }

    init(dark: UInt32, darkAlpha: Double = 1, light: UInt32, lightAlpha: Double = 1) {
        let darkColor = UIColor(hex: dark, alpha: darkAlpha)
        let lightColor = UIColor(hex: light, alpha: lightAlpha)
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .light ? lightColor : darkColor
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: Double = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: CGFloat(alpha)
        )
    }
}

/// The per-device appearance override (web theme toggle: System, Light, Dark).
enum ThemePreference: String, CaseIterable, Sendable {
    case system, light, dark

    static let storageKey = "themePreference"

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}
