import Foundation
import Testing
@testable import Forage

@Suite("Rating flow state machine")
struct RateFlowTests {
    private func picked(_ numbers: [Int], deck: [Int] = [1, 2, 3, 4], rated: Int = 0) -> RateFlow {
        var flow = RateFlow(progress: RateProgress(rated: rated)).receiving(RateFixture.deck(deck, rated: rated), append: false)
        for n in numbers { flow = flow.toggling(RateFixture.id(n)) }
        return flow
    }

    @Test func deckPagesAppendWithoutRepeats() {
        let first = RateFlow().receiving(RateFixture.deck([1, 2]), append: false)
        #expect(first.step == .pick)
        let more = first.receiving(RateFixture.deck([2, 3], hasMore: false), append: true)
        #expect(more.deck.map(\.id) == [1, 2, 3].map(RateFixture.id))
        #expect(more.shownIds.count == 3)
        #expect(!more.hasMore)
    }

    @Test func toggleSelectsInTapOrder() {
        let flow = picked([3, 1])
        #expect(flow.selected == [RateFixture.id(3), RateFixture.id(1)])
        #expect(flow.toggling(RateFixture.id(3)).selected == [RateFixture.id(1)])
    }

    @Test func wantAndNotBeenLeaveTheSelectionAndCanBeUndone() {
        let flow = picked([1, 2])
            .markingWanted(RateFixture.tile(1))
            .markingSkipped(RateFixture.id(2))
        #expect(flow.selected.isEmpty)
        #expect(flow.wanted == [RateFixture.id(1)])
        #expect(!flow.visibleTiles.contains { $0.id == RateFixture.id(2) })
        #expect(flow.canFinishFromPick)

        let undone = flow.undoing(.skipped(placeId: RateFixture.id(2)))
        #expect(undone.visibleTiles.contains { $0.id == RateFixture.id(2) })
        // Only the newest entry can be undone.
        #expect(undone.undoing(.skipped(placeId: RateFixture.id(2))) == undone)
        let both = undone.undoing(.wanted(placeId: RateFixture.id(1)))
        #expect(both.wanted.isEmpty && !both.canUndo)
    }

    @Test func searchResultIsAddedSelected() {
        let flow = picked([]).adding(RateFixture.tile(9))
        #expect(flow.deck.first?.id == RateFixture.id(9))
        #expect(flow.selected == [RateFixture.id(9)])
    }

    @Test func startingQueuesTheSelection() {
        let flow = picked([2, 1]).startingToRate()
        #expect(flow.step == .rate)
        #expect(flow.queue.map(\.id) == [RateFixture.id(2), RateFixture.id(1)])
        #expect(flow.current?.id == RateFixture.id(2))
        #expect(picked([]).startingToRate().step == .finish)
    }

    @Test func ratingCountsProgressAndAsksOneQuestionWhileOnboarding() {
        let tile = RateFixture.tile(1)
        let flow = picked([1, 2]).startingToRate()
            .recording(RateFixture.log(1, opponent: 4), for: tile)
        #expect(flow.progress.rated == 1)
        #expect(flow.currentRated?.score == 8.5)
        #expect(flow.questionLimit == 1)

        let asking = flow.advancing()
        guard case .compare(let question) = asking.step else { Issue.record("Expected a question"); return }
        #expect(question.opponent.id == RateFixture.id(4))
        #expect(question.asked == 0)

        // The server offers a second opponent, but onboarding stops at one.
        let answered = asking.recording(RateFixture.answer(id: 5, score: 8.9, opponent: 3, asked: 1), for: question)
        #expect(answered.rated[tile.id]?.score == 8.9)
        let after = answered.afterAnswer()
        #expect(after.step == .rate)
        #expect(after.current?.id == RateFixture.id(2))
    }

    @Test func twoQuestionsOnceAtTheGoal() {
        let tile = RateFixture.tile(1)
        let flow = picked([1], rated: 12).startingToRate()
            .recording(RateFixture.log(1, opponent: 4), for: tile)
        #expect(flow.questionLimit == 2)
        guard case .compare(let first) = flow.advancing().step else { Issue.record("Expected a question"); return }
        let next = flow.advancing().recording(RateFixture.answer(id: 5, score: 8.9, opponent: 3, asked: 1), for: first).afterAnswer()
        guard case .compare(let second) = next.step else { Issue.record("Expected a second question"); return }
        #expect(second.asked == 1 && second.opponent.id == RateFixture.id(3))
        let done = next.recording(RateFixture.answer(id: 6, score: 9.1, asked: 2), for: second).afterAnswer()
        #expect(done.step == .finish)
        #expect(done.ratedBestFirst.first?.score == 9.1)
    }

    @Test func skippingAPlaceAndGoingBack() {
        let flow = picked([1, 2]).startingToRate().advancing()
        #expect(flow.current?.id == RateFixture.id(2))
        #expect(flow.goingBack().current?.id == RateFixture.id(1))
        #expect(flow.goingBack().goingBack().step == .pick)
        #expect(flow.movingOn().step == .finish)
    }

    @Test func editAfterAnOfferAsksForAFreshOpponent() {
        let tile = RateFixture.tile(1)
        let rated = picked([1]).startingToRate().recording(RateFixture.log(1, opponent: 4), for: tile)
        let previous = rated.rated[tile.id]!
        let edited = rated.recordingEdit(RateFixture.edited(1, reaction: .fine, rating: nil, score: 6), previous: previous)
        #expect(edited.needsOpponentRefresh(tile.id))
        #expect(edited.pendingQuestion(for: tile.id) == nil)
        let refreshed = edited.receivingOpponent(CompareStep(score: 6.1, opponent: RateFixture.place(3), asked: 0), for: tile.id)
        #expect(refreshed.pendingQuestion(for: tile.id)?.opponent.id == RateFixture.id(3))
        #expect(refreshed.rated[tile.id]?.score == 6.1)

        // A fine-tune inside the same band keeps the offered opponent.
        let tuned = rated.recordingEdit(RateFixture.edited(1, reaction: .loved, rating: 9, score: 9), previous: previous)
        #expect(tuned.pendingQuestion(for: tile.id)?.opponent.id == RateFixture.id(4))
    }

    @Test func undoReturnsToWhereTheActionWasMade() {
        let tile = RateFixture.tile(1)
        let rated = picked([1, 2]).startingToRate().recording(RateFixture.log(1, opponent: 4), for: tile)
        guard case .compare(let question) = rated.advancing().step else { Issue.record("Expected a question"); return }
        let answered = rated.advancing().recording(RateFixture.answer(id: 5, score: 8.9), for: question).afterAnswer()
        #expect(answered.current?.id == RateFixture.id(2))

        guard let compared = answered.lastUndo else { Issue.record("Expected an undo entry"); return }
        let backToQuestion = answered.undoing(compared, score: 8.5)
        #expect(backToQuestion.step == .compare(question))
        #expect(backToQuestion.rated[tile.id]?.score == 8.5)
        #expect(backToQuestion.rated[tile.id]?.asked == 0)

        guard let ratedEntry = backToQuestion.lastUndo else { Issue.record("Expected an undo entry"); return }
        let unrated = backToQuestion.undoing(ratedEntry)
        #expect(unrated.step == .rate)
        #expect(unrated.current?.id == RateFixture.id(1))
        #expect(unrated.rated.isEmpty)
        #expect(unrated.progress.rated == 0)
    }

    @Test func undoStackIsCapped() {
        var flow = picked([])
        for n in 1...25 { flow = flow.markingSkipped(RateFixture.id(n)) }
        #expect(flow.undoStack.count == RateFlow.undoLimit)
        #expect(flow.lastUndo == .skipped(placeId: RateFixture.id(25)))
    }

    @Test func rateMoreDropsRatedPlacesFromTheGrid() {
        let tile = RateFixture.tile(1)
        let flow = picked([1]).startingToRate().recording(RateFixture.log(1), for: tile).movingOn()
        #expect(flow.step == .finish)
        let more = flow.pickingMore()
        #expect(more.step == .pick)
        #expect(more.selected.isEmpty)
        #expect(!more.visibleTiles.contains { $0.id == tile.id })
    }
}
