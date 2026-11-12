import SwiftUI

/// Picks as hairline rows (the web's `RecList`): name and facts left, the predicted score right,
/// the AI reason beneath in Newsreader, then Log a visit, Want to try and (Explore with a
/// linked trip) Add to trip. Tapping the name opens the place.
struct RecList: View {
    let recs: [Rec]
    let actions: RecActionsModel
    var onAddToTrip: ((Rec) -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            ForEach(Array(recs.enumerated()), id: \.element.id) { index, rec in
                RecRow(rec: rec, actions: actions, onAddToTrip: onAddToTrip)
                    .rise(delay: Double(min(index, 8)) * Motion.stagger)
                Hairline()
            }
        }
    }
}

struct RecRow: View {
    let rec: Rec
    let actions: RecActionsModel
    var onAddToTrip: ((Rec) -> Void)?
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Button { app.present(.place(id: rec.place.id)) } label: { header }
                .buttonStyle(PressedRowStyle())
                .accessibilityHint("Opens the place")
            if let reason = rec.reason, !reason.isEmpty {
                Text(reason).textStyle(.lede).foregroundStyle(Color.bodyText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let address = rec.place.address, !address.isEmpty {
                Text(address).textStyle(.caption).foregroundStyle(Color.mute)
            }
            actionRow
            if case .failed(let message) = actions.mark(for: rec) {
                InlineError(message: message)
            }
        }
        .padding(.vertical, Spacing.lg)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.xl) {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(rec.place.name).textStyle(.headline).foregroundStyle(Color.ink)
                    .multilineTextAlignment(.leading)
                HStack(spacing: Spacing.sm) {
                    let facts = RecFacts.line(rec)
                    if !facts.isEmpty { Text(facts).textStyle(.caption).foregroundStyle(Color.mute) }
                    ForEach(RecFacts.badges(rec, wantedNow: actions.isWanted(rec)), id: \.self) { badge in
                        Text(badge).textStyle(.label).foregroundStyle(Color.mute)
                    }
                }
            }
            Spacer(minLength: 0)
            Text(ScoreText.format(rec.score))
                .textStyle(.score)
                .monospacedDigit()
                .foregroundStyle(Color.ink)
                .accessibilityLabel("Predicted score \(ScoreText.format(rec.score)) of 10")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var actionRow: some View {
        HStack(spacing: Spacing.lg) {
            Button("Log a visit") { app.present(.logVisit(placeId: rec.place.id)) }
                .buttonStyle(.forage(.link))
            wantButton
            if let onAddToTrip {
                Button("Add to trip") { onAddToTrip(rec) }.buttonStyle(.forage(.link))
            }
        }
        .textStyle(.bodySmall)
    }

    @ViewBuilder private var wantButton: some View {
        if !actions.isWanted(rec) {
            let saving = actions.mark(for: rec) == .saving
            Button("Want to try") { Task { await actions.want(rec) } }
                .buttonStyle(.forage(.link, isLoading: saving))
                .disabled(saving)
        }
    }
}

/// The facts line and badges under a rec's name.
enum RecFacts {
    /// "ramen, japanese · $$ · 350 m".
    nonisolated static func line(_ rec: Rec) -> String {
        [rec.place.cuisine.prefix(2).joined(separator: ", "),
         PriceText.label(rec.place.priceLevel) ?? "",
         DistanceText.format(km: rec.signals.distanceKm)]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// "Been" and "Want to try", as the web shows them.
    nonisolated static func badges(_ rec: Rec, wantedNow: Bool) -> [String] {
        var badges: [String] = []
        if rec.signals.visited { badges.append("Been") }
        if wantedNow { badges.append("Want to try") }
        return badges
    }
}
