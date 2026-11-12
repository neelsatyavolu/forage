import SwiftUI

/// Ledger buttons (the web's `Button` variants). One `.primary` or `.accent` per screen;
/// `.ghost` beside it; `.quiet` and `.link` for text actions.
/// Usage: `Button("Sign in") { … }.buttonStyle(.forage(.primary))`.
struct ForageButtonStyle: ButtonStyle {
    enum Kind: Sendable {
        /// Ink fill, canvas text: the brightest thing on screen.
        case primary
        /// Blue fill, for the single most important action.
        case accent
        /// No fill, strong hairline border.
        case ghost
        /// No fill, mute text that darkens when pressed.
        case quiet
        /// No fill, accent text (inline links).
        case link
        /// Ghost shape with danger text.
        case destructive
    }

    var kind: Kind = .primary
    var small = false
    var fullWidth = false
    var isLoading = false

    func makeBody(configuration: Configuration) -> some View {
        StyledButton(configuration: configuration, kind: kind, small: small, fullWidth: fullWidth, isLoading: isLoading)
    }
}

private struct StyledButton: View {
    let configuration: ButtonStyleConfiguration
    let kind: ForageButtonStyle.Kind
    let small: Bool
    let fullWidth: Bool
    let isLoading: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let pressed = configuration.isPressed
        HStack(spacing: Spacing.sm) {
            if isLoading { Spinner(color: foreground(pressed: pressed)) }
            configuration.label
        }
        .textStyle(small ? .buttonSmall : .button)
        .foregroundStyle(isEnabled ? foreground(pressed: pressed) : Color.stone)
        .padding(.horizontal, hasChrome ? (small ? Spacing.md : Spacing.lg) : 0)
        .frame(minHeight: hasChrome ? (small ? Sizes.controlSmall : Sizes.control) : Sizes.control)
        .frame(maxWidth: fullWidth ? .infinity : nil)
        .background(background(pressed: pressed), in: RoundedRectangle(cornerRadius: Radius.sm))
        .overlay {
            if let border = border(pressed: pressed) {
                RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(border, lineWidth: Sizes.hairline)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: Radius.sm))
        .animation(Motion.fast, value: pressed)
    }

    private var hasChrome: Bool { kind != .quiet && kind != .link }

    private func foreground(pressed: Bool) -> Color {
        switch kind {
        case .primary: .primaryOn
        case .accent: .accentOn
        case .ghost: .ink
        case .quiet: pressed ? .ink : .mute
        case .link: pressed ? .accentHover : .accent
        case .destructive: .danger
        }
    }

    private func background(pressed: Bool) -> Color {
        guard isEnabled else { return kind == .primary || kind == .accent ? .hoverFill : .clear }
        switch kind {
        case .primary: return pressed ? .primaryHover : .primaryFill
        case .accent: return pressed ? .accentHover : .accent
        case .ghost, .destructive: return pressed ? .hoverFill : .clear
        case .quiet, .link: return .clear
        }
    }

    private func border(pressed: Bool) -> Color? {
        switch kind {
        case .ghost, .destructive: isEnabled ? .hairlineStrong : .hairline
        case .primary, .accent, .quiet, .link: nil
        }
    }
}

extension ButtonStyle where Self == ForageButtonStyle {
    static func forage(_ kind: ForageButtonStyle.Kind, small: Bool = false, fullWidth: Bool = false,
                       isLoading: Bool = false) -> ForageButtonStyle {
        ForageButtonStyle(kind: kind, small: small, fullWidth: fullWidth, isLoading: isLoading)
    }
}

/// A square 44 pt icon button (close, more). Always pass an accessibility label.
struct IconButton: View {
    let systemName: String
    let accessibilityLabel: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .medium))
                .frame(width: Sizes.control, height: Sizes.control)
        }
        .buttonStyle(IconButtonStyle())
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct IconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Color.ink : Color.mute)
            .background(configuration.isPressed ? Color.hoverFill : Color.clear,
                        in: RoundedRectangle(cornerRadius: Radius.sm))
            .contentShape(Rectangle())
    }
}
