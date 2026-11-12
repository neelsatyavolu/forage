import SwiftUI

/// The Account tab (the web's `AccountPanel`). Signed out: create an account, sign in, a reset
/// link, and Connect AI (which works on this device alone). Signed in: one section per concern.
struct AccountRootView: View {
    @Environment(AppState.self) private var app
    @State private var localSheet: AccountLocalSheet?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xxxl) {
                    ScreenHeader(title: "Account")
                    content
                    AccountAppearanceSection()
                    #if DEBUG
                    AccountDeveloperSection()
                    #endif
                }
                .padding(.horizontal, Spacing.gutter)
                .padding(.top, Spacing.xl)
                .padding(.bottom, Spacing.xxxl)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .canvasBackground()
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await app.bootstrap() }
        }
        .sheet(item: $localSheet) { sheet in
            sheetContent(sheet).presentationBackground(Color.card)
        }
    }

    @ViewBuilder private var content: some View {
        switch app.session {
        case .checking:
            LoadingRows(count: 2)
        case .signedOut:
            AccountSignedOutView(open: { localSheet = $0 })
        case .signedIn(let user) where user.guest:
            AccountGuestView()
        case .signedIn(let user):
            AccountSignedInView(user: user, open: { localSheet = $0 })
        }
    }

    @ViewBuilder private func sheetContent(_ sheet: AccountLocalSheet) -> some View {
        switch sheet {
        case .forgot: SignInSheet(startMode: .forgot, email: app.account?.email ?? "")
        case .reset: SignInSheet(startMode: .reset)
        case .deleteAccount: DeleteAccountSheet()
        }
    }
}

/// Sheets the Account tab presents itself (RootView's `AppSheet` covers sign in and Connect AI).
enum AccountLocalSheet: String, Identifiable {
    case forgot, reset, deleteAccount
    var id: String { rawValue }
}

/// Signed out: why to make an account, Create account / Sign in, the reset link, AI.
private struct AccountSignedOutView: View {
    let open: (AccountLocalSheet) -> Void
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxxl) {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                Text("An account keeps your visits, lists and taste profile, on any device.")
                    .textStyle(.lede).foregroundStyle(Color.bodyText)
                VStack(spacing: Spacing.sm) {
                    Button("Create account") { app.present(.register) }.buttonStyle(.forage(.primary, fullWidth: true))
                    Button("Sign in") { app.present(.signIn) }.buttonStyle(.forage(.ghost, fullWidth: true))
                }
            }
            .rise()
            SectionRule(label: "Password") {
                LinkRow(title: "Have a reset link?", detail: "Paste the link from the email to choose a new password.") {
                    open(.reset)
                }
            }
            AccountAISection()
        }
    }
}

/// A guest (rated before making an account): save these places with an account, or sign in to
/// add them to an existing one. Both keep everything rated.
private struct AccountGuestView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxxl) {
            SavePanel(compact: false, onNotNow: nil).rise()
            AccountAISection()
        }
    }
}

/// Signed in: who, AI, sessions, delete.
private struct AccountSignedInView: View {
    let user: AccountUser
    let open: (AccountLocalSheet) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxxl) {
            SectionRule(label: "Signed in", meta: user.createdAt.map { "Joined \(DateText.isoDay($0))" }) {
                Text(user.email ?? "").textStyle(.body).foregroundStyle(Color.ink)
                    .textSelection(.enabled)
            }
            .rise()
            AccountAISection()
            LodestarAccountSection()
            AccountSessionSection(open: open)
            SectionRule(label: "Delete account") {
                LinkRow(title: "Delete my account",
                        detail: "Deletes your account, visits, lists, taste profile, AI connections and Lodestar link.",
                        destructive: true) { open(.deleteAccount) }
            }
        }
    }
}
