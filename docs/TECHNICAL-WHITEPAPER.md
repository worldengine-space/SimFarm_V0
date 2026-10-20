# SimFarm V0: technical and research notes

## Scope and evidence labels

This note records an engineering review of the current browser reconstruction. It
distinguishes four kinds of statements:

- **Source verified** means the behavior is present in the checked-in JavaScript
  and can be exercised by the project's harnesses.
- **Historically documented** means a contemporary SimFarm manual or catalog
  record describes it.
- **Inference** means the conclusion follows from multiple source facts but is
  not directly stated by a historical source.
- **Proposal** means a possible future design, not a feature in this build.

The project is a JavaScript reconstruction of the 1993 Maxis farming game. It
draws the original-style 640 × 480 interface on an HTML Canvas and has no game
server or DOS emulator. It reads and writes native `.SFM` / `.SSM` byte layouts.
The reconstruction is not a claim of complete or pixel-perfect parity.

## Research record

### Internet Archive

Advanced Search for `title:"SimFarm"` returned 22 records. The DOS catalog
entry was verified dynamically as
[`msdos_SimFarm_1993`](https://archive.org/details/msdos_SimFarm_1993). Its
[metadata endpoint](https://archive.org/metadata/msdos_SimFarm_1993) identifies
Maxis Software Inc. as publisher, Leaping Lizard Software, Inc. as developer,
and 1993 as release year. The entry contains a 1,228,388-byte ZIP,
`SimFarm_1993.zip`, plus emulator screenshots and metadata; it is a software
preservation record, not a manual. The ZIP's catalog SHA-1 is
`7cb061401da04759db63fd4c97b7fdef592b7d96`. For the REA analysis below, that
archive was downloaded to `/tmp`, its SHA-1 was checked against the catalog,
and only `SimFarm/SIMFARM.EXE` was extracted. Neither file is in the repository.

The catalog search also found Maxis's German DOS manual and quick-start card:
[`simfarm-handbuch`](https://archive.org/details/simfarm-handbuch) and
[`simfarm-schnellstartkarte`](https://archive.org/details/simfarm-schnellstartkarte).
Their metadata describes 1993 German-language documentation. The handbook's
public OCR was consulted for the map, finance, and futures descriptions. It
describes a Map window with overview and land information, a Balance Sheet
listing crop, machinery, land, futures, and livestock income, and futures as a
way to manage weather risk. The OCR is imperfect; details not legible in it are
not treated as historical fact. The handbook does not establish insurance
coverage rules, and a text search failing to find the word “insurance” is not
proof the feature was absent from every edition.

### Other public implementations

Two public projects were reviewed and their roles are distinct:

- [dkim0419/SimFarm](https://github.com/dkim0419/SimFarm) is a 2014 C#
  classroom project with a separate grid-based application; it is not a
  compatible source for this reconstruction's Canvas implementation.
- [petejkim/simfarm](https://github.com/petejkim/simfarm) is a separate
  TypeScript/React/Vite browser remake. Its README documents touch input,
  terrain pinch and Ctrl+wheel zoom, overview-map centering, and selected
  gameplay corrections. Its [gameplay correction ledger](https://github.com/petejkim/simfarm/blob/main/docs/gameplay-bug-fixes.md)
  and [binary evidence notes](https://github.com/petejkim/simfarm/blob/main/docs/reverse-engineering.md)
  are useful comparative research, especially for crop-income accounting,
  loan arrears, stored-crop behavior, and source-backed reverse-engineering
  practices. Its [license](https://github.com/petejkim/simfarm/blob/main/LICENSE)
  declares CC0 1.0 for the repository's covered work; that does not grant
  rights to original SimFarm assets or third-party materials.

The reference implementation uses a different UI framework, state model, and
save format, so its React components and native checkpoint implementation are
not directly portable to this project's shared-scope JavaScript/Canvas
architecture. The current branch's zoom, stored-crop accounting correction,
and optional SFMX extension were implemented in the target code and tested
there; this review does not claim that their code was copied from Pete Kim's
project. The reference is used as a comparative source for additional audit
candidates and test ideas, not as proof that every behavior matches the
original DOS game. No code or assets were copied from these repositories.

### REA and the original executable

REA was inspected at [morluto/rea](https://github.com/morluto/rea), an MIT-
licensed project. Its pinned npm package, `rea-agents@6.7.0`, and Ghidra were
installed under `/tmp`, outside the worktree. The exercised workflow was REA's
documented Ghidra provider for DOS MZ: it imports an immutable target copy into
an ephemeral project, analyzes it as `x86:LE:16:Real Mode`, and deletes the
project when the CLI request ends. REA's installation and DOS guides specify
Ghidra 12.1.x and a full 64-bit JDK 21 or newer. Ghidra 12.1.4's official
release archive SHA-256 was checked before extraction. `rea doctor
--provider ghidra --json` reported the Ghidra installation, Linux x64 native
decompiler, and JDK as healthy; its overall environment flag remained false
because unrelated Hopper/IDA integrations and agent registrations are not
configured.

Artifact provenance and identity:

- Internet Archive item: [`msdos_SimFarm_1993`](https://archive.org/details/msdos_SimFarm_1993),
  metadata at <https://archive.org/metadata/msdos_SimFarm_1993>.
- Catalog archive: `SimFarm_1993.zip`, 1,228,388 bytes, catalog SHA-1
  `7cb061401da04759db63fd4c97b7fdef592b7d96`; locally verified after download.
- Analyzed file: `SimFarm/SIMFARM.EXE`, 621,735 bytes, SHA-256
  `f497c6ffe5a6b729d3c48c431a1285b1b6c1e890313b9d5081b4f4cba399dd0a`.
- Local analysis copies and JSON outputs were kept in `/tmp/simfarm-research`;
  the proprietary executable was not executed or committed.

REA identified the executable as DOS MZ / x86. `rea inspect` completed Ghidra
auto-analysis and reported 44 memory blocks, 536 procedure records, and 25
Ghidra-defined strings. A literal/regex inventory search for gameplay terms
found no semantic procedure names and only two incidental string matches;
this is limited to Ghidra's defined-string inventory and is not evidence that
the game lacks those mechanics. The entry is at CS:IP `276Eh:076Ch`, represented
by REA as linear address `0x37e4c`. Its Ghidra dossier shows DOS memory/stack
setup and a far transfer to `0x1086e`; that unnamed routine makes DOS interrupt
calls, initializes memory, and calls further unnamed routines. These are
startup observations, not gameplay findings. No crop, weather, price,
insurance, or camera algorithm was confidently attributed to a function.

`rea inspect-native-load-image` returned `verified` with all 354 checks
matched. It measured a 9,728-byte MZ header, 173,406 initialized module bytes,
2,372 relocation records, and 438,601 bytes appended beyond the MZ-declared
module. REA explicitly excludes these appended bytes from initialized MZ
memory; their role and whether the running game loads them as overlays remain
unresolved. Ghidra also emitted 16-bit decompiler and control-flow warnings.
Static inspection does not emulate DOS/BIOS interrupts, self-modifying code,
or runtime overlay loading, and Ghidra's function boundaries and pseudocode
are hypotheses rather than original source. Therefore the REA findings support
format and startup characterization, but they do not establish historical
gameplay semantics or justify a gameplay change. The accounting correction
below remains based on the current reconstruction's transaction flow and
regression test, not on a claim about the original binary.

Reproduction outline (downloads stay outside the repository):

```sh
npm install --prefix /tmp/simfarm-rea --ignore-scripts --no-optional --save-exact rea-agents@6.7.0
export GHIDRA_INSTALL_DIR=/tmp/simfarm-rea-tools/ghidra_12.1.4_PUBLIC
/tmp/simfarm-rea/node_modules/.bin/rea doctor --provider ghidra --json
/tmp/simfarm-rea/node_modules/.bin/rea inspect /path/to/SIMFARM.EXE --provider ghidra --json
/tmp/simfarm-rea/node_modules/.bin/rea inspect-native-load-image /path/to/SIMFARM.EXE --provider ghidra --json
/tmp/simfarm-rea/node_modules/.bin/rea function /path/to/SIMFARM.EXE 0x37e4c --provider ghidra --json
```

Acquire the artifact from its cited Internet Archive record, verify its catalog
hash, and extract only the needed executable before running these commands.
The official [Ghidra release](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build)
used here was `ghidra_12.1.4_PUBLIC_20260921.zip`, SHA-256
`ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`.
REA references: [license](https://github.com/morluto/rea/blob/main/LICENSE),
[installation](https://github.com/morluto/rea/blob/main/docs/installation.md),
[DOS MZ workflow](https://github.com/morluto/rea/blob/main/docs/ghidra-dos.md),
and [native investigation](https://github.com/morluto/rea/blob/main/docs/native-investigation.md).

### Current-source findings

- **Source verified:** at 100% zoom the farm viewport uses 16-pixel map cells.
  Tile drawing, placement, hit tests, crop footprints, disaster overlays, and
  the cursor share one zoom-aware cell transform. The Map window supplies an
  overview and analytical views, and its pointer navigation selects a camera
  origin. Arrow controls and edge scrolling also move the camera.
- **Source verified:** harvest contracts (futures) have price settlement and
  balance-sheet entries. Weather and disaster routines damage crops. The
  original reconstruction had no insurance state; this branch adds optional
  fictional insurance, not attributed to the 1993 game.
- **Source verified:** land parcels have ownership state, and buying and selling
  land are implemented. This branch adds an optional fictional conservation
  contract for owned vacant parcels, not an implementation of USDA rules or a
  feature verified in the original executable.
- **Historical uncertainty:** no primary reference reviewed here establishes
  original-game zoom. The new zoom is a usability feature and makes no claim of
  fidelity to Maxis behavior.
- **Engineering decision:** the optional mechanics use a versioned `.SFMX`
  wrapper so native save bytes stay intact and new policy/contract data has
  explicit validation and defaults. These rules are gameplay additions, not
  historical reconstructions.

## Architecture and state flow

The build script concatenates the 17 ordered sections in `src/sections.json`
into `game.js`. The sections share one private closure, so state and helper
functions are not independently imported modules. `index.html` provides the
canvas and save-file input. `src/16-input-and-calendar.js` handles pointer and
keyboard input, calendar advancement, and the animation loop. Rendering is in
`src/10-rendering.js`; map and irrigation logic is in
`src/07-map-and-irrigation.js`; pointer-to-cell tools are in
`src/13-land-and-tools.js`. Finance and reports live in
`src/05-interface-and-finance.js`, inventory transactions in
`src/06-market-and-inventory.js`, harvest settlement in `src/08-machinery.js`,
and native save parsing/writing in `src/11-scenarios-and-saves.js`. Optional
insurance and conservation terms, validation, and manager windows are in
`src/17-crop-insurance.js`.

The saved world is a byte array interpreted using offsets in
`data/save-states.json`. Crop definitions are decoded into `data/crops.json`.
The project preserves byte-level formats and reconstructed native behavior;
therefore unknown save bytes cannot safely be claimed as free extension space.

## Camera, map coordinates, and zoom decision

The farm map is a 96 × 96 cell world rendered through a fixed Edit viewport.
The viewport shows a cropped region; the `camera` coordinates are its origin,
with a historical `x + 1` descriptor convention reflected in the renderer and
input handlers. The Map overview converts two overview pixels to one map cell
and clamps the selected origin to the area supported by the Edit viewport.
Separate arrow and edge-scroll controls provide incremental panning. Tests in
`tests/gameplay.cjs` cover overview extremes, inclusive boundaries, eight map
modes, dragging, moved windows, scaling, cancellation, and that navigation
does not charge farm funds.

The Edit viewport remains 544 × 368 screen pixels. A usability zoom was added
as a deliberate nonhistorical improvement: the View menu zooms from touch
controls, wheel input zooms around its pointer, and `+`/`-` zoom around the
current pointer. The discrete levels are 50%, 75%, 100%, 150%, and 200%.
`cameraCellSize()` and the inverse pointer transform are
shared by tile drawing, map-cell hit testing, cursor outlines, palette picking,
map overview bounds, and disaster/aircraft sprites. Camera bounds account for
the viewport inset and visible world area. The map overview frame resizes with
zoom; existing panning remains in map-cell increments. Zoom is transient view
state stored only in the browser's local runtime cache; native `.SFM` and
`.SFMX` saves do not include it. Regression tests verify the exact world
coordinate under the pointer, map-cell hit testing after zoom, min/max levels,
edge clamping, repeated zoom-in/out cycles, CSS viewport resizing, keyboard
controls, and that scrolling a child window does not change farm zoom. The manual
does not establish that the original game had zoom, so this feature is not
presented as historical behavior.

## Economy and accounting

The current economy is split across native-format counters and runtime cash.
Purchases, sales, land transactions, bank operations, and seasonal tax handling
update these structures at different call sites. Crop harvest settlement in
`src/08-machinery.js` calculates value from crop quantity, commodity price, and
harvest quality. Futures settlement records the difference between contracted
and market value, posts the contracted crop sale, updates taxable sale income,
and credits cash. The Balance Sheet derives its revenue and expense columns
from native counters in `src/05-interface-and-finance.js`.

The review found and corrected one transaction mismatch in stored-crop sales.
`storedCropSalePrice()` computes the sale proceeds, and the transaction credits
that amount to cash and taxable sales. The crop-sales ledger previously added
twice the same amount. It now records the actual sale proceeds, so for this
transaction `cash delta = crop-sales ledger delta = taxable-sales delta`. A
regression assertion in `tests/save_compat.cjs` drives the sale through
`sellInventoryEntry()` and verifies all three deltas. This is an internal
accounting consistency correction; it is not a claim about how every original
SimFarm edition handled that counter. Other native counters can have different
reporting semantics and should be compared only after their units and source
behavior are established.

## Crop loss, insurance, and conservation mechanics

The current game has crop losses from drought, flood, frost, tornado, locust,
and other disasters, plus futures contracts that manage price risk. REA and the
manual review did not establish historical insurance or conservation rules.
The mechanics below are explicit, fictional additions in this reconstruction.

### Versioned `.SFMX` extension format

`serializeFarmSaveBytes()` emits the exact fixed-size native bytes when the
extension is empty. When extension state exists, `.SFMX` contains a 16-byte
little-endian header (`SFMX`, version, header size, native payload size, JSON
extension size), the unmodified native `.SFM` payload, and UTF-8 JSON extension
state. Version 1 rejects unknown versions, incorrect lengths, malformed
extension data, policies that do not match active saved fields, and contracts
that do not match owned vacant parcels and the saved year. Native `.SFM` and
`.SSM` imports receive empty extension defaults. Local saves also persist the
extension and migrate earlier version-1 extension objects by defaulting the
new conservation properties to empty/zero. The save compatibility suite
round-trips all eight included native scenario fixtures and exercises both
extensions. That is evidence for those fixtures, not every historical save.

### Fictional crop insurance

An active field may buy one policy tied to its saved field slot and crop slot.
The game captures the current commodity price and calculates expected value as
the crop's configured harvest quantity multiplied by the captured price
divided by ten and rounded down. Premium is 5% of that value rounded up, with
a one-credit minimum. Coverage has a 20% deductible and a payout cap of 50% of
expected value. For actual harvest value `A` and expected value `E`, payout is
`min(floor(0.5 × E), max(0, E - A - floor(0.2 × E)))`. Harvest completion
settles at most one claim; flood removal settles with zero actual value. Other
disasters affect claims through the eventual harvest value if the field
remains. If another path removes the field before harvest, its policy is
canceled without payout. An unaffordable premium is rejected. Premium and
claims totals are stored in extension accounting, while cash is debited or
credited through the game's funds state. The insurance manager shows active
policies and totals.

The implementation is deterministic and tests no loss, partial loss, total
loss, zero/invalid values, unaffordable premium, payout cap, duplicate policy
and claim handling, harvest settlement, and local/`.SFMX` persistence. These
rules are a fictional game mechanic, not federal crop-insurance regulations or
a claim about original SimFarm behavior.

### Fictional conservation contracts

USDA FSA's [CRP overview](https://www.fsa.usda.gov/resources/conservation/conservation-reserve-program)
describes a real program that pays eligible landowners to establish
resource-conserving cover; its current terms and rules are not encoded here.
The fictional game mechanic allows enrollment of one owned 8 × 8 parcel (64
map cells) if it contains no active field or building. Enrollment pays 100
credits immediately; 100 more is paid at the beginning of each of the next two
simulated years. The contract expires at the beginning of the fourth year
counting enrollment year, after three total payments. Fields, construction,
terrain tools, bulldozing, and land sale are blocked on enrolled cells/parcels;
the farm map adds a translucent green cover tint. Withdrawal is allowed without
a fee and ends future payments. Enrolled land must be vacant when loading an
`.SFMX` contract. The manager shows eligible and
active parcels, payments, and the withdraw/enroll action.

The three-year term, fixed payment, acreage unit, immediate first payment, and
no-penalty withdrawal are simplified game choices. They do not reproduce CRP
eligibility, rates, enrollment procedures, or regulations. Regression tests
cover eligibility on an owned vacant parcel, enrollment, payment timing,
expiration, withdrawal, land restrictions, malformed ownership on import,
local/native-extension round trips, and pixel-level tint compositing with the
real Canvas2D harness.

## Save compatibility and testing

`src/11-scenarios-and-saves.js` reads and writes the fixed state byte array and
applies runtime defaults for process-only data. `tests/save_compat.cjs` checks
round trips for all eight included scenario fixtures, saved speed/pause cadence,
serialized season, process-only state, malformed imports, local cache failures,
and export failures. This supports compatibility with those fixtures only; it
does not prove every historical `.SFM` variant is compatible.

On 2026-10-19, `npm run format:check`, `npm test`, `npm run build`,
`npm run build:web`, and `git diff --check` passed after implementing insurance,
conservation, and zoom rendering. A clean extraction of the pre-change `HEAD`
also passed its original nine-suite `npm test` baseline. The current test command
passed all ten suites, including generated-bundle consistency and JavaScript
syntax, native save compatibility, crop-sale accounting, insurance
boundaries, conservation payments/expiry/withdrawal and extension validation,
field placement, machinery, weather, crop loading, lifecycle, window behavior,
and basic map gameplay. The tenth suite uses the real Canvas2D harness to verify
the conservation tint pixel over the static scenario image. Interactive browser
testing has not been performed.

## Limitations and next work

1. Obtain and test additional legally accessible native save fixtures from
   multiple versions and platforms before making broader compatibility claims.
2. Extend the instrumented transaction harness to compare cash and each ledger
   for representative purchases, machinery and land sales, futures, and taxes.
3. Run a browser smoke test on desktop and touch layouts for the Programs
   windows, zoom controls, and `.SFMX` file workflow; the Node harnesses do not
   replace visual play testing.

## References

- Maxis Software Inc., _SimFarm – Deutsch – Handbuch_ (1993), Internet Archive
  item metadata and OCR: [item record](https://archive.org/details/simfarm-handbuch),
  [metadata API](https://archive.org/metadata/simfarm-handbuch),
  [OCR text](https://archive.org/download/simfarm-handbuch/SimFarm%20-%20Deutsch%20-%20Handbuch_djvu.txt).
- Maxis Software Inc., _SimFarm – Deutsch – Schnellstartkarte_ (1993), Internet
  Archive: [item record](https://archive.org/details/simfarm-schnellstartkarte).
- Internet Archive, _SimFarm_ DOS software record:
  [catalog item](https://archive.org/details/msdos_SimFarm_1993),
  [metadata API](https://archive.org/metadata/msdos_SimFarm_1993).
- USDA Farm Service Agency, [Conservation Reserve Program overview](https://www.fsa.usda.gov/resources/conservation/conservation-reserve-program)
  (accessed 2026-10-19). Used only to describe the real program's broad purpose
  and typical term; no detailed regulation is encoded in this game.
- Separate 2014 classroom project: [dkim0419/SimFarm](https://github.com/dkim0419/SimFarm).

## Additional gameplay audit and regression matrix

The Pete Kim remake's correction ledger is a source of audit candidates, not proof
that its behaviors match the original DOS release. The following checks are the
next gameplay-correctness pass for this repository. They are deliberately listed
as **pending verification** until the corresponding code path and regression
assertion are changed and run in this repository.

| Area | Regression scenario | Required invariant |
|---|---|---|
| Bank arrears | Pay a missed installment, then repay the loan in full | The arrears balance and delinquency countdown clear exactly once; repayment expense is posted once; a fully paid loan has no stale late-payment state |
| Crop revenue | Harvest a field, sell stored crops, and sell through a futures/contract path | Each economic event posts to its intended revenue ledger once; cash, stored-crop sales, and taxable-sale totals reconcile without counting a harvest as a sale |
| Financial reports | Compare source ledgers with Balance Sheet / evaluation totals after crop, machine, livestock, land, and contract transactions | Every displayed subtotal has a defined source ledger; omitted or double-counted categories are caught by fixtures |
| Operating expenses | Advance weeks with active machinery and workers, then begin the next accounting period | Per-period expenses reset at the correct boundary while cumulative totals remain stable; no expense is silently dropped or carried forward twice |
| Wind damage | Hold windstorm conditions across multiple maintenance ticks and vary windbreak coverage | Damage follows the intended event cadence, counts windbreak protection consistently, and stops when the event ends |
| Weather and crop stress | Exercise low-water conditions and the year-end temperature boundary | Warnings correspond to the actual field/weather state; the calendar transition does not use a stale temperature |
| Stored-crop loss | Save/load stored crops with loss-rate flags set and unset | Loss behavior follows the serialized flags and survives round trips |
| Forced-sale accounting | Trigger debt collection and forced liquidation of multiple asset types | Proceeds and debt expenses use the correct categories; balances cannot become negative through duplicate settlement |
| Demolition accounting | Remove recreation/airport structures after placing them and verify environmental-grid flags | Structure counts, ownership/value, and environmental-grid bits are updated together and only once |

### Validation policy for this pass

- Do not call a candidate fixed solely because the comparison repository fixes it.
- For each implemented correction, add a deterministic regression assertion to the
  narrowest existing test suite or a dedicated suite and register it in
  `tests/run.cjs`.
- Run `npm test`, `npm run format:check`, `npm run build`, and
  `git diff --check` against the final gameplay commit. Record exact command
  outcomes and the commit SHA that was tested.
- The branch's previously recorded local result was 10 passing regression suites,
  with build/format checks passing. That is the baseline, **not** a test result
  for the pending scenarios above.
- GitHub Actions previously stopped at the fork workflow-approval gate before
  jobs were created. A maintainer must approve the workflows before those checks
  can provide CI evidence. Native Android/iOS builds and interactive browser or
  device testing remain separate validation tasks.
