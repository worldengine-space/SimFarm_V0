# Runtime regression tests

Run `npm test` from the project root. The test runner starts each suite in a fresh Node process and evaluates the generated `game.js` in an isolated browser-like environment.

The nine suites cover:

- All eight scenario save round trips, speed and pause state, rejected malformed saves, local storage failures, and failed file exports.
- Field placement through pointer input and its serialized footprint.
- Machinery route wear and damage.
- Weather state and draw calls.
- Crop storage, prices, restrictions, and save bytes.
- Startup timing and About credits.
- Window dragging, ordering, closing, and scaled pointer coordinates.
- Map navigation, input cancellation, frame animation, and Pause/resume.

These tests preserve behavioral assertions from the original development project. They use the included data files; no original executable or external capture folder is required. Their drawing contexts record or stub calls, so passing these suites does not establish pixel-perfect rendering or replace a browser smoke test.

`lib/full_game_runtime.cjs` is an additional harness for rendering the actual game with decoded PNG assets and a real Canvas2D implementation using `@napi-rs/canvas`. It exposes pointer/keyboard input, file loading, state snapshots, and PNG captures for visual checks. It requires the complete runtime assets.

Both harness styles inject a test-only API immediately before the startup `load()` call. The shipped browser bundle contains no test API.
