import Foundation
@testable import Forage

/// Deck places, visits and answers shaped like the server's (docs/api.md §5, §5A).
enum RateFixture {
    static func id(_ n: Int) -> String { String(format: "00000000-0000-4000-8000-%012d", n) }

    static func placeJSON(_ n: Int, name: String? = nil, tags: String = #"{"attributes":["restaurant"]}"#) -> String {
        Fixture.place(id: id(n), name: name ?? "Place \(n)", priceLevel: "2", tags: tags)
    }

    static func place(_ n: Int, name: String? = nil) -> Place {
        try! JSONDecoder().decode(Place.self, from: Data(placeJSON(n, name: name).utf8))
    }

    static func tileJSON(_ n: Int, occasion: String = "casual") -> String {
        #"{"place":\#(placeJSON(n)),"distanceKm":0.29,"guessedOccasion":"\#(occasion)","kind":"Sushi"}"#
    }

    static func tile(_ n: Int) -> DeckPlace {
        try! JSONDecoder().decode(DeckPlace.self, from: Data(tileJSON(n).utf8))
    }

    static func deck(_ numbers: [Int], hasMore: Bool = true, rated: Int = 0) -> DeckResponse {
        let json = """
        {"places":[\(numbers.map { tileJSON($0) }.joined(separator: ","))],"hasMore":\(hasMore),"source":"cache",
         "progress":{"rated":\(rated),"firstPicksAt":5,"goal":10}}
        """
        return try! JSONDecoder().decode(DeckResponse.self, from: Data(json.utf8))
    }

    static func visitJSON(_ n: Int, reaction: Reaction = .loved, occasion: Occasion = .casual, rating: Int? = nil) -> String {
        """
        {"id":"\(id(1000 + n))","userId":"u1","placeId":"\(id(n))","visitedOn":"2026-11-11","reaction":"\(reaction.rawValue)",
         "occasion":"\(occasion.rawValue)","rating":\(rating.map(String.init) ?? "null"),"dated":false,"dishes":[],"note":null,
         "createdAt":1762800000000}
        """
    }

    static func log(_ n: Int, reaction: Reaction = .loved, rating: Int? = nil, score: Double = 8.5,
                    opponent: Int? = nil) -> LogResponse {
        let json = """
        {"visit":\(visitJSON(n, reaction: reaction, rating: rating)),"score":\(score),
         "opponent":\(opponent.map { placeJSON($0) } ?? "null"),"asked":0}
        """
        return try! JSONDecoder().decode(LogResponse.self, from: Data(json.utf8))
    }

    static func edited(_ n: Int, reaction: Reaction, occasion: Occasion = .casual, rating: Int?, score: Double) -> VisitResponse {
        let json = #"{"visit":\#(visitJSON(n, reaction: reaction, occasion: occasion, rating: rating)),"score":\#(score)}"#
        return try! JSONDecoder().decode(VisitResponse.self, from: Data(json.utf8))
    }

    static func answer(id: Int, score: Double, opponent: Int? = nil, asked: Int = 1) -> CompareAnswer {
        let json = """
        {"id":\(id),"score":\(score),"subjectScore":\(score),"opponent":\(opponent.map { placeJSON($0) } ?? "null"),"asked":\(asked)}
        """
        return try! JSONDecoder().decode(CompareAnswer.self, from: Data(json.utf8))
    }
}

/// A scripted server for `RateModel`: records each call and answers from the closures set.
@MainActor
final class FakeRateServer {
    var calls: [String] = []
    var deckPage = RateFixture.deck([1, 2, 3])
    var logReply: (VisitInput) -> LogResponse = { RateFixture.log(Int($0.placeId.suffix(4)) ?? 0) }
    var editReply: (String, VisitPatch) -> VisitResponse = { _, _ in RateFixture.edited(1, reaction: .loved, rating: 9, score: 9) }
    var answerReply: (ComparisonRequest) -> CompareAnswer = { _ in RateFixture.answer(id: 7, score: 8.7) }
    var nextReply = CompareStep(score: 6, opponent: nil, asked: 0)
    var failNext: APIError?
    var sessions = 0
    var guest = true
    var progress: [RateProgress] = []

    private func record(_ call: String) throws {
        calls.append(call)
        if let failure = failNext {
            failNext = nil
            throw failure
        }
    }

    func service() -> RateService {
        RateService(
            deck: { request in try await MainActor.run { try self.record("deck \(request.exclude.count)"); return self.deckPage } },
            search: { query, _ in try await MainActor.run { try self.record("search \(query)"); return [RateFixture.place(9, name: "Found")] } },
            log: { input in try await MainActor.run { try self.record("log \(input.reaction.rawValue) \(input.rating.map(String.init) ?? "-")"); return self.logReply(input) } },
            edit: { id, patch in try await MainActor.run { try self.record("edit"); return self.editReply(id, patch) } },
            deleteVisit: { _ in try await MainActor.run { try self.record("deleteVisit") } },
            answer: { request in try await MainActor.run { try self.record("answer"); return self.answerReply(request) } },
            nextQuestion: { _, _, asked in try await MainActor.run { try self.record("next \(asked)"); return self.nextReply } },
            deleteAnswer: { id, _ in try await MainActor.run { try self.record("deleteAnswer \(id)"); return 8.5 } },
            want: { _ in try await MainActor.run { try self.record("want") } },
            unwant: { _ in try await MainActor.run { try self.record("unwant") } },
            skip: { _ in try await MainActor.run { try self.record("skip") } },
            unskip: { _ in try await MainActor.run { try self.record("unskip") } })
    }

    func host() -> RateHost {
        RateHost(ensureSession: { self.sessions += 1 },
                 isGuest: { self.guest },
                 handle: { $0.isCancellation ? nil : $0.userMessage },
                 changed: { self.progress.append($0) })
    }

    func model(access: RateModel.LocationAccess = .granted, fix: LatLng? = LatLng(lat: 37.78, lng: -122.42),
               progress: RateProgress = .zero) -> RateModel {
        RateModel(service: service(), host: host(), progress: progress,
                  locate: { fix }, access: { access }, pause: .zero, searchDelay: .zero)
    }
}
