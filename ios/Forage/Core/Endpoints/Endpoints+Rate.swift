import Foundation

extension API {
    /// The rating flow (api.md §5A).
    enum Rate {
        /// Places around a point, most likely visited first. Works with no session.
        static func deck(_ request: DeckRequest) -> Endpoint<DeckResponse> {
            Endpoint(method: .post, path: "/api/rate/deck", body: request, timeout: Timeouts.recs)
        }

        /// `rated: 0` with no session.
        static var progress: Endpoint<RateProgress> {
            Endpoint(method: .get, path: "/api/rate/progress")
        }

        /// "Not been": keeps the place out of the deck for 180 days.
        static func skip(placeId: String) -> Endpoint<SkipAdded> {
            Endpoint(method: .post, path: "/api/rate/skips", body: SkipRequest(placeId: placeId))
        }

        /// Undo "Not been". DELETE with a body.
        static func unskip(placeId: String) -> Endpoint<SkipRemoved> {
            Endpoint(method: .delete, path: "/api/rate/skips", body: SkipRequest(placeId: placeId))
        }
    }
}

extension API.Account {
    /// Makes a guest when there is no session (api.md §2.9). Call right before the first write.
    static var guest: Endpoint<GuestStart> {
        Endpoint(method: .post, path: "/api/account/guest")
    }
}

extension API.Comparisons {
    /// Like `submit`, but returns the saved answer's id for undo (api.md §5.4).
    static func answer(_ request: ComparisonRequest) -> Endpoint<CompareAnswer> {
        Endpoint(method: .post, path: "/api/comparisons", body: request)
    }

    /// The next question for a place in an occasion, after `asked` answers (0–2).
    static func next(placeId: String, occasion: Occasion, asked: Int) -> Endpoint<CompareStep> {
        Endpoint(method: .get, path: "/api/comparisons/next", query: [
            URLQueryItem(name: "placeId", value: placeId),
            URLQueryItem(name: "occasion", value: occasion.rawValue),
            URLQueryItem(name: "asked", value: String(asked)),
        ])
    }

    /// Undo one answer; returns `placeId`'s score afterwards.
    static func delete(id: Int, placeId: String) -> Endpoint<CompareUndone> {
        Endpoint(method: .delete, path: "/api/comparisons/\(id)", query: [URLQueryItem(name: "placeId", value: placeId)])
    }
}
