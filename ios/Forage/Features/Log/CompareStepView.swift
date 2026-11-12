import SwiftUI

/// "Which did you like more?" between the place just logged and one the server picked, at most
/// `CompareStep.maxComparisons` times. Answers go to `POST /api/comparisons`; Skip ends the questions.
struct CompareStepView: View {
    let subject: Place
    let occasion: Occasion
    let onDone: (Double?) -> Void

    @Environment(AppState.self) private var app
    @State private var current: CompareStep
    @State private var busy: String?
    @State private var error: String?

    init(subject: Place, occasion: Occasion, step: CompareStep, onDone: @escaping (Double?) -> Void) {
        self.subject = subject
        self.occasion = occasion
        self.onDone = onDone
        _current = State(initialValue: step)
    }

    var body: some View {
        if let opponent = current.opponent {
            SectionRule(label: "Which did you like more?", meta: "\(occasion.label) · Question \(current.asked + 1)") {
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    ForEach([subject, opponent]) { place in
                        choice(place, opponent: opponent)
                    }
                    if let error { InlineError(message: error) }
                    Button("Skip") { onDone(current.score) }
                        .buttonStyle(.forage(.quiet))
                        .disabled(busy != nil)
                }
            }
        }
    }

    private func choice(_ place: Place, opponent: Place) -> some View {
        Button { Task { await answer(winner: place, opponent: opponent) } } label: {
            HStack(alignment: .top) {
                PlaceNameBlock(place: place)
                if busy == place.id { Spinner().padding(Spacing.md) }
            }
            .frame(minHeight: 88, alignment: .top)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sm))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.fieldBorder, lineWidth: Sizes.hairline))
        }
        .buttonStyle(PressedRowStyle())
        .disabled(busy != nil)
        .accessibilityHint("Choose \(place.name)")
    }

    private func answer(winner: Place, opponent: Place) async {
        let request = Self.request(winner: winner, subject: subject, opponent: opponent, occasion: occasion,
                                   asked: current.asked)
        busy = winner.id
        error = nil
        defer { busy = nil }
        do {
            let next = try await app.api.send(API.Comparisons.submit(request))
            app.listsChanged()
            if next.opponent != nil, next.asked < CompareStep.maxComparisons {
                current = next
            } else {
                onDone(next.score)
            }
        } catch {
            self.error = app.handle(error)
        }
    }

    /// The comparison body: the loser is whichever of the pair wasn't picked; `asked` counts this answer.
    nonisolated static func request(winner: Place, subject: Place, opponent: Place, occasion: Occasion,
                                    asked: Int) -> ComparisonRequest {
        let loser = winner.id == subject.id ? opponent : subject
        return ComparisonRequest(
            comparison: ComparisonInput(winnerPlaceId: winner.id, loserPlaceId: loser.id, occasion: occasion),
            next: ComparisonNext(subjectPlaceId: subject.id, asked: asked + 1))
    }
}
