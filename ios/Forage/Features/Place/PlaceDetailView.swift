import MapKit
import SwiftUI

/// The shared place screen (`GET /api/places/{id}`), presented with `app.present(.place(id:))`:
/// your scores and visits, "We predicted X, you gave Y", live details when the server has them,
/// a small Apple map with Directions, and list actions.
struct PlaceDetailView: View {
    let placeId: String

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model: PlaceDetailModel
    @State private var pendingDelete: Visit?

    init(placeId: String) {
        self.placeId = placeId
        _model = State(initialValue: PlaceDetailModel(placeId: placeId))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                content
                    .padding(Sizes.sheetPadding)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.card)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.fixedSize()
                }
            }
        }
        .task(id: app.isSignedIn) {
            guard app.isSignedIn else { return }
            await model.load(app)
        }
        .confirmationDialog("Delete this visit?", isPresented: deleteBinding, titleVisibility: .visible,
                            presenting: pendingDelete) { visit in
            Button("Delete visit", role: .destructive) { Task { await model.deleteVisit(visit, app: app) } }
        } message: { visit in
            Text("\(visit.occasion.label) on \(ListsText.day(visit.visitedOn)). Your score here will be refit.")
        }
    }

    private var deleteBinding: Binding<Bool> {
        Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
    }

    @ViewBuilder private var content: some View {
        if !app.isSignedIn {
            SignInPrompt(message: "Sign in to see this place and log a visit.")
        } else {
            switch model.state {
            case .idle, .loading:
                LoadingRows(count: 3)
            case .failed(let message):
                ErrorStateView(message: message) { Task { await model.load(app) } }
            case .loaded(let response):
                loaded(response)
            }
        }
    }

    private func loaded(_ r: PlaceResponse) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxl) {
            header(r.place)
            if !r.scores.isEmpty { PlaceScores(scores: r.scores) }
            actions(r)
            if let error = model.actionError { InlineError(message: error) }
            PlaceMapPreview(place: r.place)
            if let live = r.live { PlaceLiveSection(live: live) { app.present(.web($0)) } }
            if let liveError = r.liveError {
                Text(liveError).textStyle(.label).foregroundStyle(Color.mute)
            }
            visits(r)
            Text("Place data © OpenStreetMap contributors")
                .textStyle(.label)
                .foregroundStyle(Color.mute)
        }
    }

    private func header(_ place: Place) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(place.name).textStyle(.titleSmall).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
            let line = ListsText.text(place)
            if !line.isEmpty { Text(line).textStyle(.bodySmall).foregroundStyle(Color.mute) }
            if let price = PriceText.label(place.priceLevel) {
                Text(price).textStyle(.mono).foregroundStyle(Color.mute)
            }
        }
    }

    private func actions(_ r: PlaceResponse) -> some View {
        HStack(spacing: Spacing.sm) {
            Button("Log a visit") { app.present(.logVisit(placeId: r.place.id)) }
                .buttonStyle(.forage(.primary))
            Button(r.wanted ? "Remove from Want to try" : "Add to Want to try") {
                Task { await model.toggleWant(app) }
            }
            .buttonStyle(.forage(.ghost, isLoading: model.busy == "want"))
            .disabled(model.busy != nil)
        }
    }

    private func visits(_ r: PlaceResponse) -> some View {
        SectionRule(label: "Your visits", meta: r.visits.isEmpty ? nil : "\(r.visits.count)") {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                if let feedback = model.feedback {
                    Text(PlaceDetailModel.feedbackLine(feedback)).textStyle(.label).foregroundStyle(Color.ink)
                }
                if r.visits.isEmpty {
                    Text("Not logged yet.").textStyle(.lede).foregroundStyle(Color.bodyText)
                } else {
                    LazyVStack(spacing: 0) {
                        Hairline()
                        ForEach(r.visits) { visit in
                            PlaceVisitRow(visit: visit, isBusy: model.busy == visit.id) { pendingDelete = visit }
                                .disabled(model.busy != nil)
                            Hairline()
                        }
                    }
                }
            }
        }
    }
}

/// Your score per occasion, mono 28.
private struct PlaceScores: View {
    let scores: [PlaceScore]

    var body: some View {
        FlowLayout(spacing: Spacing.xxl) {
            ForEach(scores, id: \.occasion) { score in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(score.occasion.label).textStyle(.label).foregroundStyle(Color.mute)
                    ScoreLabel(score: score.score, large: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// One visit: day, occasion and reaction in mono, dishes, the note in Newsreader, and Delete.
private struct PlaceVisitRow: View {
    let visit: Visit
    let isBusy: Bool
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.lg) {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("\(ListsText.day(visit.visitedOn)) · \(visit.occasion.label) · \(visit.reaction.label)")
                    .textStyle(.label)
                    .foregroundStyle(Color.mute)
                if !visit.dishes.isEmpty {
                    Text(visit.dishes.joined(separator: ", ")).textStyle(.bodySmall).foregroundStyle(Color.bodyText)
                }
                if let note = visit.note {
                    Text(note).textStyle(.lede).foregroundStyle(Color.bodyText)
                }
            }
            Spacer(minLength: 0)
            Button("Delete", action: onDelete)
                .buttonStyle(.forage(.quiet, small: true, isLoading: isBusy))
                .accessibilityLabel("Delete visit on \(ListsText.day(visit.visitedOn))")
        }
        .padding(.vertical, Spacing.md)
    }
}
