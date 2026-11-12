import Foundation
import Observation

/// Where picks are centred, for Near me and Ask (the web's `useLocation`). Starts from the
/// remembered spot, then asks CoreLocation for a fresh fix. A failed fix keeps the spot already
/// shown and says why in `notice`.
@MainActor
@Observable
final class SpotModel {
    enum State: Equatable, Sendable {
        case idle
        case locating
        case ready(NearSpot)
        case unavailable(String)
    }

    private(set) var state: State = .idle
    private(set) var notice: String?
    @ObservationIgnored private var started = false
    @ObservationIgnored private var askedForFix = false

    private let fix: @MainActor () async -> LatLng?
    private let isDenied: @MainActor () -> Bool
    private let isAllowed: @MainActor () -> Bool
    private let defaults: UserDefaults

    init(fix: @escaping @MainActor () async -> LatLng?,
         isDenied: @escaping @MainActor () -> Bool,
         isAllowed: @escaping @MainActor () -> Bool = { false },
         defaults: UserDefaults = .standard) {
        self.fix = fix
        self.isDenied = isDenied
        self.isAllowed = isAllowed
        self.defaults = defaults
    }

    convenience init(location: LocationService) {
        self.init(fix: { await location.requestFix() }, isDenied: { location.isDenied }, isAllowed: { location.isAllowed })
    }

    var spot: NearSpot? {
        if case .ready(let spot) = state { return spot }
        return nil
    }

    /// True while a fix is on its way (the bar's button shows a spinner).
    private(set) var isLocating = false
    /// True when the last attempt failed because permission is off (show "Open Settings").
    private(set) var deniedByUser = false

    /// The message under the bar: a failed fix, or why there is no spot at all.
    var message: String? {
        if let notice { return notice }
        if case .unavailable(let message) = state, !message.isEmpty { return message }
        return nil
    }

    /// Once per screen: show the remembered spot, then try for a fresh fix. With `prompt: false`
    /// it never shows the location prompt on its own: it keeps the remembered spot (or offers the
    /// city search) and only asks for a fix when location is already allowed. Call again with
    /// `prompt: true` once the screen needs a location.
    func start(prompt: Bool = true) async {
        if !started {
            started = true
            if let last = NearSpotMemory.load(from: defaults) { state = .ready(last) }
        }
        guard !askedForFix else { return }
        guard prompt || isAllowed() else {
            if spot == nil { state = .unavailable("") }
            return
        }
        askedForFix = true
        await locate()
    }

    /// "Use my location".
    func locate() async {
        guard !isLocating else { return }
        if spot == nil { state = .locating }
        isLocating = true
        let point = await fix()
        isLocating = false
        guard let point, point.isValid else {
            refuse(isDenied())
            return
        }
        choose(NearSpot(fix: point))
    }

    /// A picked area or typed coordinates.
    func choose(_ spot: NearSpot) {
        NearSpotMemory.save(spot, to: defaults)
        notice = nil
        deniedByUser = false
        state = .ready(spot)
    }

    private func refuse(_ denied: Bool) {
        deniedByUser = denied
        let message = denied ? NearSpotMessage.denied : NearSpotMessage.unavailable
        notice = message
        if spot == nil { state = .unavailable(message) }
    }
}
