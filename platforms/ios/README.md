# SimFarm for iPhone and iPad

This native Swift app runs the bundled game in WKWebView, in landscape. All game assets ship inside the app. Saves use the iOS Files picker and share sheet; browser quick saves persist inside the app's data storage. External website links open in the system browser.

## Compile

Requirements: macOS with full Xcode and its iOS SDK installed, Node.js 22+, and XcodeGen (`brew install xcodegen`). From the repository root:

```sh
npm ci
bash scripts/build-ios.sh simulator
bash scripts/build-ios.sh device
```

The scripts generate `platforms/ios/SimFarm.xcodeproj` from the readable `project.yml`, bundle runtime assets, and compile Release apps into `dist/SimFarm-iOS-{simulator,device}-unsigned.zip`. The **iOS builds** GitHub Actions workflow runs both builds and uploads their ZIP artifacts.

### Run in the iOS Simulator

Unzip the simulator artifact, boot an iPhone simulator in Xcode, then:

```sh
xcrun simctl install booted /path/to/SimFarm.app
xcrun simctl launch booted space.worldengine.simfarm
```

### Install on an iPhone

The device ZIP is an **unsigned compilation artifact**, not an installable IPA. Open the generated Xcode project, select the SimFarm target, choose your Apple development team under **Signing & Capabilities**, connect an iPhone, select it as the destination, and run. Xcode will create the necessary development signature/provisioning when your account permits it.

TestFlight or App Store distribution additionally requires an Apple Developer membership, distribution signing, an app record, and an archive/export through Xcode. Those credentials are intentionally absent from this repository. App Store submission also needs final app icons and distribution metadata.

## Design

- `Sources/BundledWebContent.swift`: serves only files inside the packaged `Web` directory using [WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler).
- `Sources/GameViewController.swift`: embeds the game, handles navigation, and bridges save import/export to [UIDocumentPickerViewController](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller) and the iOS share sheet.
- `scripts/bundle-ios.mjs`: copies the current browser build into the offline app bundle.

Compiling proves source and SDK compatibility. Device gameplay, audio, touch controls, save round-trips, and background/resume behavior still require a signed device or simulator run.
