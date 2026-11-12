import SwiftUI

/// The one prompt on Near me (and Lists when empty) while under 10 rated: "Rate places you've
/// been", the progress line and a Rate places button. No close button, no animation.
struct RatePromptCard: View {
    let progress: RateProgress
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Rate places you've been").textStyle(.headline).foregroundStyle(Color.ink)
            Text(progress.line ?? "Picks get better as you rate")
                .textStyle(.label).foregroundStyle(Color.mute)
            Button("Rate places") { app.openRateFlow() }
                .buttonStyle(.forage(.accent, small: true))
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.hairlineStrong, lineWidth: Sizes.hairline))
    }
}
