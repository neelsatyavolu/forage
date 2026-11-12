import SwiftUI

/// ChatGPT and Grok, each with Connect or Disconnect (the web's `AiSection`).
struct AccountAISection: View {
    @Environment(AppState.self) private var app
    @State private var disconnecting: AIProvider?

    var body: some View {
        SectionRule(label: "AI", meta: "\(app.aiStatus.connectedCount) of 2 connected") {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                Text(Self.intro(signedIn: app.isSignedIn)).textStyle(.body).foregroundStyle(Color.bodyText)
                VStack(spacing: 0) {
                    Hairline()
                    ForEach([AIProvider.codex, .grok], id: \.self) { provider in
                        row(provider)
                        Hairline()
                    }
                }
            }
        }
    }

    nonisolated static func intro(signedIn: Bool) -> String {
        let lead = "Reasons for each pick, Ask, and the reranking use your own ChatGPT or Grok subscription. "
        return lead + (signedIn
            ? "The sign-in is encrypted and saved to your account."
            : "The sign-in is encrypted and kept only on this device. Sign in to save it to your account.")
    }

    private func row(_ provider: AIProvider) -> some View {
        let connected = app.aiStatus.isConnected(provider)
        return HStack(spacing: Spacing.lg) {
            Text(provider.displayName).textStyle(.button).foregroundStyle(Color.ink)
            Spacer()
            Text(connected ? "Connected" : "Not connected").textStyle(.label).foregroundStyle(Color.mute)
            if connected {
                Button("Disconnect") {
                    Task {
                        disconnecting = provider
                        await app.disconnectAI(provider)
                        disconnecting = nil
                    }
                }
                .buttonStyle(.forage(.quiet, isLoading: disconnecting == provider))
                .disabled(disconnecting != nil)
            } else {
                Button("Connect") { app.present(.connectAI(provider)) }.buttonStyle(.forage(.link))
            }
        }
        .frame(minHeight: 48)
        .accessibilityElement(children: .contain)
    }
}

/// Sign out, sign out everywhere else, change password (the web's `SessionSection`).
struct AccountSessionSection: View {
    let open: (AccountLocalSheet) -> Void
    @Environment(AppState.self) private var app
    @State private var everywhere = SignOutEverywhereModel()
    @State private var confirmEverywhere = false
    @State private var signingOut = false

    var body: some View {
        SectionRule(label: "Sessions") {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack(spacing: Spacing.sm) {
                    Button("Sign out") {
                        signingOut = true
                        Task {
                            await app.signOut()
                            signingOut = false
                        }
                    }
                    .buttonStyle(.forage(.ghost, isLoading: signingOut))
                    .disabled(signingOut)
                    Button("Sign out everywhere else") { confirmEverywhere = true }
                        .buttonStyle(.forage(.quiet, isLoading: everywhere.isBusy))
                        .disabled(everywhere.isBusy)
                }
                if let notice = everywhere.notice { InlineNotice(message: notice) }
                if let error = everywhere.error { InlineError(message: error) }
                VStack(spacing: 0) {
                    Hairline()
                    LinkRow(title: "Change password", detail: "We email you a reset link.") { open(.forgot) }
                    Hairline()
                }
            }
        }
        .confirmationDialog("Sign out everywhere else?", isPresented: $confirmEverywhere, titleVisibility: .visible) {
            Button("Sign out other devices", role: .destructive) {
                Task { await everywhere.run(using: { try await app.signOutEverywhereElse() }, report: { app.handle($0) }) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You stay signed in on this device.")
        }
    }
}

/// System / Light / Dark, stored on this device (the web's theme toggle).
struct AccountAppearanceSection: View {
    @AppStorage(ThemePreference.storageKey) private var theme: ThemePreference = .system

    var body: some View {
        SectionRule(label: "Appearance", meta: "On this device") {
            SegmentedChoice(options: ThemePreference.allCases, selection: $theme, title: \.label)
        }
    }
}

#if DEBUG
/// Debug builds only: which server the app talks to. Takes effect on the next launch.
struct AccountDeveloperSection: View {
    @Environment(AppState.self) private var app
    @AppStorage(APIConfig.overrideKey) private var override = ""

    var body: some View {
        SectionRule(label: "Developer", meta: app.api.baseURL.absoluteString) {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack(spacing: Spacing.sm) {
                    Button("Use localhost:3000") { override = APIConfig.localBaseURL.absoluteString }
                        .buttonStyle(.forage(.ghost, small: true))
                    Button("Use production") { override = "" }
                        .buttonStyle(.forage(.ghost, small: true))
                }
                if pending {
                    Text("Quit and reopen Forage to switch servers.").textStyle(.label).foregroundStyle(Color.mute)
                }
            }
        }
    }

    private var pending: Bool {
        (APIConfig.validURL(override) ?? APIConfig.bundledBaseURL()) != app.api.baseURL
    }
}
#endif
