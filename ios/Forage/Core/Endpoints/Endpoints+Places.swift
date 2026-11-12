import Foundation

extension API {
    /// Place search and details (api.md §4). All need a session.
    enum Places {
        /// Up to 20 places by name, nearest to `near` first when given. Debounce ~300 ms and
        /// cancel the previous request.
        static func search(_ query: String, near: LatLng? = nil) -> Endpoint<PlacesResponse> {
            var items = [URLQueryItem(name: "q", value: query.trimmingCharacters(in: .whitespacesAndNewlines))]
            if let near { items += coordinateItems(near) }
            return Endpoint(method: .get, path: "/api/places", query: items, timeout: Timeouts.places)
        }

        /// Up to 100 places around a point, nearest first. `radiusKm` 0.1–10, default 1.5.
        static func nearby(_ point: LatLng, radiusKm: Double? = nil) -> Endpoint<PlacesResponse> {
            var items = coordinateItems(point)
            if let radiusKm { items.append(URLQueryItem(name: "radiusKm", value: String(radiusKm))) }
            return Endpoint(method: .get, path: "/api/places", query: items, timeout: Timeouts.places)
        }

        static func detail(id: String) -> Endpoint<PlaceResponse> {
            Endpoint(method: .get, path: "/api/places/\(id)", timeout: Timeouts.places)
        }
    }

    /// Visits (api.md §5.1–5.3).
    enum Visits {
        static var list: Endpoint<VisitsResponse> {
            Endpoint(method: .get, path: "/api/visits")
        }

        /// Then loop `Comparisons.submit` while `opponent != nil`.
        static func log(_ input: VisitInput) -> Endpoint<LogResponse> {
            Endpoint(method: .post, path: "/api/visits", body: input)
        }

        static func edit(id: String, _ patch: VisitPatch) -> Endpoint<VisitResponse> {
            Endpoint(method: .patch, path: "/api/visits/\(id)", body: patch)
        }

        static func delete(id: String) -> Endpoint<EmptyResponse> {
            Endpoint(method: .delete, path: "/api/visits/\(id)")
        }
    }

    /// "Which did you like more?" (api.md §5.4).
    enum Comparisons {
        static func submit(_ request: ComparisonRequest) -> Endpoint<CompareStep> {
            Endpoint(method: .post, path: "/api/comparisons", body: request)
        }
    }

    /// Predicted vs actual for a place (api.md §5.5).
    enum Feedback {
        static func forPlace(id: String) -> Endpoint<FeedbackResponse> {
            Endpoint(method: .get, path: "/api/feedback", query: [URLQueryItem(name: "placeId", value: id)])
        }
    }

    /// Want to try (api.md §6).
    enum Want {
        static var list: Endpoint<WantResponse> {
            Endpoint(method: .get, path: "/api/want")
        }

        static func add(placeId: String, source: WantSource? = nil) -> Endpoint<WantAdded> {
            Endpoint(method: .post, path: "/api/want", body: WantAdd(placeId: placeId, source: source))
        }

        /// DELETE with a body.
        static func remove(placeId: String) -> Endpoint<WantRemoved> {
            Endpoint(method: .delete, path: "/api/want", body: WantRemove(placeId: placeId))
        }
    }

    static func coordinateItems(_ point: LatLng) -> [URLQueryItem] {
        [URLQueryItem(name: "lat", value: String(format: "%.5f", point.lat)),
         URLQueryItem(name: "lng", value: String(format: "%.5f", point.lng))]
    }
}
