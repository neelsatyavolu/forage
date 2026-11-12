import Foundation

/// One logged meal (api.md §1.2).
struct Visit: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let userId: String
    let placeId: String
    /// The device's local calendar day when logged.
    let visitedOn: LocalDate
    let reaction: Reaction
    let occasion: Occasion
    let dishes: [String]
    let note: String?
    let createdAt: EpochMillis
}

/// The user's 0–10 score for a place and occasion (api.md §1.3).
struct PlaceScore: Codable, Hashable, Sendable {
    let userId: String
    let placeId: String
    let occasion: Occasion
    let score: Double
    let updatedAt: EpochMillis
}

/// `data` of `GET /api/visits`. `places` are the distinct places the visits reference.
struct VisitsResponse: Codable, Hashable, Sendable {
    let visits: [Visit]
    let places: [Place]
    let scores: [PlaceScore]
}

/// Body of `POST /api/visits`. `dishes`: each 1–100 chars, at most 20. `note`: at most 2000.
struct VisitInput: Codable, Hashable, Sendable {
    var placeId: String
    var visitedOn: LocalDate
    var reaction: Reaction
    var occasion: Occasion
    var dishes: [String] = []
    var note: String?
}

/// Body of `PATCH /api/visits/{id}`: only the fields set are sent. `note`: `nil` leaves it,
/// `.some(nil)` clears it.
struct VisitPatch: Encodable, Hashable, Sendable {
    var visitedOn: LocalDate?
    var reaction: Reaction?
    var occasion: Occasion?
    var dishes: [String]?
    var note: String??

    private enum CodingKeys: String, CodingKey {
        case visitedOn, reaction, occasion, dishes, note
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(visitedOn, forKey: .visitedOn)
        try c.encodeIfPresent(reaction, forKey: .reaction)
        try c.encodeIfPresent(occasion, forKey: .occasion)
        try c.encodeIfPresent(dishes, forKey: .dishes)
        try c.encodePatch(note, forKey: .note)
    }
}

/// `data` of `PATCH /api/visits/{id}`.
struct VisitResponse: Codable, Hashable, Sendable {
    let visit: Visit
}

/// One step of "Which did you like more?" (api.md §1.6). `opponent` is the next question,
/// nil when done; `asked` is how many were answered so far (at most `maxComparisons`).
struct CompareStep: Codable, Hashable, Sendable {
    let score: Double?
    let opponent: Place?
    let asked: Int

    static let maxComparisons = 2
}

/// `data` of `POST /api/visits`: the saved visit plus the first comparison step.
struct LogResponse: Codable, Hashable, Sendable {
    let visit: Visit
    let score: Double?
    let opponent: Place?
    let asked: Int

    var step: CompareStep { CompareStep(score: score, opponent: opponent, asked: asked) }
}

/// Body of `POST /api/comparisons`.
struct ComparisonRequest: Codable, Hashable, Sendable {
    var comparison: ComparisonInput
    /// Omit to record the comparison without asking another.
    var next: ComparisonNext?
}

struct ComparisonInput: Codable, Hashable, Sendable {
    var winnerPlaceId: String
    var loserPlaceId: String
    var occasion: Occasion
}

struct ComparisonNext: Codable, Hashable, Sendable {
    /// The place being logged.
    var subjectPlaceId: String
    /// Questions answered including this one (1–2).
    var asked: Int
}

/// `data` of `GET /api/feedback?placeId=`: "We predicted 8.4, you gave 7.1".
struct FeedbackResponse: Codable, Hashable, Sendable {
    let feedback: Feedback?

    struct Feedback: Codable, Hashable, Sendable {
        let predicted: Double
        let actual: Double
        let at: EpochMillis
    }
}
