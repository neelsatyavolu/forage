import Foundation

/// Pure helpers for logging (the web's `components/log/options.ts`), tested off the main actor.
enum LogOptions {
    /// Reaction choices with the log form's wording.
    nonisolated static let reactions: [Reaction] = [.loved, .fine, .disliked]
    nonisolated static let occasions: [Occasion] = [.quick, .casual, .nightOut, .special]

    nonisolated static func reactionLabel(_ reaction: Reaction) -> String {
        switch reaction {
        case .loved: "Loved it"
        case .fine, .unknown: "It was fine"
        case .disliked: "Didn't like it"
        }
    }

    /// "ramen, gyoza ,, " -> ["ramen", "gyoza"]: dishes typed as a comma list, deduplicated,
    /// each at most 100 characters, at most 20.
    nonisolated static func parseDishes(_ text: String) -> [String] {
        var seen = Set<String>()
        var dishes: [String] = []
        for part in text.split(separator: ",", omittingEmptySubsequences: false) {
            let dish = String(part.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
            guard !dish.isEmpty, seen.insert(dish).inserted else { continue }
            dishes.append(dish)
        }
        return Array(dishes.prefix(20))
    }

    nonisolated static let maxNote = 2000
}

/// What the visit form holds before it is sent.
struct VisitDraft: Hashable, Sendable {
    var reaction: Reaction?
    var occasion: Occasion?
    var visitedOn: LocalDate
    var dishes = ""
    var note = ""

    /// The body for `POST /api/visits`, or the message to show.
    nonisolated func input(placeId: String, today: LocalDate) -> Result<VisitInput, DraftError> {
        guard let reaction, let occasion else { return .failure(.missingChoice) }
        guard visitedOn <= today else { return .failure(.futureDate) }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count <= LogOptions.maxNote else { return .failure(.noteTooLong) }
        return .success(VisitInput(placeId: placeId, visitedOn: visitedOn, reaction: reaction, occasion: occasion,
                                   dishes: LogOptions.parseDishes(dishes), note: trimmed.isEmpty ? nil : trimmed))
    }

    enum DraftError: Error, Equatable {
        case missingChoice, futureDate, noteTooLong

        var message: String {
            switch self {
            case .missingChoice: "Pick how it was and what kind of meal it was."
            case .futureDate: "Pick today or an earlier day."
            case .noteTooLong: "Keep the note under 2,000 characters."
            }
        }
    }
}

/// What the place search should ask for: a name search (biased to `near`) or what's nearby.
struct PlaceQuery: Hashable, Sendable {
    let text: String
    let near: LatLng?

    /// nil when there is nothing to search: no text and no location.
    nonisolated static func make(text: String, near: LatLng?) -> PlaceQuery? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || near != nil else { return nil }
        return PlaceQuery(text: String(trimmed.prefix(200)), near: near)
    }

    var isNameSearch: Bool { !text.isEmpty }

    /// Search-as-you-type waits this long; "nearby" goes at once.
    var debounce: Duration { isNameSearch ? .milliseconds(300) : .zero }

    nonisolated static let nearbyRadiusKm = 1.5

    var endpoint: Endpoint<PlacesResponse> {
        if isNameSearch { return API.Places.search(text, near: near) }
        // `make` guarantees a location when there is no text.
        return API.Places.nearby(near ?? LatLng(lat: 0, lng: 0), radiusKm: Self.nearbyRadiusKm)
    }

    var emptyMessage: String {
        isNameSearch ? "No places by that name. Try fewer words or another spelling."
            : "No places to eat found within 1.5 km."
    }
}
