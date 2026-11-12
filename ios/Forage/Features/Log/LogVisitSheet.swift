import SwiftUI

/// Log a visit, presented with `app.present(.logVisit(placeId:))`: pick a place, describe the
/// visit, answer up to two comparisons, then a short summary (the web's `LogFlow`).
struct LogVisitSheet: View {
    let placeId: String?

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var stage: Stage = .pick
    @State private var loadError: String?

    enum Stage: Equatable {
        case loading
        case pick
        case form(Place)
        case compare(Place, LogResponse)
        case done(Place, Occasion, score: Double?)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                content
                    .padding(Sizes.sheetPadding)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.card)
            .navigationTitle("Log a visit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(isDone ? "Close" : "Cancel") { dismiss() }.fixedSize()
                }
            }
        }
        .task { await loadInitialPlace() }
    }

    private var isDone: Bool {
        if case .done = stage { return true }
        return false
    }

    @ViewBuilder private var content: some View {
        if !app.isSignedIn {
            SignInPrompt(message: "Sign in to search and log places.")
        } else {
            switch stage {
            case .loading:
                LoadingRows(count: 3)
            case .pick:
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    if let loadError { InlineError(message: loadError) }
                    PlaceSearchView { stage = .form($0) }
                }
            case .form(let place):
                VisitFormView(place: place, onLogged: { logged(place, $0) }, onChangePlace: { stage = .pick })
            case .compare(let place, let response):
                CompareStepView(subject: place, occasion: response.visit.occasion, step: response.step) { score in
                    stage = .done(place, response.visit.occasion, score: score ?? response.score)
                }
            case .done(let place, let occasion, let score):
                LogDoneView(place: place, occasion: occasion, score: score,
                            onLogAnother: { stage = .pick },
                            onSeeLists: {
                                app.selectedTab = .lists
                                dismiss()
                            })
            }
        }
    }

    private func logged(_ place: Place, _ response: LogResponse) {
        stage = response.opponent == nil
            ? .done(place, response.visit.occasion, score: response.score)
            : .compare(place, response)
    }

    private func loadInitialPlace() async {
        guard let placeId, stage == .pick, app.isSignedIn else { return }
        stage = .loading
        do {
            let response = try await app.api.send(API.Places.detail(id: placeId))
            stage = .form(response.place)
        } catch {
            loadError = app.handle(error)
            stage = .pick
        }
    }
}

/// "Saved", the place and its score now.
private struct LogDoneView: View {
    let place: Place
    let occasion: Occasion
    let score: Double?
    let onLogAnother: () -> Void
    let onSeeLists: () -> Void

    var body: some View {
        SectionRule(label: "Saved", meta: occasion.label) {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                HStack(alignment: .lastTextBaseline, spacing: Spacing.xl) {
                    Text(place.name).textStyle(.titleSmall).foregroundStyle(Color.ink)
                    Spacer(minLength: 0)
                    if let score {
                        VStack(alignment: .trailing, spacing: Spacing.xs) {
                            Text("Score").textStyle(.label).foregroundStyle(Color.mute)
                            ScoreLabel(score: score, large: true)
                        }
                    }
                }
                HStack(spacing: Spacing.sm) {
                    Button("Log another", action: onLogAnother).buttonStyle(.forage(.primary))
                    Button("See your lists", action: onSeeLists).buttonStyle(.forage(.quiet))
                }
            }
        }
    }
}
