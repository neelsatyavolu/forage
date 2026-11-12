import Foundation

extension API {
    /// Recommendations (api.md §7.1, §7.3).
    enum Recs {
        /// Near me. Up to 30, best first.
        static func near(_ request: NearRequest) -> Endpoint<RecsPage> {
            Endpoint(method: .post, path: "/api/recs", body: request, timeout: Timeouts.recs)
        }

        /// Ask: at most 3 picks, each with a reason. Needs AI (401 "Connect …" otherwise).
        static func ask(_ request: AskRequest) -> Endpoint<RecsPage> {
            Endpoint(method: .post, path: "/api/recs/ask", body: request, timeout: Timeouts.ai)
        }
    }

    /// Explore (api.md §7.2, §7.4).
    enum Explore {
        static func recs(_ request: ExploreRequest) -> Endpoint<RecsPage> {
            Endpoint(method: .post, path: "/api/explore/recs", body: request, timeout: Timeouts.recs)
        }

        /// Area search (Photon, free). `query` 2–120 chars. No session needed.
        static func geocode(_ query: String) -> Endpoint<AreasResponse> {
            Endpoint(method: .get, path: "/api/explore/geocode",
                     query: [URLQueryItem(name: "q", value: query.trimmingCharacters(in: .whitespacesAndNewlines))],
                     timeout: Timeouts.places)
        }
    }

    /// Taste profile (api.md §8).
    enum Taste {
        static var get: Endpoint<TasteView> {
            Endpoint(method: .get, path: "/api/taste")
        }

        static func saveSummary(_ summary: String?) -> Endpoint<TasteView> {
            Endpoint(method: .put, path: "/api/taste", body: TasteSummaryPut(summary: summary))
        }

        static var refresh: Endpoint<TasteRefresh> {
            Endpoint(method: .post, path: "/api/taste/refresh", timeout: Timeouts.ai)
        }
    }

    /// Lodestar link (api.md §9, §11). On any 409, refresh `status`.
    enum Lodestar {
        static var status: Endpoint<LodestarStatus> {
            Endpoint(method: .get, path: "/api/lodestar")
        }

        static var disconnect: Endpoint<LodestarStatus> {
            Endpoint(method: .delete, path: "/api/lodestar")
        }

        static var connect: Endpoint<LodestarConnectStart> {
            Endpoint(method: .post, path: "/api/lodestar/connect")
        }

        /// Needs the web's JSON POST handler (api.md §11); not live yet.
        static func callback(_ callback: LodestarCallback) -> Endpoint<LodestarStatus> {
            Endpoint(method: .post, path: "/oauth/lodestar/callback", body: callback)
        }

        static var trips: Endpoint<TripsResponse> {
            Endpoint(method: .get, path: "/api/lodestar/trips", timeout: Timeouts.recs)
        }

        static func trip(id: String) -> Endpoint<TripDays> {
            Endpoint(method: .get, path: "/api/lodestar/trips/\(id)", timeout: Timeouts.recs)
        }

        static func add(_ request: AddToTripRequest) -> Endpoint<AddToTripResponse> {
            Endpoint(method: .post, path: "/api/lodestar/add", body: request, timeout: Timeouts.recs)
        }
    }
}
