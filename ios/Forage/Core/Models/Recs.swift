import Foundation

/// A recommended place with the user's predicted score (api.md §1.5).
struct Rec: Codable, Hashable, Sendable, Identifiable {
    let place: Place
    /// Predicted score for this user, 0–10.
    let score: Double
    /// One line from the AI rerank; absent without AI.
    let reason: String?
    let signals: RecSignals

    var id: String { place.id }
}

struct RecSignals: Codable, Hashable, Sendable {
    /// 0–1.
    let taste: Double
    /// 0–1, nil when no rating source.
    let quality: Double?
    let distanceKm: Double
    /// 0–1.
    let novelty: Double
    /// The user has a logged visit here.
    let visited: Bool
    /// On the Want to try list.
    let wanted: Bool
}

/// `data` of the three recs routes. `reasons` is only sent by `POST /api/recs`.
struct RecsPage: Codable, Hashable, Sendable {
    let recs: [Rec]
    let reasons: Bool?
}

/// Body of `POST /api/recs` (Near me). Leave `mode` out; the server implies `near`.
struct NearRequest: Codable, Hashable, Sendable {
    var lat: Double
    var lng: Double
    /// 0.1–5, default 2.
    var radiusKm: Double?
    var filter: NearFilter?
    /// At most 500 chars.
    var want: String?
    /// 1–20.
    var partySize: Int?
    var openNow: Bool?
    var occasion: Occasion?
}

/// Body of `POST /api/explore/recs`. `radiusKm` is required (0.1–50): use the area's.
/// `mode` is one of `RecMode.exploreModes`.
struct ExploreRequest: Codable, Hashable, Sendable {
    var lat: Double
    var lng: Double
    var radiusKm: Double
    var mode: RecMode
    var want: String?
    var partySize: Int?
    var openNow: Bool?
    var occasion: Occasion?
}

/// Body of `POST /api/recs/ask`. `want` is 3–500 chars.
struct AskRequest: Codable, Hashable, Sendable {
    var lat: Double
    var lng: Double
    var want: String
    /// 0.1–5, default 3.
    var radiusKm: Double?
    var partySize: Int?
    var occasion: Occasion?

    static let wantLength = 3...500
}

/// An area from `GET /api/explore/geocode` (api.md §7.4).
struct Area: Codable, Hashable, Sendable, Identifiable {
    /// "Mission District, San Francisco, United States".
    let label: String
    let name: String
    let lat: Double
    let lng: Double
    let radiusKm: Double

    var id: String { "\(label)|\(lat)|\(lng)" }
    var coordinate: LatLng { LatLng(lat: lat, lng: lng) }
}

/// `data` of `GET /api/explore/geocode`: at most 6.
struct AreasResponse: Codable, Hashable, Sendable {
    let areas: [Area]
}
