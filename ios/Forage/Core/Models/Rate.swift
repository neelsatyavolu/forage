import Foundation

/// How far the user is toward picks (api.md §1.6): distinct places with at least one visit.
struct RateProgress: Codable, Hashable, Sendable {
    let rated: Int
    var firstPicksAt = 5
    var goal = 10

    static let zero = RateProgress(rated: 0)

    /// Picks show from `firstPicksAt` rated places.
    var picksUnlocked: Bool { rated >= firstPicksAt }
    /// The flow opens on launch and the Near me card shows until `goal`.
    var belowGoal: Bool { rated < goal }

    func adding(_ delta: Int) -> RateProgress {
        RateProgress(rated: max(0, rated + delta), firstPicksAt: firstPicksAt, goal: goal)
    }

    /// "2 of 5 · Rate 3 more to get picks", "6 of 10 · Picks get better as you rate", nil at the goal.
    var line: String? {
        if rated < firstPicksAt {
            let left = firstPicksAt - rated
            return "\(rated) of \(firstPicksAt) · Rate \(left) more to get picks"
        }
        if rated < goal { return "\(rated) of \(goal) · Picks get better as you rate" }
        return nil
    }

    /// The short counter in the flow's top bar: "2 of 5", "6 of 10", "12 rated".
    var counter: String {
        if rated < firstPicksAt { return "\(rated) of \(firstPicksAt)" }
        if rated < goal { return "\(rated) of \(goal)" }
        return "\(rated) rated"
    }
}

/// Rating bands (`RATING_BAND` in lib/types.ts): a rating must sit inside its reaction's band.
enum RatingBand {
    nonisolated static func range(_ reaction: Reaction) -> ClosedRange<Int> {
        switch reaction {
        case .loved: 8...10
        case .fine, .unknown: 5...7
        case .disliked: 1...4
        }
    }

    /// The reaction a whole score out of 10 belongs to.
    nonisolated static func reaction(for rating: Int) -> Reaction {
        switch rating {
        case 8...: .loved
        case 5...7: .fine
        default: .disliked
        }
    }

    nonisolated static func contains(_ rating: Int, _ reaction: Reaction) -> Bool {
        range(reaction).contains(rating)
    }
}

/// One tile of the rating deck (api.md §5A.1).
struct DeckPlace: Codable, Hashable, Sendable, Identifiable {
    let place: Place
    let distanceKm: Double
    let guessedOccasion: Occasion
    /// "Cafe", "Sushi", "Fast Food".
    let kind: String

    var id: String { place.id }

    /// A search result shown like a deck tile (the deck's guess and kind, computed here).
    init(place: Place, from origin: LatLng?) {
        self.place = place
        distanceKm = origin.map { GeoDistance.km(from: $0, to: place.coordinate) } ?? 0
        guessedOccasion = OccasionGuess.guess(place)
        kind = OccasionGuess.kind(place)
    }
}

/// Body of `POST /api/rate/deck`.
struct DeckRequest: Codable, Hashable, Sendable {
    var lat: Double
    var lng: Double
    var radiusKm: Double?
    var limit: Int?
    /// Ids already shown this session, at most 500.
    var exclude: [String] = []

    static let maxExclude = 500
}

/// `data` of `POST /api/rate/deck`.
struct DeckResponse: Codable, Hashable, Sendable {
    let places: [DeckPlace]
    let hasMore: Bool
    let progress: RateProgress
}

/// Body of `POST` and `DELETE /api/rate/skips`.
struct SkipRequest: Codable, Hashable, Sendable {
    let placeId: String
}

/// `data` of `POST /api/rate/skips`.
struct SkipAdded: Codable, Hashable, Sendable {
    struct Skip: Codable, Hashable, Sendable {
        let placeId: String
        let createdAt: EpochMillis
    }

    let skip: Skip
}

/// `data` of `DELETE /api/rate/skips`.
struct SkipRemoved: Codable, Hashable, Sendable {
    let removed: Bool
}

/// `data` of `POST /api/account/guest`.
struct GuestStart: Codable, Hashable, Sendable {
    let user: AccountUser
    let created: Bool
}

/// `data` of `POST /api/comparisons` (api.md §5.4): the saved answer's id (for undo) and the
/// next step. Without `next` in the request, the scores and opponent are null.
struct CompareAnswer: Codable, Hashable, Sendable {
    let id: Int
    let score: Double?
    let subjectScore: Double?
    let opponent: Place?
    let asked: Int

    var step: CompareStep { CompareStep(score: subjectScore ?? score, opponent: opponent, asked: asked) }
}

/// `data` of `DELETE /api/comparisons/{id}?placeId=`.
struct CompareUndone: Codable, Hashable, Sendable {
    let score: Double?
}

/// Straight-line distance, for search results that come without one.
enum GeoDistance {
    nonisolated static func km(from a: LatLng, to b: LatLng) -> Double {
        let radius = 6371.0
        let dLat = (b.lat - a.lat) * .pi / 180
        let dLng = (b.lng - a.lng) * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2)
            + cos(a.lat * .pi / 180) * cos(b.lat * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * radius * asin(min(1, sqrt(h)))
    }
}

/// Port of `lib/rate/occasion.ts`: the occasion a place is most likely rated under, and what to
/// call it on a tile. First match wins: its own single occasion, then $$$$, then the amenity.
enum OccasionGuess {
    private nonisolated static let byAmenity: [String: Occasion] = [
        "fast food": .quick, "food court": .quick, "ice cream": .quick, "cafe": .quick, "bakery": .quick,
        "bar": .nightOut, "pub": .nightOut, "biergarten": .nightOut,
        "restaurant": .casual,
    ]

    nonisolated static func guess(_ place: Place) -> Occasion {
        let own = place.tags.occasions ?? []
        if own.count == 1, own[0] != .unknown { return own[0] }
        if place.priceLevel == 4 { return .special }
        if let amenity = place.tags.attributes?.first, let occasion = byAmenity[amenity] { return occasion }
        return .casual
    }

    /// The first cuisine, else the amenity, in title case ("Coffee Shop", "Fast Food"); "Place" otherwise.
    nonisolated static func kind(_ place: Place) -> String {
        guard let raw = place.cuisine.first ?? place.tags.attributes?.first else { return "Place" }
        let spaced = raw.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        return spaced.split(separator: " ", omittingEmptySubsequences: false)
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
