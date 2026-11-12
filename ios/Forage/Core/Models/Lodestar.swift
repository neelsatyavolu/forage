import Foundation

/// `data` of `GET /api/lodestar` and `DELETE /api/lodestar` (api.md §9):
/// `{linked:false}` or `{linked:true, label, connectedAt}`.
enum LodestarStatus: Codable, Hashable, Sendable {
    case unlinked
    /// `label` is Lodestar's host, e.g. "lodestar.xanom.co".
    case linked(label: String?, connectedAt: EpochMillis)

    var isLinked: Bool {
        if case .linked = self { return true }
        return false
    }

    private enum CodingKeys: String, CodingKey { case linked, label, connectedAt }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard try c.decode(Bool.self, forKey: .linked) else {
            self = .unlinked
            return
        }
        self = .linked(label: try c.decodeIfPresent(String.self, forKey: .label),
                       connectedAt: try c.decode(EpochMillis.self, forKey: .connectedAt))
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .unlinked:
            try c.encode(false, forKey: .linked)
        case .linked(let label, let connectedAt):
            try c.encode(true, forKey: .linked)
            try c.encode(label, forKey: .label)
            try c.encode(connectedAt, forKey: .connectedAt)
        }
    }
}

/// `data` of `POST /api/lodestar/connect`: Lodestar's consent page.
struct LodestarConnectStart: Codable, Hashable, Sendable {
    let url: String
}

/// Body of `POST /oauth/lodestar/callback` (needs the web change in api.md §11).
struct LodestarCallback: Codable, Hashable, Sendable {
    let code: String
    let state: String
    let iss: String?
}

/// A Lodestar trip, soonest first (api.md §9.5).
struct TripSummary: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let title: String
    let destination: String?
    let startDate: LocalDate?
    let endDate: LocalDate?
}

/// `data` of `GET /api/lodestar/trips`.
struct TripsResponse: Codable, Hashable, Sendable {
    let trips: [TripSummary]
}

/// `data` of `GET /api/lodestar/trips/{id}`: at most 60 days, empty without dates.
struct TripDays: Codable, Hashable, Sendable {
    let trip: TripSummary
    let days: [TripDay]
}

struct TripDay: Codable, Hashable, Sendable, Identifiable {
    let day: LocalDate
    let meals: [TripMeal]

    var id: LocalDate { day }
}

struct TripMeal: Codable, Hashable, Sendable {
    let title: String
    /// "HH:MM".
    let time: String?
}

/// Body of `POST /api/lodestar/add`. `time` is 24-hour "HH:MM"; `note` at most 500 chars.
struct AddToTripRequest: Codable, Hashable, Sendable {
    var tripId: String
    var placeId: String
    var day: LocalDate
    var time: String?
    var note: String?
}

/// `data` of `POST /api/lodestar/add`.
struct AddToTripResponse: Codable, Hashable, Sendable {
    let itemId: String?
}
