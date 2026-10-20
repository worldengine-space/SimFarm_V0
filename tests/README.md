# Runtime regression tests

Run `npm test` from the project root. The test runner starts each suite in a fresh Node process and evaluates the generated `game.js` in an isolated browser-like environment.

The ten suites cover:

- All eight scenario save round trips, speed and pause state, rejected malformed saves, local storage failures, and failed file exports.
- Field placement through pointer input and its serialized footprint.
- Machinery route wear and damage.
- Weather state and draw calls.
- Crop storage, prices, restrictions, and save bytes.
- Startup timing and About credits.
- Window dragging, ordering, closing, and scaled pointer coordinates.
- Child-window stacking, menu controls, and native title behavior.
- Map navigation, input cancellation, frame animation, and Pause/resume.
- Actual Canvas2D rendering of the conservation tint over a static scenario map.

These tests preserve behavioral assertions from the original development project. They use the included data files; no original executable or external capture folder is required. Most suites record or stub drawing calls, so passing those checks does not establish pixel-perfect rendering or replace a browser smoke test. The conservation rendering suite uses the real Canvas2D harness and checks the composited tint at a map pixel.

`lib/full_game_runtime.cjs` is an additional harness for rendering the actual game with decoded PNG assets and a real Canvas2D implementation using `@napi-rs/canvas`. It exposes pointer/keyboard input, file loading, state snapshots, and PNG captures for visual checks. It requires the complete runtime assets.

Both harness styles inject a test-only API immediately before the startup `load()` call. The shipped browser bundle contains no test API.
