import Foundation
import Observation

/// Add a place to a Lodestar trip day (the web's `AddToTrip`): pick a trip, a day (with the
/// meals already planned that day), an optional time and note, then `POST /api/lodestar/add`.
@MainActor
@Observable
final class AddToTripModel {
    struct Service {
        var days: @Sendable (String) async throws -> [TripDay]
        var add: @Sendable (AddToTripRequest) async throws -> Void
        var handle: @MainActor (any Error) -> String?
        /// A 409: the link is gone; refresh `GET /api/lodestar`.
        var unlinked: @MainActor () async -> Void
    }

    nonisolated static let noteLimit = 500

    let place: Place
    let trips: [TripSummary]
    private(set) var tripId: String
    private(set) var days: LoadState<[TripDay]> = .idle
    var day: LocalDate?
    var usesTime = false
    var time: Date = AddToTripModel.defaultTime
    var note = ""
    private(set) var saving = false
    private(set) var error: String?
    private(set) var done: String?

    private let service: Service

    init(place: Place, trips: [TripSummary], initialTripId: String?, service: Service) {
        self.place = place
        self.trips = trips
        self.tripId = initialTripId.flatMap { id in trips.first { $0.id == id }?.id } ?? trips.first?.id ?? ""
        self.service = service
    }

    convenience init(place: Place, trips: [TripSummary], initialTripId: String?, app: AppState) {
        let api = app.api
        self.init(place: place, trips: trips, initialTripId: initialTripId, service: Service(
            days: { try await api.send(API.Lodestar.trip(id: $0)).days },
            add: { _ = try await api.send(API.Lodestar.add($0)) },
            handle: { [weak app] in app?.handle($0) ?? $0.userMessage },
            unlinked: { [weak app] in await app?.refreshLodestar() }))
    }

    var trip: TripSummary? { trips.first { $0.id == tripId } }

    /// 19:00 today, a dinner default for the time picker.
    nonisolated static var defaultTime: Date {
        Calendar.current.date(bySettingHour: 19, minute: 0, second: 0, of: .now) ?? .now
    }

    /// The trip's first day when it has no planned days, for the date picker.
    var fallbackDay: LocalDate {
        trip?.startDate ?? .today()
    }

    func selectTrip(_ id: String) async {
        guard id != tripId, trips.contains(where: { $0.id == id }) else { return }
        tripId = id
        await loadDays()
    }

    func loadDays() async {
        guard !tripId.isEmpty else { return }
        days = .loading
        day = nil
        let requested = tripId
        do {
            let loaded = try await service.days(requested)
            guard requested == tripId else { return }
            days = .loaded(loaded)
            // No dates: the date picker shows a day, so start with one chosen.
            if loaded.isEmpty { day = fallbackDay }
        } catch {
            guard requested == tripId, let message = await failure(error) else { return }
            days = .failed(message)
        }
    }

    /// 24-hour "HH:MM" in the device's calendar.
    nonisolated static func timeString(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// "Tue 12-01" (the web's weekday plus month and day), read in UTC so it never shifts.
    nonisolated static func dayLabel(_ day: LocalDate) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEE"
        return "\(formatter.string(from: day.date)) \(String(day.string.dropFirst(5)))"
    }

    /// "19:30 Dinner at X, Lunch" or "No meals planned".
    nonisolated static func mealsLine(_ meals: [TripMeal]) -> String {
        guard !meals.isEmpty else { return "No meals planned" }
        return meals.map { meal in meal.time.map { "\($0) \(meal.title)" } ?? meal.title }.joined(separator: ", ")
    }

    func request() -> AddToTripRequest? {
        guard let day, !tripId.isEmpty else { return nil }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return AddToTripRequest(tripId: tripId, placeId: place.id, day: day,
                                time: usesTime ? Self.timeString(time) : nil,
                                note: trimmed.isEmpty ? nil : String(trimmed.prefix(Self.noteLimit)))
    }

    func save() async {
        error = nil
        guard let request = request() else {
            error = "Pick a day."
            return
        }
        saving = true
        defer { saving = false }
        do {
            try await service.add(request)
            done = "Added to \(trip?.title ?? "the trip") on \(request.day.string)."
        } catch {
            self.error = await failure(error)
        }
    }

    private func failure(_ error: any Error) async -> String? {
        if let api = error as? APIError, api.isLodestarUnlinked { await service.unlinked() }
        return service.handle(error)
    }
}
