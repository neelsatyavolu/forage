import Foundation

/// How a visit went (api.md §0 "Enums"). Labels are the web's.
enum Reaction: String, LenientEnum {
    case loved
    case fine
    case disliked
    case unknown

    static let unknownCase = Reaction.unknown

    var label: String {
        switch self {
        case .loved: "Loved"
        case .fine: "Fine"
        case .disliked: "Didn't like"
        case .unknown: "Fine"
        }
    }
}

/// The kind of meal a score belongs to. A place has at most one score per occasion.
enum Occasion: String, LenientEnum {
    case quick
    case casual
    case nightOut = "night_out"
    case special
    case unknown

    static let unknownCase = Occasion.unknown

    var label: String {
        switch self {
        case .quick: "Quick bite"
        case .casual: "Casual"
        case .nightOut: "Night out"
        case .special: "Special"
        case .unknown: "Casual"
        }
    }
}

enum PlaceSource: String, LenientEnum {
    case osm
    case manual
    case unknown

    static let unknownCase = PlaceSource.unknown
}

/// Where a Want to try entry came from. Send `.rec` from Near me and Explore, `.ask` from Ask.
enum WantSource: String, LenientEnum {
    case manual
    case rec
    case ask
    case imported = "import"
    case lodestar
    /// Want to try from the rating deck.
    case rate
    case unknown

    static let unknownCase = WantSource.unknown
}

/// The recs engine's mode. Near me sends none (`near` is implied); Explore sends one of the others.
enum RecMode: String, LenientEnum {
    case near
    case travel
    case splurge
    case stretch
    case unknown

    static let unknownCase = RecMode.unknown

    var label: String {
        switch self {
        case .near: "Near me"
        case .travel: "Travel"
        case .splurge: "Splurge"
        case .stretch: "Stretch"
        case .unknown: "Travel"
        }
    }

    /// The modes `POST /api/explore/recs` accepts, in display order.
    static let exploreModes: [RecMode] = [.travel, .splurge, .stretch]
}

/// Near me's filter: "Something new" leaves out visited places; "Go-to" shows only ones you liked.
enum NearFilter: String, LenientEnum {
    case new
    case goTo = "goto"
    case unknown

    static let unknownCase = NearFilter.unknown

    var label: String {
        switch self {
        case .new, .unknown: "Something new"
        case .goTo: "Go-to"
        }
    }
}

/// The user's own AI subscription. Display: codex -> "ChatGPT", grok -> "Grok".
enum AIProvider: String, LenientEnum {
    case codex
    case grok
    case unknown

    static let unknownCase = AIProvider.unknown

    var displayName: String {
        switch self {
        case .codex: "ChatGPT"
        case .grok: "Grok"
        case .unknown: "AI"
        }
    }

    /// The loopback port the provider's OAuth client redirects to.
    var loopbackPort: UInt16? {
        switch self {
        case .codex: 1455
        case .grok: 56121
        case .unknown: nil
        }
    }
}
