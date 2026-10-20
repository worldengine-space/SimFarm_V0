# Active Goal Checkpoint

Updated 2026-10-19 after push and PR/CI verification. Resume the SimFarm mission
from this worktree; preserve all edits and keep the pull request unmerged.

## Git state and preservation

- Repository: `/workspaces/SimFarm_V0`; branch:
  `codex/simfarm-improvements`.
- Branch: `codex/simfarm-improvements`, pushed to `origin`; this checkpoint
  checkpoint update is committed and pushed. Implementation/tests: `f7f62eb`
  (`Add zoom, crop insurance, and conservation mechanics`); documentation:
  `f465f12` (`Document REA findings and save extension behavior`); CI
  checkpoint: `bc62453`; prior checkpoint: `3f3833a`. Upstream `main` is
  `3fec6a6`.
- PR #1 is open at https://github.com/worldengine-space/SimFarm_V0/pull/1,
  base `main`, head matched the feature branch at `3f3833a` when last checked;
  its title and body include scope, commits, validation, and the CI blocker. At
  both code-bearing PR head `f465f12` and checkpoint head `3f3833a`, Check,
  Windows, iOS, and Android all concluded `action_required` with zero jobs. The
  latest observed run IDs were 39196966809 (Check), 39196966801 (Windows),
  39196966851 (iOS), and 39196966802 (Android). This is an approval gate, not a
  test failure; the workflow approval endpoint returned HTTP 403 `Resource not
  accessible by integration`. PR remains open and unmerged; merge state was
  `UNSTABLE`.
- The only remaining worktree change is the unrelated Android test edit. It stays
  unstaged and excluded; mission changes are committed and pushed.
- Preserve and exclude `platforms/android/app/src/androidTest/java/space/worldengine/simfarm/LaunchSmokeTest.java`
  from commits. Its existing unrelated change adds a `∏` character after the
  Activity import. No other unrelated edits have been identified.
- No applicable `AGENTS.md` was found. `game.js` is generated from the ordered
  source sections.

## Completed work and findings

- Existing source, tests, platform setup, workflows, and history were reviewed.
  A clean extraction of pre-change HEAD passed its original nine-suite
  `npm test` baseline.
- Research is documented in `docs/TECHNICAL-WHITEPAPER.md`: Internet Archive
  metadata and the 1993 German handbook/quick-start card; a separate 2014 C#
  classroom project (not reused); USDA FSA CRP material used only for broad
  context; and REA/Ghidra methods, provenance, findings, confidence, and limits.
- REA `rea-agents@6.7.0` and Ghidra 12.1.4 ran from `/tmp`. The verified DOS MZ
  x86 artifact was statically analyzed and never executed or committed. The
  analysis established startup/format observations, not gameplay algorithms;
  the unexplained appended bytes and automated decompilation limits are
  documented. Ghidra/JDK/provider checks passed; unrelated REA integrations
  caused the overall doctor status to remain false.
- Corrected stored-crop sale accounting so cash, crop-sales, and taxable-sales
  deltas agree; regression assertions cover the transaction.
- Added five-level camera zoom (50%, 75%, 100%, 150%, 200%) as a usability
  improvement, not a historical claim. Wheel, `+`/`-`, and View menu controls
  share render/hit-test transforms, pointer anchoring, and map clamps. The Map
  overview frame, event sprites, and viewport clipping adapt to zoom.
- Added optional fictional crop insurance with captured price, 5% premium,
  20% deductible, 50% expected-value cap, one settlement at harvest/flood, and
  cancellation on other field-removal paths.
- Added optional fictional conservation contracts on one owned vacant 8×8
  parcel: three annual $100 payments, three-year term, land-use restrictions,
  withdrawal, and visible green map tint. Imported contracts are validated
  against ownership, vacancy, and save year.
- Added versioned `.SFMX` persistence for the optional mechanics while native
  `.SFM`/`.SSM` behavior receives safe defaults. Browser, Android, and iOS file
  paths were updated; iOS native compilation remains unverified here.
- README, platform notes, whitepaper, test instructions, and this checkpoint
  describe features, compatibility, historical uncertainties, and limitations.

## Validation

After the latest code changes, these commands passed on 2026-10-19:

- `npm run build`
- `npm test` — all 10 suites passed. Coverage includes eight native fixtures,
  accounting, insurance and contract edges, zoom anchoring/bounds/repeated
  cycles/CSS resizing, and a real Canvas2D pixel-level conservation tint check.
- `npm run format:check`
- `npm run build:web` — generated the 425-file, 56.7 MiB offline package.
- `git diff --check`

The web build and Node/Canvas harness ran, but no local Chromium/Firefox or
Playwright/Puppeteer is installed; interactive browser/device testing was not
performed. Android SDK is not configured. Swift, Xcode, and XcodeGen are
unavailable, so iOS native compilation needs CI or macOS. Java and Gradle are
present. GitHub Actions created pull-request runs, but all four were blocked
before job creation by `action_required`; details are recorded above. Local
validation passes independently.

## Remaining lifecycle

1. All independent implementation, research, test, documentation, review, commit,
   push, and PR-update work is complete. The external completion gate is a
   repository maintainer approving the four GitHub Actions workflows; this
   integration cannot do so (403). Do not message maintainers.
2. Leave PR #1 open and unmerged. Re-run its workflows after the repository
   approval becomes available, then verify the final check results. Additional
   historical save fixtures and interactive desktop/touch play are documented as
   useful follow-up validation beyond the eight included fixtures and current
   headless evidence.
