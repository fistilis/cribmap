# Cribmap

**Turn a GM's big ideas into layered crib notes on the map.** You describe an encounter to an AI (or write it yourself). Cribmap stores it in one JSON file and puts every note where it belongs: place names players can read, NPC tokens carrying the GM's crib notes, hidden pins, tiered skill checks that pay out points, named fog zones, counters, a dial and a timer. Edit at the table, export the file, and iterate.

Status: early (v0.3). The first VTT adapter is an [Owlbear Rodeo](https://www.owlbear.rodeo) add-on.

```
idea ──► AI / you ──► encounter.json ──► Owlbear add-on ──► table
                          ▲                                  │
                          └──────── Export (edits) ◄─────────┘
```

## What's here
| Path | What |
|---|---|
| `owlbear/` | The Owlbear Rodeo add-on (static files, no build step) |
| `spec/` | The encounter file format |
| `tools/validate.mjs` | Validator: `node tools/validate.mjs my-encounter.json` |
| `examples/` | An original demo encounter (Greyford — Market Night) |
| `assets/` | A generic walled-town map and built-in letter tokens |
| `authoring/` | The prompt for having an AI write encounter files |

## Install in Owlbear
1. Add-on URL: `https://fistilis.github.io/cribmap/owlbear/manifest.json`
2. Owlbear → Profile → Extensions → **Add Custom Extension** → paste the URL.
3. Turn on **Cribmap** for your room, open a scene, click the padlock icon → **Setup** → load the demo → **Place on map**.

Your own campaign files can stay private: in Setup, open them with the file picker or paste them in. Only the generic map and tokens are served from here.

## Contributing
Issues and ideas are welcome, especially adapters for other VTTs (Foundry, Roll20, D&D Beyond Maps), better authoring prompts, and format proposals. See `CONTRIBUTING.md`.

## License
Apache-2.0. The map and tokens in `assets/` are original and released under the same license. Not affiliated with Owlbear Rodeo or Wizards of the Coast.
