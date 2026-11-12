import SwiftUI

/// The screen opener: serif title (32) and an optional serif lede (the web's `Page`).
struct ScreenHeader: View {
    let title: String
    var lede: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text(title)
                .textStyle(.title)
                .foregroundStyle(Color.ink)
                .accessibilityAddTraits(.isHeader)
            if let lede {
                Text(lede).textStyle(.lede).foregroundStyle(Color.bodyText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Rules over boxes: a `hairlineStrong` rule, a mono label on the left and real meta on the
/// right, then the content 24 pt below (the web's `SectionRule`).
struct SectionRule<Content: View>: View {
    let label: String
    var meta: String?
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xl) {
            VStack(spacing: Spacing.md) {
                Hairline(strong: true)
                HStack(alignment: .firstTextBaseline, spacing: Spacing.lg) {
                    Text(label).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    if let meta { Text(meta).foregroundStyle(Color.mute) }
                }
                .textStyle(.label)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension SectionRule where Content == EmptyView {
    init(label: String, meta: String? = nil) {
        self.init(label: label, meta: meta, content: { EmptyView() })
    }
}

/// A 1 pt divider: `hairline` between rows, `hairlineStrong` for section rules.
struct Hairline: View {
    var strong = false

    var body: some View {
        Rectangle()
            .fill(strong ? Color.hairlineStrong : Color.hairline)
            .frame(height: Sizes.hairline)
            .accessibilityHidden(true)
    }
}

/// A tappable hairline row: title, optional muted detail, chevron. Lists are rows, not cards:
/// stack them with `Hairline()` between.
struct LinkRow: View {
    let title: String
    var detail: String?
    var destructive = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.md) {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text(title).textStyle(.bodySmall).foregroundStyle(destructive ? Color.danger : Color.ink)
                    if let detail {
                        Text(detail).textStyle(.caption).foregroundStyle(Color.mute).multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.stone)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, Spacing.md)
            .frame(minHeight: Sizes.control)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressedRowStyle())
    }
}

/// Row press feedback: `hoverFill` behind the label while pressed.
struct PressedRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? Color.hoverFill : Color.clear)
    }
}
