# Asset provenance

The artwork, font, interface graphics, sound effects, and music in
`assets/original/` come from the existing Codex SimFarm reconstruction. They
were recovered from its previously built **SimFarm Reconstructed for Mac**
application bundle, which preserved the complete browser asset directory.
No replacement or newly generated artwork was introduced.

The bundle's build manifest identifies this source `game.js` SHA-256:

```text
c7e41c604fa4ce9596a78da0863f2c3e49f46493e31e97cf29830469cf312375
```

That hash exactly matches the Codex source used for this release before its
readability cleanup.

## Recovery verification

All **406 asset files** matched their SHA-256 entries in the preserved build
manifest, with zero missing files or hash mismatches:

| Format | Files |
| --- | ---: |
| PNG graphics | 356 |
| WAV audio | 33 |
| MIDI music | 8 |
| OGG music | 8 |
| JSON manifest | 1 |

The original runtime's asset table was evaluated, including its generated
scenario and crop paths. All **338 image references** and **33 audio
references** resolve to files in this release. The assets directory contains
only the formats listed above; it includes no original executable or emulator.

SimFarm's original name, artwork, audio, and other game content remain the
property of their respective rights holders. Their inclusion does not make
them newly licensed open-source assets.
