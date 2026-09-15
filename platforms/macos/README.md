# Native macOS host

This small Swift app uses the system WebKit engine, serves bundled assets only
on an ephemeral loopback port, and presents native open/save dialogs. Saved
farms persist through UserDefaults independently of the loopback port.

From the repository root on a Mac with Xcode command line tools:

```sh
npm ci
npm run build
npm run build:macos
```

Output: `dist/SimFarm-V0-macOS-universal.zip` with an Intel/Apple Silicon app for
macOS 13 or newer. The build is ad-hoc signed and is not Apple notarized.

The build output also reports the staged app path. Run its executable with
`--self-test` to exercise bundled asset loading, starting a farm, save export /
import, and persistent-save restoration after reloading WebKit:

```sh
mkdir -p /tmp/simfarm-mac-test
SF_APP_TEST_DIR=/tmp/simfarm-mac-test "/path/to/SimFarm V0.app/Contents/MacOS/SimFarm" --self-test
cat /tmp/simfarm-mac-test/result.json
```

This writes `result.json`, `game.png`, and `TEST.SFM` to the chosen directory.
The test uses an isolated UserDefaults domain and removes it when complete.
