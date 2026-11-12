import SwiftUI

/// What a signed-in-only tab shows when signed out: a serif line and Sign in / Create account.
/// Not an error.
struct SignInPrompt: View {
    let message: String
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Text(message).textStyle(.lede).foregroundStyle(Color.bodyText)
            HStack(spacing: Spacing.sm) {
                Button("Sign in") { app.present(.signIn) }.buttonStyle(.forage(.primary))
                Button("Create account") { app.present(.register) }.buttonStyle(.forage(.ghost))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The standard tab frame: scrolling column with the gutter, the serif header, and either the
/// content (signed in) or a `SignInPrompt` (signed out). Feature tabs wrap their body in this.
struct TabScreen<Content: View>: View {
    let title: String
    var lede: String?
    /// Shown instead of `content` when signed out; nil means the tab works signed out.
    var signedOutMessage: String?
    @ViewBuilder var content: () -> Content
    @Environment(AppState.self) private var app

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xxxl) {
                ScreenHeader(title: title, lede: lede)
                switch app.session {
                case .checking:
                    LoadingRows(count: 3)
                case .signedOut where signedOutMessage != nil:
                    SignInPrompt(message: signedOutMessage ?? "")
                default:
                    content()
                }
            }
            .padding(.horizontal, Spacing.gutter)
            .padding(.top, Spacing.xl)
            .padding(.bottom, Spacing.xxxl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .canvasBackground()
    }
}
