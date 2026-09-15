# Windows desktop host

The Windows build bundles Electron and every game asset. It runs offline under
`simfarm://game/`, a stable origin that preserves local saves between launches.
The game cannot access Node.js. File input and downloads use Chromium's native
file dialogs; approved website and social links open in the system browser.

From the repository root:

```sh
npm ci
npm run build
npm ci --prefix platforms/desktop --ignore-scripts
npm run build:windows
```

Output: `dist/SimFarm-V0-Windows-x64.zip`. Extract the entire archive and open
`SimFarm.exe`. The package supports 64-bit Windows 10 and 11 and is unsigned.
A macOS/Linux build machine can assemble it, but Windows is required for a full
runtime test. Electron downloads require an internet connection during the build.

## Runtime smoke test

The Windows GitHub Actions workflow builds and launches the packaged executable.
It verifies the splash, farm creation, bundled assets, save-file export/import,
and restoring the saved farm after reloading. It uploads the ZIP, screenshots,
and JSON test report.

To run the same test locally in PowerShell:

```powershell
.\SimFarm.exe --self-test --test-output=C:\Temp\simfarm-test
```

The test writes `splash.png`, `game.png`, `TEST.SFM`, and `result.json`, and exits
with a failure code if a check fails. It uses an isolated temporary save profile.
