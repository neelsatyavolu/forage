import SwiftUI

/// Step C: "Which did you like more?" between the place just rated and one the server picked
/// from the same occasion and band. "Too tough" writes nothing. After an answer the new score
/// shows briefly ("Zenpo Sushi is now 8.7"), then the flow moves on.
struct ComparePairView: View {
    let model: RateModel
    let question: CompareQuestion

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                HStack {
                    Button("Back") { model.back() }.buttonStyle(.forage(.quiet))
                    Spacer()
                    Text(question.occasion.label).textStyle(.label).foregroundStyle(Color.mute)
                }
                ScreenHeader(title: "Which did you like more?")
                VStack(spacing: Spacing.sm) {
                    choice(question.subject.place, detail: RateText.meta(question.subject))
                    Text("or").textStyle(.label).foregroundStyle(Color.mute)
                    choice(question.opponent, detail: RateText.kindAndStreet(question.opponent))
                }
                if let note = model.scoreNote {
                    Text(note).textStyle(.mono).foregroundStyle(Color.ink)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .transition(.opacity)
                        .accessibilityAddTraits(.updatesFrequently)
                } else {
                    Button("Too tough") { model.tooTough() }
                        .buttonStyle(.forage(.quiet))
                        .frame(maxWidth: .infinity)
                        .disabled(model.isBusy)
                }
                if let error = model.error { InlineError(message: error) }
            }
            .padding(.horizontal, Spacing.gutter)
            .padding(.top, Spacing.xs)
            .padding(.bottom, Spacing.xl)
            .animation(Motion.fast, value: model.scoreNote)
        }
    }

    private func choice(_ place: Place, detail: String) -> some View {
        Button { Task { await model.pick(place, in: question) } } label: {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(place.name).textStyle(.titleSmall).foregroundStyle(Color.ink)
                    .multilineTextAlignment(.leading).lineLimit(2)
                Text(detail).textStyle(.label).foregroundStyle(Color.mute).lineLimit(1)
            }
            .padding(Spacing.lg)
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.fieldBorder, lineWidth: Sizes.hairline))
            .contentShape(RoundedRectangle(cornerRadius: Radius.md))
        }
        .buttonStyle(PressedCardStyle())
        .disabled(model.isBusy || model.scoreNote != nil)
        .accessibilityHint("Liked \(place.name) more")
    }
}

/// A pressed card darkens slightly.
struct PressedCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(Motion.fast, value: configuration.isPressed)
    }
}

/// Short text the rating screens share.
enum RateText {
    /// "Sushi · 290 m".
    static func meta(_ tile: DeckPlace) -> String {
        let distance = tile.distanceKm > 0 ? DistanceText.format(km: tile.distanceKm) : ""
        return [tile.kind, distance].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// "Sushi · Grove Street · 290 m".
    static func detail(_ tile: DeckPlace) -> String {
        let distance = tile.distanceKm > 0 ? DistanceText.format(km: tile.distanceKm) : ""
        return [tile.kind, street(tile.place) ?? "", distance].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// "Cafe · Grove Street".
    static func kindAndStreet(_ place: Place) -> String {
        [OccasionGuess.kind(place), street(place) ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// The first part of the address ("541 Bryant St").
    static func street(_ place: Place) -> String? {
        place.address?.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) }
    }

    /// "8–10" beside "Loved it".
    static func bandLabel(_ reaction: Reaction) -> String {
        let range = RatingBand.range(reaction)
        return "\(range.lowerBound)–\(range.upperBound)"
    }
}
