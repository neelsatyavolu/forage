import SwiftUI

/// Sign in / Create an account / Reset your password (the web's `AuthForm`), plus `.reset`:
/// set a new password from a pasted reset link (the web's `/reset` page). Presented by RootView
/// for `AppSheet.signIn`, `.register` and `.resetPassword`, and by Account for forgot and reset.
struct SignInSheet: View {
    enum Mode: Sendable { case signIn, register, forgot, reset }

    let startMode: Mode
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model: AccountFormModel

    init(startMode: Mode, email: String = "", resetLink: String = "") {
        self.startMode = startMode
        _model = State(initialValue: AccountFormModel(mode: startMode, email: email, resetLink: resetLink))
    }

    var body: some View {
        AccountSheetScaffold(title: model.title, onClose: { dismiss() }) {
            if model.mode == .reset {
                ResetPasswordForm(model: model, submit: submit, onDone: { dismiss() })
            } else {
                AccountCredentialsForm(model: model, submit: submit)
            }
        }
    }

    private func submit() {
        Task {
            switch await model.submit(AccountActions(app: app)) {
            case .signedIn, .registered: dismiss()
            case .resetDone, .noticeShown, nil: break
            }
        }
    }
}

/// Email and password fields, the error or notice, the primary button and the mode links.
private struct AccountCredentialsForm: View {
    @Bindable var model: AccountFormModel
    let submit: () -> Void
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            if model.mode == .register {
                Text("An account keeps your visits, lists and taste profile, on any device.")
                    .textStyle(.bodySmall).foregroundStyle(Color.bodyText)
            }
            ForageField(label: "Email", text: $model.email, contentType: model.mode == .register ? .emailAddress : .username,
                        keyboard: .emailAddress, autocapitalization: .never,
                        submitLabel: model.mode == .forgot ? .send : .next, onSubmit: emailSubmitted)
                .focused($focus, equals: .email)
            if model.mode != .forgot {
                ForageField(label: "Password", text: $model.password,
                            hint: model.mode == .register ? "At least 8 characters." : nil, secure: true,
                            contentType: model.mode == .register ? .newPassword : .password,
                            autocapitalization: .never, submitLabel: .go, onSubmit: submit)
                    .focused($focus, equals: .password)
            }
            if let error = model.error { InlineError(message: error) }
            if let notice = model.notice { InlineNotice(message: notice) }
            Button(model.primaryTitle, action: submit)
                .buttonStyle(.forage(.primary, fullWidth: true, isLoading: model.isBusy))
                .disabled(model.isBusy)
            links
        }
    }

    private func emailSubmitted() {
        if model.mode == .forgot { submit() } else { focus = .password }
    }

    @ViewBuilder private var links: some View {
        HStack {
            switch model.mode {
            case .signIn:
                Button("Create an account") { model.switchTo(.register) }.buttonStyle(.forage(.link))
                Spacer()
                Button("Forgot password?") { model.switchTo(.forgot) }.buttonStyle(.forage(.quiet))
            case .register:
                Button("Have an account? Sign in") { model.switchTo(.signIn) }.buttonStyle(.forage(.link))
            case .forgot:
                Button("Back to sign in") { model.switchTo(.signIn) }.buttonStyle(.forage(.link))
                Spacer()
                Button("I have a reset link") { model.switchTo(.reset) }.buttonStyle(.forage(.quiet))
            case .reset:
                EmptyView()
            }
        }
    }
}
