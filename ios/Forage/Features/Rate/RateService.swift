import Foundation

/// The calls the rating flow makes, as closures so tests can stand in for the server.
struct RateService: Sendable {
    var deck: @Sendable (DeckRequest) async throws -> DeckResponse
    var search: @Sendable (String, LatLng?) async throws -> [Place]
    var log: @Sendable (VisitInput) async throws -> LogResponse
    var edit: @Sendable (String, VisitPatch) async throws -> VisitResponse
    var deleteVisit: @Sendable (String) async throws -> Void
    var answer: @Sendable (ComparisonRequest) async throws -> CompareAnswer
    var nextQuestion: @Sendable (String, Occasion, Int) async throws -> CompareStep
    var deleteAnswer: @Sendable (Int, String) async throws -> Double?
    var want: @Sendable (String) async throws -> Void
    var unwant: @Sendable (String) async throws -> Void
    var skip: @Sendable (String) async throws -> Void
    var unskip: @Sendable (String) async throws -> Void
}

extension RateService {
    static func live(_ api: APIClient) -> RateService {
        RateService(
            deck: { try await api.send(API.Rate.deck($0)) },
            search: { try await api.send(API.Places.search($0, near: $1)).places },
            log: { try await api.send(API.Visits.log($0)) },
            edit: { try await api.send(API.Visits.edit(id: $0, $1)) },
            deleteVisit: { _ = try await api.send(API.Visits.delete(id: $0)) },
            answer: { try await api.send(API.Comparisons.answer($0)) },
            nextQuestion: { try await api.send(API.Comparisons.next(placeId: $0, occasion: $1, asked: $2)) },
            deleteAnswer: { try await api.send(API.Comparisons.delete(id: $0, placeId: $1)).score },
            want: { _ = try await api.send(API.Want.add(placeId: $0, source: .rate)) },
            unwant: { _ = try await api.send(API.Want.remove(placeId: $0)) },
            skip: { _ = try await api.send(API.Rate.skip(placeId: $0)) },
            unskip: { _ = try await api.send(API.Rate.unskip(placeId: $0)) })
    }
}

/// What the flow needs from the rest of the app (session, errors, refreshes).
struct RateHost {
    /// Makes a guest when there is no session yet; throws when that fails.
    var ensureSession: @MainActor () async throws -> Void
    var isGuest: @MainActor () -> Bool
    var handle: @MainActor (any Error) -> String?
    /// After any write: Lists and Near me reload, progress updates.
    var changed: @MainActor (RateProgress) -> Void
}
