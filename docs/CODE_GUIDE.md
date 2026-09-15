# Code guide

The browser loads `game.js`, which is built from the files listed in
[`src/sections.json`](../src/sections.json). Read and edit those source files,
then run `npm run build` and `npm test`.

## Where to start

| Source section | What to look for |
| --- | --- |
| `01-configuration.js` | Canvas setup, timing constants, catalogs, menu definitions |
| `02-assets-and-state.js` | Asset registries and shared game state |
| `03-loading-and-audio.js` | Resource loading, music, and sound playback |
| `04-world-generation.js` | Region selection and terrain generation |
| `05-interface-and-finance.js` | Window drawing and financial interface |
| `06-market-and-inventory.js` | Buying, selling, stored goods, and market behavior |
| `07-map-and-irrigation.js` | Map views and water systems |
| `08-machinery.js` | Machine jobs, routing, and operations |
| `09-field-schedules.js` | Crop schedules and field operations |
| `10-rendering.js` | Farm drawing, tiles, sprites, and visual effects |
| `11-scenarios-and-saves.js` | Scenario loading and native save serialization |
| `12-interface-actions.js` | Menus, dialogs, and window interactions |
| `13-land-and-tools.js` | Property and construction tools |
| `14-disasters.js` | Disaster events and their effects |
| `15-livestock-and-placement.js` | Animals and object placement |
| `16-input-and-calendar.js` | Pointer and keyboard events, simulation clock, startup |

## How the pieces fit

The sections share one private closure. They are source fragments assembled in
the order in `sections.json`, rather than independent JavaScript modules.
This preserves the original reconstruction's initialization order and shared
simulation state while making related code easier to find. A function can call
helpers declared in another section, so search the whole `src/` directory when
following a behavior.

The page provides a 640 × 480 canvas and a hidden input for loading saved games.
Startup loads the resources, and the animation-frame loop advances the simulation
and draws the game. Graphics and game data live in `assets/` and `data/`;
there is no game server or emulator in the runtime.

## Reading the reconstruction notes

Comments sometimes refer to original executable addresses, offsets, masks, or
record numbers. These document why a seemingly unusual behavior exists. For
example, timing uses recovered native clock values, while some drawing code
preserves palette-index operations needed for the original appearance.

Before simplifying an unusual condition, check its surrounding comments and
regression coverage. Native save formats and integer arithmetic can depend on
details that do not look like conventional application code.

## Making a change

1. Find the responsible section and follow the relevant state and helper calls.
2. Change the source, then run `npm run format` and `npm run build`.
3. Run `npm test` and exercise the changed interaction in the browser.
4. Commit the source together with the regenerated `game.js` so a checkout is
   immediately playable.

The included checks exercise a selected set of reconstruction behaviors. They
are useful regression evidence, not an exhaustive verification of the game.
