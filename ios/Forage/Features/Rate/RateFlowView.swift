import SwiftUI

/// "Rate places near you" (spec 1.2), a full-screen cover: the location ask, then Step A (the
/// grid), Step B (how was it), Step C (which did you like more) and the finish. Close and Undo
/// sit at the top of every step; closing keeps everything already rated.
struct RateFlowView: View {
    @Environment(AppState.self) private var app
    @State private var model: RateModel

    init(app: AppState) {
        let location = app.location
        let host = RateHost(
            ensureSession: { [weak app] in try await app?.ensureSession() },
            isGuest: { [weak app] in app?.isGuest ?? false },
            handle: { [weak app] in app?.handle($0) ?? $0.userMessage },
            changed: { [weak app] in app?.rateChanged($0) })
        _model = State(initialValue: RateModel(
            service: .live(app.api), host: host, progress: app.rateProgress,
            locate: { await location.requestFix() },
            access: { RateFlowView.access(location) }))
    }

    var body: some View {
        VStack(spacing: 0) {
            RateTopBar(counter: model.flow.progress.counter, canUndo: model.flow.canUndo && !model.isBusy,
                       onClose: { app.closeRateFlow() }, onUndo: { Task { await model.undo() } })
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .canvasBackground()
        .sensoryFeedback(.selection, trigger: model.feedbackTick)
        .task {
            await model.start()
            #if DEBUG
            if let stage = RateModel.demoStage { await model.runDemo(stage) }
            #endif
        }
    }

    @ViewBuilder private var content: some View {
        switch model.flow.step {
        case .locate:
            RateLocateView(model: model)
        case .pick:
            PickGridView(model: model)
        case .rate:
            if let tile = model.flow.current {
                RateCardView(model: model, tile: tile).id(tile.id)
            }
        case .compare(let question):
            ComparePairView(model: model, question: question).id(question)
        case .finish:
            RateFinishView(model: model, onDone: { app.closeRateFlow() })
        }
    }

    private static func access(_ location: LocationService) -> RateModel.LocationAccess {
        switch location.authorization {
        case .authorizedAlways, .authorizedWhenInUse: .granted
        case .notDetermined: .notAsked
        default: .denied
        }
    }
}

/// Close on the left, the progress counter in the middle, Undo on the right.
struct RateTopBar: View {
    let counter: String
    let canUndo: Bool
    let onClose: () -> Void
    let onUndo: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Close", action: onClose).buttonStyle(.forage(.quiet))
                Spacer()
                Text(counter).textStyle(.label).foregroundStyle(Color.mute)
                    .accessibilityLabel("Rated \(counter)")
                Spacer()
                Button("Undo", action: onUndo).buttonStyle(.forage(.quiet)).disabled(!canUndo)
            }
            .padding(.horizontal, Spacing.gutter)
            Hairline()
        }
    }
}

/// Before the grid: one line on why location is needed, then the system prompt only on tap.
/// City search when it's refused or the user would rather type.
struct RateLocateView: View {
    let model: RateModel
    @State private var search: AreaSearchModel?
    @State private var text = ""
    @Environment(AppState.self) private var app

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                ScreenHeader(title: "Rate places you've been",
                             lede: "Forage lists places near you to rate. Your location isn't saved.")
                VStack(spacing: Spacing.sm) {
                    Button("Use my location") { Task { await model.useMyLocation() } }
                        .buttonStyle(.forage(.accent, fullWidth: true, isLoading: model.isLocating || model.isLoadingDeck))
                        .disabled(model.isLocating || model.isLoadingDeck)
                    if !model.showsCitySearch {
                        Button("Search a city instead") { model.askForCity() }
                            .buttonStyle(.forage(.ghost, fullWidth: true))
                    }
                }
                if let message = model.deckError {
                    Text(message).textStyle(.label).foregroundStyle(Color.mute)
                }
                if model.showsCitySearch { citySearch }
            }
            .padding(.horizontal, Spacing.gutter)
            .padding(.vertical, Spacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear { if search == nil { search = AreaSearchModel(app: app) } }
    }

    @ViewBuilder private var citySearch: some View {
        if let search {
            VStack(alignment: .leading, spacing: Spacing.md) {
                ForageField(label: "City or neighborhood", text: $text, placeholder: "Mission District",
                            autocapitalization: .words, submitLabel: .search)
                    .onChange(of: text) { _, new in search.update(new) }
                AreaSearchResults(state: search.state, emptyText: "No place by that name.") { area in
                    Task { await model.choose(NearSpot(area: area)) }
                }
                if model.isLoadingDeck { LoadingRows(count: 2, height: Sizes.control) }
            }
        }
    }
}
