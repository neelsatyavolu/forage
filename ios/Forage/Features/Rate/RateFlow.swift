import Foundation

/// A place rated in this run of the flow: the saved visit and what the server said about it.
struct RatedPlace: Hashable, Sendable {
    let tile: DeckPlace
    let visitId: String
    var reaction: Reaction
    var rating: Int?
    var occasion: Occasion
    var score: Double?
    /// The next "Which did you like more?" opponent the server offered, nil when none.
    var opponent: Place?
    /// Questions answered for this place.
    var asked: Int
    /// The reaction or occasion changed since `opponent` was offered, so ask the server again.
    var needsFreshOpponent = false
}

/// One head-to-head: the place being rated against one the server picked (same occasion and band).
struct CompareQuestion: Hashable, Sendable {
    let subject: DeckPlace
    let opponent: Place
    let occasion: Occasion
    /// Answered before this one.
    let asked: Int
}

/// Every write the flow makes, newest last, so Undo can reverse it (spec 1.2, "Undo").
enum RateUndo: Hashable, Sendable {
    /// `DELETE /api/visits/{id}`.
    case rated(placeId: String, visitId: String, index: Int)
    /// `PATCH /api/visits/{id}` back to `previous`.
    case edited(previous: RatedPlace, index: Int)
    /// `DELETE /api/comparisons/{id}`.
    case compared(id: Int, question: CompareQuestion, previous: RatedPlace, index: Int)
    /// `DELETE /api/want`.
    case wanted(placeId: String)
    /// `DELETE /api/rate/skips`.
    case skipped(placeId: String)
}

/// The rating flow's state and its transitions, with no I/O: `RateModel` makes the calls and
/// feeds the answers in here. Every transition returns a new value.
struct RateFlow: Hashable, Sendable {
    enum Step: Hashable, Sendable {
        /// "Forage lists places near you to rate." Use my location / Search a city.
        case locate
        /// Step A: tap every place you've been to.
        case pick
        /// Step B: how was it, one place at a time (`index` into `queue`).
        case rate
        /// Step C: which did you like more?
        case compare(CompareQuestion)
        case finish
    }

    nonisolated static let undoLimit = 20
    /// While onboarding (under `RateProgress.goal` rated) ask one question per place, else two.
    nonisolated static let onboardingQuestions = 1

    private(set) var step: Step = .locate
    /// Tiles in the order shown (deck pages, then places added from search).
    private(set) var deck: [DeckPlace] = []
    private(set) var hasMore = false
    /// Been, in the order tapped.
    private(set) var selected: [String] = []
    private(set) var wanted: Set<String> = []
    private(set) var skipped: Set<String> = []
    /// Step B's places and the one on screen.
    private(set) var queue: [DeckPlace] = []
    private(set) var index = 0
    private(set) var rated: [String: RatedPlace] = [:]
    /// The occasion picked for a place before it is rated (defaults to the deck's guess).
    private(set) var occasionChoice: [String: Occasion] = [:]
    private(set) var undoStack: [RateUndo] = []
    private(set) var progress: RateProgress
    /// Rated count when Step B started; fixes how many questions each place gets.
    private(set) var questionBase: Int

    init(progress: RateProgress = .zero) {
        self.progress = progress
        questionBase = progress.rated
    }

    // MARK: - Reading

    /// Tiles still on the grid: not marked Not been and not rated already.
    var visibleTiles: [DeckPlace] {
        deck.filter { !skipped.contains($0.id) && rated[$0.id] == nil }
    }

    /// Ids already shown, for the deck's `exclude` ("Show more places").
    var shownIds: [String] { Array(deck.map(\.id).suffix(DeckRequest.maxExclude)) }

    var current: DeckPlace? { queue.indices.contains(index) ? queue[index] : nil }

    var currentRated: RatedPlace? { current.flatMap { rated[$0.id] } }

    func occasion(for tile: DeckPlace) -> Occasion {
        rated[tile.id]?.occasion ?? occasionChoice[tile.id] ?? tile.guessedOccasion
    }

    var questionLimit: Int {
        questionBase < progress.goal ? Self.onboardingQuestions : CompareStep.maxComparisons
    }

    /// The question to ask for `placeId` now, if the server offered one and the limit allows.
    func pendingQuestion(for placeId: String) -> CompareQuestion? {
        guard let entry = rated[placeId], !entry.needsFreshOpponent, entry.asked < questionLimit,
              let opponent = entry.opponent else { return nil }
        return CompareQuestion(subject: entry.tile, opponent: opponent, occasion: entry.occasion, asked: entry.asked)
    }

    /// True when moving on from `placeId` should first ask the server for a fresh opponent.
    func needsOpponentRefresh(_ placeId: String) -> Bool {
        guard let entry = rated[placeId] else { return false }
        return entry.needsFreshOpponent && entry.asked < questionLimit
    }

    /// The places rated in this run, best first, for the finish screen.
    var ratedBestFirst: [RatedPlace] {
        rated.values.sorted { ($0.score ?? 0, $0.tile.place.name) > ($1.score ?? 0, $1.tile.place.name) }
    }

    var canUndo: Bool { !undoStack.isEmpty }

    /// "Done for now" on the grid: nothing selected but something already recorded.
    var canFinishFromPick: Bool { selected.isEmpty && (!wanted.isEmpty || !skipped.isEmpty || !rated.isEmpty) }

    // MARK: - Step A

    func locating() -> RateFlow { with { $0.step = .locate } }

    /// A deck page arrived. `append` keeps what is shown ("Show more places").
    func receiving(_ page: DeckResponse, append: Bool) -> RateFlow {
        with { flow in
            let base = append ? flow.deck : flow.deck.filter { flow.selected.contains($0.id) }
            let known = Set(base.map(\.id))
            flow.deck = base + page.places.filter { !known.contains($0.id) }
            flow.hasMore = page.hasMore
            flow.progress = page.progress
            flow.step = .pick
        }
    }

    func toggling(_ placeId: String) -> RateFlow {
        with { flow in
            if let at = flow.selected.firstIndex(of: placeId) {
                flow.selected.remove(at: at)
            } else if flow.rated[placeId] == nil {
                flow.selected.append(placeId)
                flow.wanted.remove(placeId)
            }
        }
    }

    /// A search result marked Been: shown first on the grid and selected.
    func adding(_ tile: DeckPlace) -> RateFlow {
        with { flow in
            if !flow.deck.contains(where: { $0.id == tile.id }) { flow.deck.insert(tile, at: 0) }
            flow.skipped.remove(tile.id)
            if !flow.selected.contains(tile.id), flow.rated[tile.id] == nil { flow.selected.append(tile.id) }
        }
    }

    func markingWanted(_ tile: DeckPlace) -> RateFlow {
        with { flow in
            if !flow.deck.contains(where: { $0.id == tile.id }) { flow.deck.insert(tile, at: 0) }
            flow.wanted.insert(tile.id)
            flow.selected.removeAll { $0 == tile.id }
            flow.push(.wanted(placeId: tile.id))
        }
    }

    func markingSkipped(_ placeId: String) -> RateFlow {
        with { flow in
            flow.skipped.insert(placeId)
            flow.selected.removeAll { $0 == placeId }
            flow.push(.skipped(placeId: placeId))
        }
    }

    /// "Next: rate N places". Already rated places drop out; nothing left goes to the finish.
    func startingToRate() -> RateFlow {
        with { flow in
            let ids = flow.selected.filter { flow.rated[$0] == nil }
            flow.queue = ids.compactMap { id in flow.deck.first { $0.id == id } }
            flow.index = 0
            flow.questionBase = flow.progress.rated
            flow.step = flow.queue.isEmpty ? .finish : .rate
        }
    }

    // MARK: - Step B

    func choosingOccasion(_ occasion: Occasion, for placeId: String) -> RateFlow {
        with { $0.occasionChoice[placeId] = occasion }
    }

    /// `POST /api/visits` answered for the place on screen.
    func recording(_ response: LogResponse, for tile: DeckPlace) -> RateFlow {
        with { flow in
            let isNew = flow.rated[tile.id] == nil
            flow.rated[tile.id] = RatedPlace(
                tile: tile, visitId: response.visit.id, reaction: response.visit.reaction,
                rating: response.visit.rating, occasion: response.visit.occasion, score: response.score,
                opponent: response.opponent, asked: response.asked)
            if isNew { flow.progress = flow.progress.adding(1) }
            flow.push(.rated(placeId: tile.id, visitId: response.visit.id, index: flow.index))
        }
    }

    /// `PATCH /api/visits/{id}` answered (fine-tune, new reaction or occasion).
    func recordingEdit(_ response: VisitResponse, previous: RatedPlace) -> RateFlow {
        with { flow in
            let visit = response.visit
            var entry = previous
            entry.reaction = visit.reaction
            entry.rating = visit.rating
            entry.occasion = visit.occasion
            entry.score = response.score
            if visit.reaction != previous.reaction || visit.occasion != previous.occasion {
                entry.needsFreshOpponent = true
                entry.opponent = nil
            }
            flow.rated[previous.tile.id] = entry
            flow.push(.edited(previous: previous, index: flow.index))
        }
    }

    /// `GET /api/comparisons/next` answered after an edit.
    func receivingOpponent(_ step: CompareStep, for placeId: String) -> RateFlow {
        with { flow in
            guard var entry = flow.rated[placeId] else { return }
            entry.opponent = step.opponent
            entry.score = step.score ?? entry.score
            entry.needsFreshOpponent = false
            flow.rated[placeId] = entry
        }
    }

    /// Next place (or "Skip" before rating): ask the pending question first, if any.
    func advancing() -> RateFlow {
        guard let current, let question = pendingQuestion(for: current.id) else { return movingOn() }
        return with { $0.step = .compare(question) }
    }

    /// Past this place without a question: the next one, or the finish.
    func movingOn() -> RateFlow {
        with { flow in
            flow.index += 1
            flow.step = flow.index < flow.queue.count ? .rate : .finish
        }
    }

    /// "Back": the previous place, or the grid from the first. Deletes nothing.
    func goingBack() -> RateFlow {
        with { flow in
            if case .compare = flow.step {
                flow.step = .rate
            } else if flow.index > 0 {
                flow.index -= 1
                flow.step = .rate
            } else {
                flow.step = .pick
            }
        }
    }

    // MARK: - Step C

    /// `POST /api/comparisons` answered.
    func recording(_ answer: CompareAnswer, for question: CompareQuestion) -> RateFlow {
        with { flow in
            guard let previous = flow.rated[question.subject.id] else { return }
            var entry = previous
            entry.score = answer.subjectScore ?? answer.score ?? entry.score
            entry.asked = max(answer.asked, question.asked + 1)
            entry.opponent = answer.opponent
            flow.rated[question.subject.id] = entry
            flow.push(.compared(id: answer.id, question: question, previous: previous, index: flow.index))
        }
    }

    /// After an answer (and its score has been shown): another question, or the next place.
    func afterAnswer() -> RateFlow {
        guard let current, let question = pendingQuestion(for: current.id) else { return movingOn() }
        return with { $0.step = .compare(question) }
    }

    // MARK: - Finish

    func finishing() -> RateFlow { with { $0.step = .finish } }

    /// "Rate more places": back to the grid with the rated ones gone.
    func pickingMore() -> RateFlow {
        with { flow in
            flow.selected.removeAll { flow.rated[$0] != nil }
            flow.queue = []
            flow.index = 0
            flow.step = .pick
        }
    }

    // MARK: - Undo

    var lastUndo: RateUndo? { undoStack.last }

    /// Applies an undo the server has carried out. `score` is the place's score afterwards
    /// when the call returns one. Returns to the step and place the action came from.
    func undoing(_ entry: RateUndo, score: Double? = nil) -> RateFlow {
        with { flow in
            guard flow.undoStack.last == entry else { return }
            flow.undoStack.removeLast()
            switch entry {
            case .rated(let placeId, _, let index):
                flow.rated[placeId] = nil
                flow.progress = flow.progress.adding(-1)
                flow.returnToRate(index: index, placeId: placeId)
            case .edited(let previous, let index):
                var restored = previous
                restored.score = score ?? previous.score
                flow.rated[previous.tile.id] = restored
                flow.returnToRate(index: index, placeId: previous.tile.id)
            case .compared(_, let question, let previous, let index):
                var restored = previous
                restored.score = score ?? previous.score
                flow.rated[question.subject.id] = restored
                flow.returnToRate(index: index, placeId: question.subject.id)
                flow.step = .compare(question)
            case .wanted(let placeId):
                flow.wanted.remove(placeId)
                flow.step = .pick
            case .skipped(let placeId):
                flow.skipped.remove(placeId)
                flow.step = .pick
            }
        }
    }

    // MARK: - Helpers

    private func with(_ change: (inout RateFlow) -> Void) -> RateFlow {
        var copy = self
        change(&copy)
        return copy
    }

    private mutating func push(_ entry: RateUndo) {
        undoStack.append(entry)
        if undoStack.count > Self.undoLimit { undoStack.removeFirst(undoStack.count - Self.undoLimit) }
    }

    private mutating func returnToRate(index: Int, placeId: String) {
        if let at = queue.firstIndex(where: { $0.id == placeId }) {
            self.index = at
        } else {
            self.index = min(index, max(0, queue.count - 1))
        }
        step = queue.isEmpty ? .pick : .rate
    }
}
