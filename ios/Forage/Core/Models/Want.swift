import Foundation

/// A Want to try entry (api.md §1.4).
struct WantItem: Codable, Hashable, Sendable {
    let userId: String
    let placeId: String
    let addedAt: EpochMillis
    let source: WantSource
}

/// `data` of `GET /api/want`.
struct WantResponse: Codable, Hashable, Sendable {
    let items: [WantItem]
    let places: [Place]
}

/// Body of `POST /api/want`. Adding twice keeps the first entry.
struct WantAdd: Codable, Hashable, Sendable {
    var placeId: String
    var source: WantSource?
}

/// Body of `DELETE /api/want`.
struct WantRemove: Codable, Hashable, Sendable {
    var placeId: String
}

/// `data` of `POST /api/want`.
struct WantAdded: Codable, Hashable, Sendable {
    let item: WantItem
}

/// `data` of `DELETE /api/want`.
struct WantRemoved: Codable, Hashable, Sendable {
    let removed: Bool
}
