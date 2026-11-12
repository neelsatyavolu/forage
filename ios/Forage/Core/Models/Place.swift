import Foundation

/// A coordinate as the API sends it (`lat` −90…90, `lng` −180…180).
struct LatLng: Codable, Hashable, Sendable {
    let lat: Double
    let lng: Double

    var isValid: Bool { abs(lat) <= 90 && abs(lng) <= 180 }
}

/// A restaurant (api.md §1.1). `id` is Forage's stable UUID; visits, lists and recs reference it.
struct Place: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let source: PlaceSource
    /// For OSM, e.g. "node/123456".
    let sourceId: String
    let googlePlaceId: String?
    let name: String
    let lat: Double
    let lng: Double
    let address: String?
    let city: String?
    let country: String?
    /// Lowercase OSM-style values, e.g. ["ramen", "japanese"].
    let cuisine: [String]
    /// 1…4, shown as "$"…"$$$$".
    let priceLevel: Int?
    let tags: PlaceTags
    let updatedAt: EpochMillis

    var coordinate: LatLng { LatLng(lat: lat, lng: lng) }
}

/// Loose tags: unknown keys are ignored, and a malformed known key reads as absent so one bad
/// tag never breaks a whole response.
struct PlaceTags: Codable, Hashable, Sendable {
    var dishes: [String]?
    var vibe: [String]?
    var attributes: [String]?
    var occasions: [Occasion]?
    /// Raw OSM `opening_hours` text.
    var openingHours: String?
    var website: String?
    var phone: String?
    var description: String?

    static let empty = PlaceTags()

    init(dishes: [String]? = nil, vibe: [String]? = nil, attributes: [String]? = nil, occasions: [Occasion]? = nil,
         openingHours: String? = nil, website: String? = nil, phone: String? = nil, description: String? = nil) {
        self.dishes = dishes
        self.vibe = vibe
        self.attributes = attributes
        self.occasions = occasions
        self.openingHours = openingHours
        self.website = website
        self.phone = phone
        self.description = description
    }

    private enum CodingKeys: String, CodingKey {
        case dishes, vibe, attributes, occasions, openingHours, website, phone, description
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dishes = try? c.decodeIfPresent([String].self, forKey: .dishes)
        vibe = try? c.decodeIfPresent([String].self, forKey: .vibe)
        attributes = try? c.decodeIfPresent([String].self, forKey: .attributes)
        occasions = try? c.decodeIfPresent([Occasion].self, forKey: .occasions)
        openingHours = try? c.decodeIfPresent(String.self, forKey: .openingHours)
        website = try? c.decodeIfPresent(String.self, forKey: .website)
        phone = try? c.decodeIfPresent(String.self, forKey: .phone)
        description = try? c.decodeIfPresent(String.self, forKey: .description)
    }
}

/// Google's live details (api.md §4.2). Only present when the server owner set a key; show as
/// fetched and never store on the device beyond the screen's life.
struct LiveDetails: Codable, Hashable, Sendable {
    /// 1–5.
    let rating: Double?
    let ratingCount: Int?
    let priceLevel: Int?
    let phone: String?
    let website: String?
    /// Google Maps link; open in Maps or Safari.
    let mapsUrl: String?
    let openNow: Bool?
    /// One line per weekday, already formatted.
    let hours: [String]
    let summary: String?
}

/// `data` of `GET /api/places/{id}`.
struct PlaceResponse: Codable, Hashable, Sendable {
    let place: Place
    let live: LiveDetails?
    /// Why `live` is missing when a lookup failed.
    let liveError: String?
    /// This user's visits here.
    let visits: [Visit]
    /// This user's scores here, one per occasion.
    let scores: [PlaceScore]
    let wanted: Bool
}

/// `data` of `GET /api/places` (search or nearby).
struct PlacesResponse: Codable, Hashable, Sendable {
    let places: [Place]
}
