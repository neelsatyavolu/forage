import Foundation
import Observation

/// Both lists, loaded together (the web's `useLists`).
struct ListsData: Sendable {
    let been: [BeenRow]
    let want: [WantEntry]
}

/// Screen state for the Lists tab.
@MainActor
@Observable
final class ListsModel {
    enum Tab: Hashable, Sendable { case been, want }
    enum Display: Hashable, Sendable { case list, map }

    private(set) var state: LoadState<ListsData> = .idle
    /// A failed remove, shown above the list.
    private(set) var actionError: String?
    var tab: Tab = .been
    var display: Display = .list
    /// nil shows every occasion.
    var occasion: Occasion?

    var shownRows: [BeenRow] {
        BeenLists.filter(state.value?.been ?? [], occasion: occasion)
    }

    var pins: [ListPin] {
        tab == .been ? BeenLists.beenPins(shownRows) : BeenLists.wantPins(state.value?.want.map(\.place) ?? [])
    }

    /// `GET /api/visits` and `GET /api/want`. Keeps what is shown while reloading.
    func load(_ app: AppState) async {
        if state.value == nil { state = .loading }
        do {
            async let visits = app.api.send(API.Visits.list)
            async let want = app.api.send(API.Want.list)
            let (been, wanted) = try await (visits, want)
            state = .loaded(ListsData(been: BeenLists.rows(from: been), want: BeenLists.wantEntries(wanted)))
        } catch {
            guard let message = app.handle(error) else { return }
            if state.value == nil { state = .failed(message) } else { actionError = message }
        }
    }

    /// `DELETE /api/want`, then drops the entry locally.
    func removeWant(_ entry: WantEntry, app: AppState) async {
        actionError = nil
        do {
            _ = try await app.api.send(API.Want.remove(placeId: entry.place.id))
            if let data = state.value {
                state = .loaded(ListsData(been: data.been, want: data.want.filter { $0.id != entry.id }))
            }
            app.listsChanged()
        } catch {
            actionError = app.handle(error)
        }
    }
}
