import Foundation

/// The taste profile (api.md §8).
struct TasteView: Codable, Hashable, Sendable {
    /// "" when none yet.
    let summary: String
    /// The user wrote it; the AI won't overwrite it.
    let summaryEdited: Bool
    /// Up to 8, strongest first.
    let likes: [TasteWeight]
    /// Up to 8, most negative first.
    let dislikes: [TasteWeight]
    let updatedAt: EpochMillis?
}

/// One `[tag, weight]` pair, on the wire as a two-element array.
struct TasteWeight: Codable, Hashable, Sendable {
    let tag: TasteTag
    let weight: Double

    init(tag: TasteTag, weight: Double) {
        self.tag = tag
        self.weight = weight
    }

    init(from decoder: any Decoder) throws {
        var c = try decoder.unkeyedContainer()
        tag = TasteTag(try c.decode(String.self))
        weight = try c.decode(Double.self)
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(tag.raw)
        try c.encode(weight)
    }
}

/// A tag like "cuisine:ramen" or "attr:outdoor_seating": shown as the part after the colon with
/// `_` as a space, grouped by the prefix (cuisine, dish, price, occasion, vibe, attr, amenity).
struct TasteTag: Hashable, Sendable {
    let raw: String

    init(_ raw: String) {
        self.raw = raw
    }

    /// The part before the first colon, or "" when there is none.
    var prefix: String {
        guard let colon = raw.firstIndex(of: ":") else { return "" }
        return String(raw[..<colon])
    }

    /// The readable part: "outdoor seating". Prices read as "$$".
    var label: String {
        let value = raw.firstIndex(of: ":").map { String(raw[raw.index(after: $0)...]) } ?? raw
        if prefix == "price", let level = Int(value) { return PriceText.label(level) ?? value }
        if prefix == "occasion" { return Occasion(rawValue: value)?.label ?? value.replacingOccurrences(of: "_", with: " ") }
        return value.replacingOccurrences(of: "_", with: " ")
    }
}

/// `data` of `POST /api/taste/refresh`: the new view plus what the refresh did.
struct TasteRefresh: Decodable, Hashable, Sendable {
    let view: TasteView
    let aiConnected: Bool
    let cardsWritten: Int
    let summaryWritten: Bool

    private enum CodingKeys: String, CodingKey {
        case aiConnected, cardsWritten, summaryWritten
    }

    init(from decoder: any Decoder) throws {
        view = try TasteView(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        aiConnected = try c.decode(Bool.self, forKey: .aiConnected)
        cardsWritten = try c.decode(Int.self, forKey: .cardsWritten)
        summaryWritten = try c.decode(Bool.self, forKey: .summaryWritten)
    }
}

/// Body of `PUT /api/taste`. A string saves it as the user's own; nil (sent as `null`) hands
/// the summary back to the AI. At most 2000 chars.
struct TasteSummaryPut: Encodable, Hashable, Sendable {
    var summary: String?

    private enum CodingKeys: String, CodingKey { case summary }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        if let summary { try c.encode(summary, forKey: .summary) } else { try c.encodeNil(forKey: .summary) }
    }
}
