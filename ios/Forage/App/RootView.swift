import SwiftUI

/// The tab bar plus the app-wide sheets. Each tab's root view lives in Features/<Name>/ and is
/// owned by that feature; keep the type names below stable.
struct RootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.selectedTab) {
            Tab("Near me", systemImage: "location", value: AppTab.near) {
                NearRootView()
            }
            Tab("Explore", systemImage: "map", value: AppTab.explore) {
                ExploreRootView()
            }
            Tab("Lists", systemImage: "list.bullet", value: AppTab.lists) {
                ListsRootView()
            }
            Tab("Ask", systemImage: "text.bubble", value: AppTab.ask) {
                AskRootView()
            }
            Tab("Account", systemImage: "person", value: AppTab.account) {
                AccountRootView()
            }
        }
        .tint(Color.accent)
        .canvasBackground()
        .sheet(item: $app.sheet) { sheet in
            sheetContent(sheet)
                .presentationBackground(Color.card)
        }
        .onOpenURL { app.open($0) }
    }

    @ViewBuilder private func sheetContent(_ sheet: AppSheet) -> some View {
        switch sheet {
        case .signIn: SignInSheet(startMode: .signIn)
        case .register: SignInSheet(startMode: .register)
        case .resetPassword(let link): SignInSheet(startMode: .reset, resetLink: link)
        case .connectAI(let provider): AIConnectSheet(provider: provider)
        case .place(let id): PlaceDetailView(placeId: id)
        case .logVisit(let placeId): LogVisitSheet(placeId: placeId)
        case .web(let url): SafariView(url: url).ignoresSafeArea()
        }
    }
}
