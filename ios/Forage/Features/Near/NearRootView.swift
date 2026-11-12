import SwiftUI

/// Near me: picks around the device's location (`POST /api/recs`), with the Something new /
/// Go-to filter (the web's `NearMe`). Location is CoreLocation when-in-use; when it's off the
/// location bar offers a city search instead.
struct NearRootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            TabScreen(title: "Near me", lede: "Picks around you, based on where you've eaten.",
                      signedOutMessage: "Sign in to get picks based on the places you have eaten.") {
                NearContent(app: app)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

private struct NearContent: View {
    @Environment(AppState.self) private var app
    @State private var spot: SpotModel
    @State private var search: AreaSearchModel
    @State private var model: NearModel
    @State private var actions: RecActionsModel

    init(app: AppState) {
        _spot = State(initialValue: SpotModel(location: app.location))
        _search = State(initialValue: AreaSearchModel(app: app))
        _model = State(initialValue: NearModel(app: app))
        _actions = State(initialValue: RecActionsModel(app: app, source: .rec))
    }

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: Spacing.xxxl) {
            SpotBar(spotModel: spot, search: search)
            SectionRule(label: "Picks", meta: model.meta) {
                VStack(alignment: .leading, spacing: Spacing.xl) {
                    SegmentedChoice(options: NearModel.filters, selection: $model.filter) { $0.label }
                    picks
                }
            }
        }
        .task { await spot.start() }
        .task(id: model.key(spot: spot.spot)) { await model.load(model.key(spot: spot.spot), revision: app.listsRevision) }
        .onAppear { model.reloadIfStale(revision: app.listsRevision) }
    }

    @ViewBuilder private var picks: some View {
        if spot.spot == nil {
            EmptyStateView(message: "Share your location or pick a place to see what's near.")
        } else {
            switch model.load {
            case .idle, .loading:
                LoadingRows(count: 3, height: 88)
            case .failed(let message):
                ErrorStateView(message: message) { model.forceReload() }
            case .loaded(let page) where page.recs.isEmpty:
                EmptyStateView(message: NearModel.emptyText(model.filter))
            case .loaded(let page):
                RecList(recs: page.recs, actions: actions)
                if page.reasons == false { NoReasonsNote() }
            }
        }
    }
}

/// Under the picks when the AI rerank didn't run: scores only, and how to get reasons.
struct NoReasonsNote: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Scores come from your history. Connect ChatGPT or Grok to get a reason with each pick.")
                .textStyle(.bodySmall).foregroundStyle(Color.mute)
            if !app.aiStatus.anyConnected {
                Button("Connect ChatGPT or Grok") { app.present(.connectAI(nil)) }
                    .buttonStyle(.forage(.link))
            }
        }
    }
}
