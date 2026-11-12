import SwiftUI

/// Account > Lodestar: link this account to a Lodestar account (separate logins) so Explore can
/// read trips and add meals to them. Mounted in `AccountSignedInView`.
struct LodestarAccountSection: View {
    @Environment(AppState.self) private var app
    @State private var model: LodestarSectionModel?
    /// True once a status check has finished, so a failed check offers Retry instead of "Checking".
    @State private var checked = false

    var body: some View {
        SectionRule(label: "Lodestar", meta: meta) {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                Text("Connect your Lodestar account to explore around your trips and add restaurants to a trip day. Your liked cuisines, dietary needs and dining budget come over too, without changing what your own visits say. Your Forage and Lodestar sign-ins stay separate.")
                    .textStyle(.body).foregroundStyle(Color.bodyText)
                if let model { LodestarSectionRows(model: model, checked: checked, recheck: recheck) }
            }
        }
        .task {
            if model == nil { model = LodestarSectionModel(app: app) }
            await recheck()
        }
    }

    private func recheck() async {
        checked = false
        await app.refreshLodestar()
        checked = true
    }

    private var meta: String? {
        if case .linked(_, let connectedAt)? = app.lodestar { return "Connected \(DateText.isoDay(connectedAt))" }
        return nil
    }
}

private struct LodestarSectionRows: View {
    @Bindable var model: LodestarSectionModel
    let checked: Bool
    let recheck: () async -> Void
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            VStack(spacing: 0) {
                Hairline()
                statusRow
                Hairline()
                if app.lodestar?.isLinked == true {
                    importRow
                    Hairline()
                }
            }
            if app.lodestar?.isLinked == true {
                Text("Disconnecting removes the link here. To end it on Lodestar's side too, remove Forage in Lodestar's settings.")
                    .textStyle(.caption).foregroundStyle(Color.mute)
            }
            if let message = model.message {
                Text(message.text).textStyle(.label).foregroundStyle(message.isError ? Color.danger : Color.ok)
            }
        }
        .sheet(item: $model.webConnect) { connect in
            LodestarWebConnectSheet(start: connect.url, base: app.api.baseURL, cookies: flowCookies) { outcome in
                Task { await model.finishWeb(outcome) }
            }
            .presentationBackground(Color.card)
            .interactiveDismissDisabled()
        }
    }

    /// The app's cookies the callback needs (`fg_session` and `fg_lodestar_flow`).
    private var flowCookies: [HTTPCookie] {
        let target = app.api.baseURL.appending(path: LodestarConnectLogic.callbackPath)
        return app.api.cookies.cookies(for: target) ?? []
    }

    private var statusRow: some View {
        HStack(spacing: Spacing.lg) {
            Text(title).textStyle(.button).foregroundStyle(Color.ink)
            Spacer()
            switch app.lodestar {
            case nil where checked:
                Button("Couldn't check. Retry") { Task { await recheck() } }
                    .buttonStyle(.forage(.quiet))
            case nil:
                Text("Checking").textStyle(.label).foregroundStyle(Color.mute)
            case .linked?:
                Button("Disconnect") { Task { await model.disconnect() } }
                    .buttonStyle(.forage(.quiet))
                    .disabled(model.busy)
            case .unlinked?:
                Button("Connect Lodestar") { Task { await model.connect() } }
                    .buttonStyle(.forage(.ghost, small: true, isLoading: model.busy))
                    .disabled(model.busy)
            }
        }
        .frame(minHeight: 48)
    }

    private var title: String {
        if case .linked(let label, _)? = app.lodestar { return label ?? "Lodestar" }
        return "Lodestar Trips"
    }

    private var importRow: some View {
        HStack(spacing: Spacing.lg) {
            Text("Dining preferences").textStyle(.bodySmall).foregroundStyle(Color.ink)
            Spacer()
            Button("Import from Lodestar") { Task { await model.importPreferences() } }
                .buttonStyle(.forage(.ghost, small: true, isLoading: model.busy))
                .disabled(model.busy)
        }
        .frame(minHeight: 48)
    }
}
