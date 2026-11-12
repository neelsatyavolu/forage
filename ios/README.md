# Forage for iOS

The native SwiftUI app for Forage. It calls the web app's JSON API (`/api/*`) and signs in with the same session cookie. It needs iOS 26 or later, Xcode 27 and XcodeGen, and uses no third-party packages. Maps and location use Apple's MapKit and CoreLocation, so the app adds no running cost.

How the app is built is described in `docs/ARCHITECTURE.md`. The endpoint contracts are in `docs/api.md`.

## Generate the project

`Forage.xcodeproj` is generated from `project.yml` and is not committed.

```bash
cd ios
brew install xcodegen      # once
xcodegen generate
```

Sources are folder globs. After adding or removing files, run `xcodegen generate` again; `project.yml` does not need editing.

## Build and run

Open `Forage.xcodeproj` in Xcode and run the **Forage** scheme. To build from the command line:

```bash
xcodebuild -project Forage.xcodeproj -scheme Forage \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/forage-ios-dd -jobs 4 build
```

To install and launch on a booted simulator:

```bash
xcrun simctl install booted /tmp/forage-ios-dd/Build/Products/Debug-iphonesimulator/Forage.app
xcrun simctl launch booted co.xanom.forage
```

Debug builds accept `-ForageTab near|explore|lists|ask|account`, which opens the app on that tab.

## Test

```bash
xcodebuild -project Forage.xcodeproj -scheme Forage \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/forage-ios-dd -jobs 4 test
```

The tests use Swift Testing and are in `ForageTests/`, one folder per area. None of them call the network: models are decoded from fixtures, and the client is tested against stubbed `URLProtocol` responses.

## Point at a local server

The default server is `https://forage.xanom.co`, set by `ForageBaseURL` in `Info.plist`. To use the dev server (`pnpm dev` in the repo root), launch with an override:

```bash
xcrun simctl launch booted co.xanom.forage -apiBaseURL http://localhost:3000
```

In Xcode, add `-apiBaseURL http://localhost:3000` under Scheme > Run > Arguments. Debug builds also have Account > Developer, with "Use localhost:3000" and "Use production"; the change applies the next time the app opens. The value is stored in the `apiBaseURL` user default. App Transport Security allows plain HTTP to local addresses. On a physical device, use your Mac's LAN address instead of `localhost`.

The app sends no `Origin` header, so the server's same-origin check passes without any backend changes.

## Links into the app

The app handles these links (`App/DeepLink.swift`):

| Link | Opens |
| --- | --- |
| `forage://reset?token=…` | The "choose a new password" form, with the token filled in |
| `https://forage.xanom.co/reset?token=…` | The same, once universal links are set up |

The emailed reset link is an `https` URL, so it opens the app only after universal links are set up. That needs two changes:

1. The web app serves `/.well-known/apple-app-site-association`, listing `/reset` for `VTQW687WBQ.co.xanom.forage`.
2. The app gets the `com.apple.developer.associated-domains` entitlement with `applinks:forage.xanom.co`.

Until then, users paste the link into Account > "Have a reset link?".

## Fonts and icon

Geist and Geist Mono (copied from the Lodestar app) and Newsreader Regular are bundled under the SIL Open Font License; the licences are in `Forage/Resources/Fonts/`. The app icon is a generated placeholder: a Newsreader "f" and one blue dot on the dark canvas.
