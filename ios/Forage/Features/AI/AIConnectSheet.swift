import SwiftUI
import UIKit

/// "Connect an AI account": ChatGPT or Grok sign-in, presented by RootView for `.connectAI`.
/// Step 1 opens the provider's sign-in in a secure sheet (finished by the loopback listener),
/// or in Safari as the fallback; step 2 takes the pasted address or code. Same flow as Lodestar.
struct AIConnectSheet: View {
    /// The provider to start on; nil picks the one that isn't connected yet.
    var provider: AIProvider?
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model: AIConnectModel?
    @State private var browser = AISignInBrowser()

    var body: some View {
        NavigationStack {
            ScrollView {
                if let model {
                    AIConnectContent(model: model, browser: browser, isSignedIn: app.isSignedIn, onConnected: connected)
                        .padding(Sizes.sheetPadding)
                }
            }
            .background(Color.card)
            .navigationTitle("Connect an AI account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.buttonStyle(.forage(.quiet))
                }
            }
        }
        .onAppear {
            if model == nil {
                let created = AIConnectModel(api: app.api)
                created.select(provider ?? Self.firstChoice(app.aiStatus))
                model = created
            }
        }
        .onDisappear { browser.close() }
    }

    /// Grok when only ChatGPT is connected, otherwise ChatGPT.
    nonisolated static func firstChoice(_ status: AIStatus) -> AIProvider {
        status.connected.codex && !status.connected.grok ? .grok : .codex
    }

    private func connected() {
        browser.close()
        Task {
            await app.refreshAIStatus()
            dismiss()
        }
    }
}

private struct AIConnectContent: View {
    @Bindable var model: AIConnectModel
    let browser: AISignInBrowser
    let isSignedIn: Bool
    let onConnected: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xl) {
            Text(AIConnectLogic.intro(signedIn: isSignedIn)).textStyle(.bodySmall).foregroundStyle(Color.bodyText)
            SegmentedChoice(options: [AIProvider.codex, .grok], selection: providerBinding, title: \.displayName)
            step(1, enabled: true) { stepOne }
            step(2, enabled: model.hasStarted) { stepTwo }
            if let error = model.error { InlineError(message: error) }
            Button(model.isConnecting ? "Connecting…" : "Connect") { connect(nil) }
                .buttonStyle(.forage(.primary, fullWidth: true, isLoading: model.isConnecting))
                .disabled(!model.canConnect)
        }
    }

    private var providerBinding: Binding<AIProvider> {
        Binding(get: { model.provider }, set: { next in
            browser.close()
            model.select(next)
        })
    }

    private var stepOne: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(AIConnectLogic.howTo(model.provider)).textStyle(.bodySmall).foregroundStyle(Color.bodyText)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Spacing.md) { signInButtons }
                VStack(alignment: .leading, spacing: Spacing.sm) { signInButtons }
            }
        }
    }

    @ViewBuilder private var signInButtons: some View {
        Button { Task { await openSheet() } } label: {
            Label("Open \(model.provider.displayName) sign-in", systemImage: "arrow.up.right")
        }
        .buttonStyle(.forage(.ghost, small: true, isLoading: model.isStarting))
        .disabled(model.isStarting)
        Button("Open in Safari") { Task { await openSafari() } }
            .buttonStyle(.forage(.link))
            .disabled(model.isStarting)
    }

    private var stepTwo: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(AIConnectLogic.pasteLabel(model.provider)).textStyle(.bodySmall).foregroundStyle(Color.bodyText)
            ForageField(label: "", text: $model.pasted, placeholder: AIConnectLogic.pastePlaceholder(model.provider),
                        mono: true, keyboard: .URL, autocapitalization: .never, submitLabel: .go) { connect(nil) }
                .disabled(!model.hasStarted)
            if UIPasteboard.general.hasStrings || UIPasteboard.general.hasURLs {
                PasteButton(payloadType: String.self) { strings in
                    if let first = strings.first { Task { @MainActor in model.pasted = first } }
                }
                .buttonBorderShape(.roundedRectangle(radius: Radius.sm))
                .tint(Color.hoverFill)
                .disabled(!model.hasStarted)
            }
        }
    }

    private func step<Content: View>(_ number: Int, enabled: Bool, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            Text("\(number)")
                .textStyle(.label).foregroundStyle(Color.mute)
                .frame(width: 20, height: 20)
                .overlay(Circle().strokeBorder(Color.hairlineStrong, lineWidth: Sizes.hairline))
                .accessibilityHidden(true)
            content()
        }
        .opacity(enabled ? 1 : 0.5)
    }

    private func openSheet() async {
        guard let url = await model.begin() else { return }
        let provider = model.provider
        browser.present(url, provider: provider) { outcome in
            switch outcome {
            case .callback(let callback): connect(callback)
            case .refused: model.refused()
            case .ignore: break
            }
        }
    }

    private func openSafari() async {
        browser.close()
        guard let url = await model.begin() else { return }
        openURL(url)
    }

    private func connect(_ callback: String?) {
        Task {
            if await model.finish(callback: callback) { onConnected() }
        }
    }
}
