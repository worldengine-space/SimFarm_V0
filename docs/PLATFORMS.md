# Platform builds

Every platform uses the same JavaScript simulation and starts with the World
Engine splash screen. The original game artwork and controls follow the intro.

## Build commands

Install Node.js 22+ and run `npm ci` at the repository root.

| Target | Command | Additional tools |
| --- | --- | --- |
| Web / installable web app | `npm run build:web` | None |
| Windows x64 | `npm run build:windows` | First run `npm ci --prefix platforms/desktop --ignore-scripts` |
| macOS Intel + Apple Silicon | `npm run build:macos` | macOS with Xcode command line tools |
| Android | `npm run build:android` | JDK and Android SDK; see Android guide |
| iOS Simulator | `npm run build:ios -- simulator` | Full Xcode and XcodeGen |
| iOS device, unsigned | `npm run build:ios -- device` | Full Xcode and XcodeGen |

Packages are written to `dist/`. The public source tree contains build scripts;
large downloadable packages are attached to [GitHub releases](https://github.com/worldengine-space/SimFarm_V0/releases).

## Native hosts

- [Windows / Electron](../platforms/desktop/README.md)
- [macOS / WebKit](../platforms/macos/README.md)
- [Android / WebView](../platforms/android/README.md)
- [iOS / WebKit](../platforms/ios/README.md)

Native mobile apps bundle the game for offline use and use the platform file
picker and share/save dialog for `.SFM` farms. Windows uses Chromium file
dialogs; macOS uses native open/save panels.

## iPhone installation

The easiest option is [the web app](https://worldengine-space.github.io/SimFarm_V0/):
open it in Safari, choose Share → Add to Home Screen, and let the first offline
download finish. It includes the same simulation, splash, and touch controls.

The native iOS project is also compiled for iPhone hardware and the iOS
Simulator by GitHub Actions. Unsigned device builds cannot be installed directly
on a normal iPhone. To install a native build, open the project in Xcode and
select your Apple development team; TestFlight/App Store distribution also
requires Apple distribution signing. No Apple signing credentials are included
in this repository.

Developer downloads: [unsigned iPhone app](https://github.com/worldengine-space/SimFarm_V0/releases/latest/download/SimFarm-iOS-device-unsigned.zip)
and [iOS Simulator app](https://github.com/worldengine-space/SimFarm_V0/releases/latest/download/SimFarm-iOS-simulator-unsigned.zip).
