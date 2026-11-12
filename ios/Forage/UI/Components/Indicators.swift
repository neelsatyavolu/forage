import SwiftUI

/// The only place green, yellow and red appear: an 8 pt dot beside a short label.
struct StatusDot: View {
    enum Tone: Sendable {
        case ok, warn, danger, neutral, accent

        var color: Color {
            switch self {
            case .ok: .ok
            case .warn: .warn
            case .danger: .danger
            case .neutral: .stone
            case .accent: .accent
            }
        }
    }

    let tone: Tone
    var size: CGFloat = Sizes.statusDot

    var body: some View {
        Circle().fill(tone.color).frame(width: size, height: size).accessibilityHidden(true)
    }
}

/// A filter or status pill: mono 12, full radius. `isOn` uses the accent wash.
struct Pill: View {
    let text: String
    var isOn = false
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) { label }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn ? .isSelected : [])
        } else {
            label
        }
    }

    private var label: some View {
        Text(text)
            .textStyle(.label)
            .foregroundStyle(isOn ? Color.accent : Color.bodyText)
            .padding(.horizontal, Spacing.md)
            .frame(minHeight: action == nil ? 24 : Sizes.controlSmall)
            .background(isOn ? Color.wash : Color.clear, in: Capsule())
            .overlay(Capsule().strokeBorder(isOn ? Color.accent : Color.hairlineStrong, lineWidth: Sizes.hairline))
            .contentShape(Capsule())
            .frame(minHeight: action == nil ? nil : Sizes.control)
    }
}

/// A single-choice segmented row of text options (Been / Want to try, occasions, modes).
struct SegmentedChoice<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                let isOn = option == selection
                Button { selection = option } label: {
                    Text(title(option))
                        .textStyle(.bodySmall)
                        .foregroundStyle(isOn ? Color.ink : Color.mute)
                        .frame(maxWidth: .infinity, minHeight: Sizes.control)
                        .background(isOn ? Color.hoverFill : Color.clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn ? .isSelected : [])
                if option != options.last { Rectangle().fill(Color.hairlineStrong).frame(width: Sizes.hairline) }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.hairlineStrong, lineWidth: Sizes.hairline))
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// A predicted or given score: mono, tabular, one decimal.
struct ScoreLabel: View {
    let score: Double?
    var large = false

    var body: some View {
        Text(ScoreText.format(score))
            .textStyle(large ? .scoreLarge : .score)
            .foregroundStyle(Color.ink)
            .accessibilityLabel(score.map { "Score \(ScoreText.format($0)) of 10" } ?? "No score")
    }
}

/// 14 pt ring spinner, for use inside buttons only.
struct Spinner: View {
    var color: Color = .ink
    var size: CGFloat = 14
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spinning = false

    var body: some View {
        ZStack {
            Circle().stroke(Color.hairlineStrong, lineWidth: 1.5)
            Circle().trim(from: 0, to: 0.25).stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .rotationEffect(.degrees(spinning ? 360 : 0))
        }
        .frame(width: size, height: size)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) { spinning = true }
        }
        .accessibilityLabel("Loading")
    }
}

/// A flat block that breathes (1.6 s) while something loads.
struct Skeleton: View {
    var height: CGFloat = 56
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        RoundedRectangle(cornerRadius: Radius.sm)
            .fill(Color.hoverFill)
            .frame(height: height)
            .opacity(dim ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(Motion.ease(Motion.breathe / 2).repeatForever(autoreverses: true)) { dim = true }
            }
            .accessibilityHidden(true)
    }
}
