import Foundation
import Testing
@testable import Forage

@Suite("Location fix timing")
struct LocationServiceTests {
    private let point = LatLng(lat: 37.44, lng: -122.16)

    @Test func slowPermissionAnswerIsNotATimeout() async {
        let (events, emit) = AsyncStream<LocationService.FixEvent>.makeStream()
        let (decided, decide) = AsyncStream<Void>.makeStream()
        emit.yield(.waiting)
        let point = point
        Task {
            // The user takes far longer than the timeout to answer the prompt.
            try? await Task.sleep(for: .milliseconds(300))
            decide.yield()
            emit.yield(.located(point))
        }
        let fix = await LocationService.firstFix(events: events, decided: decided, timeout: .milliseconds(50))
        #expect(fix == point)
    }

    @Test func timesOutOnceDecidedWithNoFix() async {
        let (events, emit) = AsyncStream<LocationService.FixEvent>.makeStream()
        let (decided, decide) = AsyncStream<Void>.makeStream()
        emit.yield(.waiting)
        decide.yield()
        let clock = ContinuousClock()
        let start = clock.now
        let fix = await LocationService.firstFix(events: events, decided: decided, timeout: .milliseconds(50))
        #expect(fix == nil)
        #expect(clock.now - start < .seconds(5))
        emit.finish()
    }

    @Test func denialReturnsNil() async {
        let (events, emit) = AsyncStream<LocationService.FixEvent>.makeStream()
        let (decided, _) = AsyncStream<Void>.makeStream()
        emit.yield(.denied)
        let fix = await LocationService.firstFix(events: events, decided: decided, timeout: .seconds(60))
        #expect(fix == nil)
    }
}
