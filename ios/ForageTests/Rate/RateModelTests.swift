import Foundation
import Testing
@testable import Forage

@MainActor
@Suite("Rating flow model against a scripted server")
struct RateModelTests {
    @Test func grantedLocationLoadsTheDeckStraightAway() async {
        let server = FakeRateServer()
        let model = server.model(access: .granted)
        await model.start()
        #expect(model.flow.step == .pick)
        #expect(model.flow.visibleTiles.count == 3)
        #expect(server.calls == ["deck 0"])
        #expect(server.sessions == 0) // looking makes no user
    }

    @Test func notAskedShowsTheReasonFirst() async {
        let server = FakeRateServer()
        let model = server.model(access: .notAsked)
        await model.start()
        #expect(model.flow.step == .locate)
        #expect(!model.showsCitySearch)
        #expect(server.calls.isEmpty)
    }

    @Test func failedFixFallsBackToCitySearch() async {
        let server = FakeRateServer()
        let model = server.model(access: .denied, fix: nil)
        await model.start()
        #expect(model.showsCitySearch)
        await model.useMyLocation()
        #expect(model.flow.step == .locate)
        #expect(model.deckError == NearSpotMessage.denied)
        await model.choose(NearSpot(lat: 37.76, lng: -122.42, label: "Mission District"))
        #expect(model.flow.step == .pick)
    }

    @Test func showMoreExcludesWhatWasShown() async {
        let server = FakeRateServer()
        let model = server.model()
        await model.start()
        server.deckPage = RateFixture.deck([4, 5], hasMore: false)
        await model.loadDeck(more: true)
        #expect(server.calls == ["deck 0", "deck 3"])
        #expect(model.flow.visibleTiles.count == 5)
    }

    @Test func reactionThenQuestionThenFinish() async {
        let server = FakeRateServer()
        server.logReply = { _ in RateFixture.log(1, opponent: 4) }
        let model = server.model()
        await model.start()
        model.toggle(RateFixture.tile(1))
        model.startRating()
        await model.react(.loved)
        #expect(server.sessions == 1)
        #expect(server.calls.last == "log loved -")
        #expect(model.flow.progress.rated == 1)
        #expect(server.progress.last?.rated == 1)

        await model.next()
        guard case .compare(let question) = model.flow.step else { Issue.record("Expected a question"); return }
        await model.pick(question.subject.place, in: question)
        #expect(server.calls.last == "answer")
        #expect(model.flow.step == .finish)
        #expect(model.flow.ratedBestFirst.first?.score == 8.7)
    }

    @Test func aScoreSavesInItsBandAndMovesOn() async {
        let server = FakeRateServer()
        server.logReply = { _ in RateFixture.log(1, reaction: .fine, rating: 6, score: 6) }
        let model = server.model()
        await model.start()
        model.toggle(RateFixture.tile(1))
        model.toggle(RateFixture.tile(2))
        model.startRating()
        await model.score(6)
        #expect(server.calls.last == "log fine 6")
        #expect(model.flow.current?.id == RateFixture.id(2))
    }

    @Test func changingTheReactionPatchesAndClearsTheRating() async {
        let server = FakeRateServer()
        var patches: [VisitPatch] = []
        server.editReply = { _, patch in
            patches.append(patch)
            return RateFixture.edited(1, reaction: .fine, rating: nil, score: 6)
        }
        let model = server.model()
        await model.start()
        model.toggle(RateFixture.tile(1))
        model.startRating()
        await model.react(.loved)
        await model.react(.loved) // same answer: nothing sent
        await model.react(.fine)
        #expect(server.calls.filter { $0 == "edit" }.count == 1)
        #expect(patches.first?.reaction == .fine)
        #expect(patches.first?.rating == .some(nil))
        #expect(model.flow.currentRated?.score == 6)
    }

    @Test func occasionBeforeRatingIsLocalAndIsSent() async {
        let server = FakeRateServer()
        var sent: VisitInput?
        server.logReply = { input in
            sent = input
            return RateFixture.log(1)
        }
        let model = server.model()
        await model.start()
        model.toggle(RateFixture.tile(1))
        model.startRating()
        await model.chooseOccasion(.nightOut)
        #expect(server.calls == ["deck 0"])
        await model.react(.loved)
        #expect(sent?.occasion == .nightOut)
        #expect(sent?.dated == false)
        #expect(sent?.rating == nil)
    }

    @Test func undoDeletesTheVisit() async {
        let server = FakeRateServer()
        let model = server.model()
        await model.start()
        model.toggle(RateFixture.tile(1))
        model.startRating()
        await model.react(.loved)
        await model.undo()
        #expect(server.calls.last == "deleteVisit")
        #expect(model.flow.rated.isEmpty)
        #expect(model.flow.progress.rated == 0)
        #expect(model.flow.step == .rate)
    }

    @Test func undoWantAndNotBeen() async {
        let server = FakeRateServer()
        let model = server.model()
        await model.start()
        await model.want(RateFixture.tile(1))
        await model.skip(RateFixture.tile(2))
        #expect(server.sessions == 2)
        await model.undo()
        await model.undo()
        #expect(Array(server.calls.suffix(4)) == ["want", "skip", "unskip", "unwant"])
        #expect(model.flow.visibleTiles.count == 3)
        #expect(model.flow.wanted.isEmpty)
    }

    @Test func failedWriteShowsTheMessageAndRecordsNothing() async {
        let server = FakeRateServer()
        let model = server.model()
        await model.start()
        server.failNext = .server(status: 429, message: "Too many changes. Wait a few minutes and try again.")
        await model.skip(RateFixture.tile(1))
        #expect(model.error == "Too many changes. Wait a few minutes and try again.")
        #expect(model.flow.skipped.isEmpty)
        #expect(!model.flow.canUndo)
    }

    @Test func savePromptForGuestsFromFiveRated() async {
        let server = FakeRateServer()
        let model = server.model(progress: RateProgress(rated: 5))
        #expect(model.showsSavePrompt)
        model.savePromptHidden = true
        #expect(!model.showsSavePrompt)
        server.guest = false
        #expect(!server.model(progress: RateProgress(rated: 7)).showsSavePrompt)
        server.guest = true
        #expect(!server.model(progress: RateProgress(rated: 4)).showsSavePrompt)
    }

    @Test func searchAddsAPlaceAsBeen() async {
        let server = FakeRateServer()
        let model = server.model()
        await model.start()
        model.search.update("Found")
        await model.search.settle()
        guard case .loaded(let tiles) = model.search.state, let tile = tiles.first else {
            Issue.record("Expected results"); return
        }
        #expect(tile.distanceKm > 0)
        model.addFromSearch(tile)
        #expect(model.flow.selected == [RateFixture.id(9)])
        #expect(model.search.query.isEmpty)
    }
}
