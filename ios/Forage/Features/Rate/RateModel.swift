import Foundation
import Observation

/// The rating flow's screen state (spec 1.2): where the deck is centred, the `RateFlow` value,
/// and every call it makes. Each write first makes sure a session exists (a guest if needed).
@MainActor
@Observable
final class RateModel {
    /// Whether the app may use location: granted, not asked yet, or refused.
    enum LocationAccess: Sendable { case granted, notAsked, denied }

    nonisolated static let deckRadiusKm = 1.5
    nonisolated static let deckLimit = 24
    /// How long "Zenpo Sushi is now 8.7" or a fine-tuned score stays before moving on.
    nonisolated static let scorePause: Duration = .milliseconds(600)

    private(set) var flow: RateFlow
    private(set) var spot: NearSpot?
    /// The location step shows the city search (refused, failed, or asked for).
    private(set) var showsCitySearch = false
    private(set) var isLocating = false
    private(set) var isLoadingDeck = false
    private(set) var deckError: String?
    /// A write or undo in flight; controls are disabled meanwhile.
    private(set) var isBusy = false
    private(set) var error: String?
    /// "Zenpo Sushi is now 8.7", shown after an answer.
    private(set) var scoreNote: String?
    /// "Not now" on the save prompt hides it until the finish screen.
    var savePromptHidden = false
    /// Bumped on every recorded choice, for haptics.
    private(set) var feedbackTick = 0

    let search: RateSearchModel

    private let service: RateService
    private let host: RateHost
    private let locate: @MainActor () async -> LatLng?
    private let access: @MainActor () -> LocationAccess
    private let pause: Duration

    init(service: RateService, host: RateHost, progress: RateProgress,
         locate: @escaping @MainActor () async -> LatLng?,
         access: @escaping @MainActor () -> LocationAccess,
         pause: Duration = RateModel.scorePause,
         searchDelay: Duration = AreaSearchModel.debounce) {
        self.service = service
        self.host = host
        self.locate = locate
        self.access = access
        self.pause = pause
        flow = RateFlow(progress: progress)
        search = RateSearchModel(search: service.search, handle: host.handle, delay: searchDelay)
    }

    var showsSavePrompt: Bool {
        host.isGuest() && flow.progress.rated >= flow.progress.firstPicksAt && !savePromptHidden
    }

    // MARK: - Location and deck

    /// Once, when the flow opens: straight to the deck when location is already allowed.
    func start() async {
        guard spot == nil, !isLocating else { return }
        switch access() {
        case .granted: await useMyLocation()
        case .notAsked: flow = flow.locating()
        case .denied:
            showsCitySearch = true
            flow = flow.locating()
        }
    }

    /// "Use my location": the system prompt appears only now.
    func useMyLocation() async {
        isLocating = true
        let point = await locate()
        isLocating = false
        guard let point, point.isValid else {
            showsCitySearch = true
            deckError = access() == .denied ? NearSpotMessage.denied : NearSpotMessage.unavailable
            flow = flow.locating()
            return
        }
        await choose(NearSpot(fix: point))
    }

    func askForCity() {
        showsCitySearch = true
    }

    func choose(_ spot: NearSpot) async {
        self.spot = spot
        search.origin = spot.coordinate
        deckError = nil
        await loadDeck(more: false)
    }

    /// The first page, or "Show more places" with everything shown excluded.
    func loadDeck(more: Bool) async {
        guard let spot, !isLoadingDeck else { return }
        isLoadingDeck = true
        deckError = nil
        defer { isLoadingDeck = false }
        let request = DeckRequest(lat: spot.lat, lng: spot.lng, radiusKm: Self.deckRadiusKm, limit: Self.deckLimit,
                                  exclude: more ? flow.shownIds : [])
        do {
            let page = try await service.deck(request)
            flow = flow.receiving(page, append: more)
            host.changed(flow.progress)
        } catch {
            deckError = host.handle(error)
        }
    }

    // MARK: - Step A

    func toggle(_ tile: DeckPlace) {
        flow = flow.toggling(tile.id)
        feedbackTick += 1
    }

    /// A search result: shown on the grid as Been.
    func addFromSearch(_ tile: DeckPlace) {
        flow = flow.adding(tile)
        search.clear()
        feedbackTick += 1
    }

    func want(_ tile: DeckPlace) async {
        await write {
            try await self.service.want(tile.id)
            self.flow = self.flow.markingWanted(tile)
        }
    }

    func skip(_ tile: DeckPlace) async {
        await write {
            try await self.service.skip(tile.id)
            self.flow = self.flow.markingSkipped(tile.id)
        }
    }

    func startRating() {
        error = nil
        flow = flow.startingToRate()
    }

    // MARK: - Step B

    func chooseOccasion(_ occasion: Occasion) async {
        guard let tile = flow.current else { return }
        guard let entry = flow.rated[tile.id] else {
            flow = flow.choosingOccasion(occasion, for: tile.id)
            return
        }
        guard entry.occasion != occasion else { return }
        await edit(entry, VisitPatch(occasion: occasion))
    }

    /// One of the three buttons. Saves the visit, or changes its reaction (dropping a rating
    /// that no longer fits). Stays on the place so the score can be fine-tuned.
    func react(_ reaction: Reaction) async {
        guard let tile = flow.current else { return }
        if let entry = flow.rated[tile.id] {
            guard entry.reaction != reaction else { return }
            await edit(entry, VisitPatch(reaction: reaction, rating: .some(nil)))
        } else {
            await create(tile, reaction: reaction, rating: nil)
        }
    }

    /// A score out of 10: saves (or updates) the visit in that band, shows the score, moves on.
    func score(_ rating: Int) async {
        guard let tile = flow.current, (1...10).contains(rating) else { return }
        let reaction = RatingBand.reaction(for: rating)
        let saved: Bool
        if let entry = flow.rated[tile.id] {
            guard entry.rating != rating else { return await next() }
            saved = await edit(entry, VisitPatch(reaction: reaction == entry.reaction ? nil : reaction, rating: .some(rating)))
        } else {
            saved = await create(tile, reaction: reaction, rating: rating)
        }
        guard saved else { return }
        try? await Task.sleep(for: pause)
        guard flow.current?.id == tile.id, flow.step == .rate else { return }
        await next()
    }

    /// "Next place" (or "Skip" before rating, or a swipe left).
    func next() async {
        guard let tile = flow.current, !isBusy else { return }
        if flow.needsOpponentRefresh(tile.id), let entry = flow.rated[tile.id] {
            isBusy = true
            defer { isBusy = false }
            do {
                let step = try await service.nextQuestion(tile.id, entry.occasion, entry.asked)
                flow = flow.receivingOpponent(step, for: tile.id)
            } catch {
                _ = host.handle(error) // no question this time; move on regardless
            }
        }
        error = nil
        flow = flow.advancing()
    }

    func back() {
        error = nil
        scoreNote = nil
        flow = flow.goingBack()
    }

    // MARK: - Step C

    func pick(_ winner: Place, in question: CompareQuestion) async {
        let loser = winner.id == question.subject.id ? question.opponent : question.subject.place
        let request = ComparisonRequest(
            comparison: ComparisonInput(winnerPlaceId: winner.id, loserPlaceId: loser.id, occasion: question.occasion),
            next: ComparisonNext(subjectPlaceId: question.subject.id, asked: question.asked + 1))
        var saved = false
        await write {
            let answer = try await self.service.answer(request)
            self.flow = self.flow.recording(answer, for: question)
            let score = self.flow.rated[question.subject.id]?.score
            self.scoreNote = "\(question.subject.place.name) is now \(ScoreText.format(score))"
            saved = true
        }
        guard saved else { return }
        try? await Task.sleep(for: pause)
        guard flow.step == .compare(question) else { return }
        scoreNote = nil
        flow = flow.afterAnswer()
    }

    /// "Too tough": writes nothing and moves on.
    func tooTough() {
        scoreNote = nil
        flow = flow.movingOn()
    }

    // MARK: - Finish

    func finish() {
        flow = flow.finishing()
    }

    func rateMore() async {
        flow = flow.pickingMore()
        if flow.visibleTiles.count < 6, flow.hasMore { await loadDeck(more: true) }
    }

    // MARK: - Undo

    /// Reverses the last write and returns to where it was made.
    func undo() async {
        guard let entry = flow.lastUndo, !isBusy else { return }
        isBusy = true
        error = nil
        scoreNote = nil
        defer { isBusy = false }
        do {
            let score = try await reverse(entry)
            flow = flow.undoing(entry, score: score)
            host.changed(flow.progress)
        } catch {
            self.error = host.handle(error)
        }
    }

    private func reverse(_ entry: RateUndo) async throws -> Double? {
        switch entry {
        case .rated(_, let visitId, _):
            try await service.deleteVisit(visitId)
            return nil
        case .edited(let previous, _):
            let patch = VisitPatch(reaction: previous.reaction, occasion: previous.occasion, rating: .some(previous.rating))
            return try await service.edit(previous.visitId, patch).score
        case .compared(let id, let question, _, _):
            return try await service.deleteAnswer(id, question.subject.id)
        case .wanted(let placeId):
            try await service.unwant(placeId)
            return nil
        case .skipped(let placeId):
            try await service.unskip(placeId)
            return nil
        }
    }

    // MARK: - Writes

    @discardableResult
    private func create(_ tile: DeckPlace, reaction: Reaction, rating: Int?) async -> Bool {
        let input = VisitInput(placeId: tile.id, visitedOn: .today(), reaction: reaction, occasion: flow.occasion(for: tile),
                               rating: rating, dated: false)
        var saved = false
        await write {
            let response = try await self.service.log(input)
            self.flow = self.flow.recording(response, for: tile)
            saved = true
        }
        return saved
    }

    @discardableResult
    private func edit(_ entry: RatedPlace, _ patch: VisitPatch) async -> Bool {
        var saved = false
        await write {
            let response = try await self.service.edit(entry.visitId, patch)
            self.flow = self.flow.recordingEdit(response, previous: entry)
            saved = true
        }
        return saved
    }

    /// Runs one write: a session first (a guest if needed), one at a time, errors shown inline.
    private func write(_ body: @MainActor () async throws -> Void) async {
        guard !isBusy else { return }
        isBusy = true
        error = nil
        defer { isBusy = false }
        do {
            try await host.ensureSession()
            try await body()
            feedbackTick += 1
            host.changed(flow.progress)
        } catch {
            self.error = host.handle(error)
        }
    }
}
