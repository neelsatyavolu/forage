import Foundation
import Observation

/// Screen state for the place sheet: the place, the user's visits and scores, Want status, and
/// the "We predicted X, you gave Y" note.
@MainActor
@Observable
final class PlaceDetailModel {
    let placeId: String
    private(set) var state: LoadState<PlaceResponse> = .idle
    private(set) var feedback: FeedbackResponse.Feedback?
    /// What is in flight: "want" or a visit id.
    private(set) var busy: String?
    private(set) var actionError: String?

    init(placeId: String) {
        self.placeId = placeId
    }

    /// `GET /api/places/{id}`, then the prediction note when there are visits.
    func load(_ app: AppState) async {
        if state.value == nil { state = .loading }
        do {
            let response = try await app.api.send(API.Places.detail(id: placeId))
            state = .loaded(response)
            await loadFeedback(app, hasVisits: !response.visits.isEmpty)
        } catch {
            guard let message = app.handle(error) else { return }
            if state.value == nil { state = .failed(message) } else { actionError = message }
        }
    }

    /// `GET /api/feedback`. Optional: a failure just leaves the note out, like the web.
    private func loadFeedback(_ app: AppState, hasVisits: Bool) async {
        guard hasVisits else {
            feedback = nil
            return
        }
        feedback = (try? await app.api.send(API.Feedback.forPlace(id: placeId)))?.feedback
    }

    /// Adds to or removes from Want to try.
    func toggleWant(_ app: AppState) async {
        guard let current = state.value else { return }
        await run("want", app: app) {
            if current.wanted {
                _ = try await app.api.send(API.Want.remove(placeId: current.place.id))
            } else {
                _ = try await app.api.send(API.Want.add(placeId: current.place.id, source: .manual))
            }
        } after: { Self.settingWanted($0, !current.wanted) }
    }

    /// `DELETE /api/visits/{id}`, then reloads so the scores refit.
    func deleteVisit(_ visit: Visit, app: AppState) async {
        await run(visit.id, app: app) {
            _ = try await app.api.send(API.Visits.delete(id: visit.id))
        } after: { Self.removingVisit($0, id: visit.id) }
        await load(app)
    }

    private func run(_ what: String, app: AppState, _ work: () async throws -> Void,
                     after: (PlaceResponse) -> PlaceResponse) async {
        busy = what
        actionError = nil
        defer { busy = nil }
        do {
            try await work()
            if let value = state.value { state = .loaded(after(value)) }
            app.listsChanged()
        } catch {
            actionError = app.handle(error)
        }
    }

    nonisolated static func settingWanted(_ r: PlaceResponse, _ wanted: Bool) -> PlaceResponse {
        PlaceResponse(place: r.place, live: r.live, liveError: r.liveError, visits: r.visits, scores: r.scores,
                      wanted: wanted)
    }

    nonisolated static func removingVisit(_ r: PlaceResponse, id: String) -> PlaceResponse {
        PlaceResponse(place: r.place, live: r.live, liveError: r.liveError, visits: r.visits.filter { $0.id != id },
                      scores: r.scores, wanted: r.wanted)
    }

    /// "4.5 (120) · $$ · Open now" from Google's live details.
    nonisolated static func liveLine(_ live: LiveDetails) -> String {
        let rating = live.rating.map { String(format: "%.1f (%d)", $0, live.ratingCount ?? 0) }
        let open = live.openNow.map { $0 ? "Open now" : "Closed now" }
        return [rating, PriceText.label(live.priceLevel), open].compactMap { $0 }.joined(separator: " · ")
    }

    /// "We predicted 8.4, you gave 7.1".
    nonisolated static func feedbackLine(_ feedback: FeedbackResponse.Feedback) -> String {
        "We predicted \(ScoreText.format(feedback.predicted)), you gave \(ScoreText.format(feedback.actual))"
    }
}
