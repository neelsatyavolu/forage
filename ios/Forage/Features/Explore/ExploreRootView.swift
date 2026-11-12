import SwiftUI

/// Explore: a city, neighborhood or Lodestar trip, a mode (Travel / Splurge / Stretch), then
/// picks (`POST /api/explore/recs`). With a linked Lodestar account each pick can be added to a
/// trip day (the web's `ExplorePanel`).
struct ExploreRootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            TabScreen(title: "Explore", lede: "Pick a city, a neighborhood or one of your Lodestar trips, then a mode.",
                      signedOutMessage: "Sign in to get picks for anywhere you're going.") {
                ExploreContent(app: app)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

private struct ExploreContent: View {
    @Environment(AppState.self) private var app
    @State private var model: ExploreModel
    @State private var search: AreaSearchModel
    @State private var actions: RecActionsModel
    @State private var adding: Rec?

    init(app: AppState) {
        _model = State(initialValue: ExploreModel(app: app))
        _search = State(initialValue: AreaSearchModel(app: app))
        _actions = State(initialValue: RecActionsModel(app: app, source: .rec))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxxl) {
            whereSection
            if model.spot != nil { picksSection }
        }
        .task { await model.loadTrips() }
        .task(id: model.key) { await model.load(model.key) }
        .onChange(of: app.lodestar?.isLinked) { _, linked in
            if linked == true, model.trips == .unlinked {
                Task { await model.loadTrips() }
            } else if linked == false {
                model.markUnlinked()
            }
        }
        .sheet(item: $adding) { rec in
            AddToTripSheet(model: AddToTripModel(place: rec.place, trips: model.trips.trips,
                                                 initialTripId: model.spot?.trip?.id, app: app))
                .presentationBackground(Color.card)
        }
    }

    private var whereSection: some View {
        SectionRule(label: "Where") {
            VStack(alignment: .leading, spacing: Spacing.md) {
                if let spot = model.spot {
                    spotSummary(spot)
                } else {
                    ExplorePlacePicker(model: model, search: search)
                }
                if let error = model.pickError { InlineError(message: error) }
            }
        }
    }

    private func spotSummary(_ spot: ExploreSpot) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.lg) {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(spot.title).textStyle(.titleSmall).foregroundStyle(Color.ink)
                HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
                    Text(spot.area.label).textStyle(.bodySmall).foregroundStyle(Color.mute)
                    if let dates = spot.trip.flatMap({ ExploreText.dateSpan($0.startDate, $0.endDate) }) {
                        Text(dates).textStyle(.label).monospacedDigit().foregroundStyle(Color.mute)
                    }
                }
            }
            Spacer(minLength: 0)
            Button("Change") { model.clearSpot() }.buttonStyle(.forage(.quiet, small: true))
        }
    }

    private var picksSection: some View {
        @Bindable var model = model
        return SectionRule(label: "Picks", meta: model.results.value.map { plural($0.count, "place") }) {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    SegmentedChoice(options: RecMode.exploreModes, selection: $model.mode) { $0.label }
                    Text(ExploreText.hint(model.mode)).textStyle(.caption).foregroundStyle(Color.mute)
                }
                results
            }
        }
    }

    @ViewBuilder private var results: some View {
        switch model.results {
        case .idle, .loading:
            LoadingRows(count: 3, height: 80)
        case .failed(let message):
            ErrorStateView(message: message) { model.retry() }
        case .loaded(let recs) where recs.isEmpty:
            EmptyStateView(message: ExploreText.emptyPicks)
        case .loaded(let recs):
            RecList(recs: recs, actions: actions,
                    onAddToTrip: model.trips.trips.isEmpty ? nil : { adding = $0 })
        }
    }
}
