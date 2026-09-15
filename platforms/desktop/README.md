# Windows desktop host

Download `SimFarm-V0-Windows.exe` and double-click it. This single portable file
contains Electron and every game asset, launches without an installer, and runs
offline on 64-bit Windows 10/11. Saves stay in your normal Windows app-data folder
between launches. The optional ZIP is for manual unpacking.

The game runs under `simfarm://game/`, a stable origin that preserves local saves.
It cannot access Node.js. File input and downloads use native file dialogs;
approved website and social links open in the system browser.

From the repository root:

```sh
npm ci
npm run build
npm ci --prefix platforms/desktop --ignore-scripts
npm run build:windows
```

The build downloads pinned Electron and packaging tools and writes the portable
EXE and optional ZIP into `dist/`. The executable is not publisher signed.

## Runtime smoke test

The Windows GitHub Actions workflow builds and starts the actual portable EXE.
It verifies the splash, farm creation, bundled assets, save-file export/import,
and restoring the saved farm after reloading. It uploads the EXE, ZIP,
screenshots, and JSON test report.

To run the same test locally in PowerShell:

```powershell
.\SimFarm-V0-Windows.exe --self-test --test-output=C:\Temp\simfarm-test
```

The test writes `splash.png`, `game.png`, `TEST.SFM`, and `result.json`, and exits
with a failure code if a check fails. It uses an isolated temporary save profile.
