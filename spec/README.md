# Cribmap encounter format (v0.3)

One JSON file describes everything a GM preps for a map: what players see, what only the GM sees, and which checks reveal what. Coordinates are **grid cells from the map's top-left corner**. Validate a file with `node tools/validate.mjs file.json`.

```jsonc
{
  "title": "string",
  "map": { "url": "…jpg|png", "width": 3000, "height": 2250, "dpi": 75 },   // optional; dpi = pixels per grid cell
  "timerMinutes": 30,                                                       // optional countdown
  "dial":  { "name": "Town Trust", "start": 0, "minLabel": "…", "maxLabel": "…", "labels": { "-2": "…", "3": "…" } },
  "spend": [ { "pts": 1, "name": "Small flashback", "desc": "…" } ],         // what the points buy
  "tiers": [ { "min": 0, "name": "Quiet", "color": "#3a7d44", "gm": "…" } ], // alarm levels (optional)
  "alarmMax": 10,

  "labels": [ { "key": "…", "text": "Market Square", "x": 21.5, "y": 13.4, "hidden": false } ],   // place names
  "pins":   [ { "key": "…", "title": "…", "x": 1, "y": 1, "hidden": true, "notes": "…", "checks": [ … ] } ],
  "tokens": [ { "key": "…", "name": "…", "role": "…", "x": 12, "y": 11, "hidden": false,
                "glyph": "C", "color": "brown",          // built-in letter token, or "image": "https://…png"
                "notes": "VIBE (read aloud): …\nVOICE: …\nKNOWS:\n• …", "checks": [ … ] } ],
  "fog":    [ { "key": "…", "title": "Catacombs", "x": 22, "y": 1, "w": 10, "h": 6 } ],
  "alarms": [ { "key": "…", "title": "Bell Tower", "x": 11, "y": 1, "weight": 4, "disable": "…", "notes": "…" } ]
}
```

## Layers of visibility
| Thing | Players see | GM sees |
|---|---|---|
| `labels` | yes (unless `hidden`) | yes |
| `tokens` | the token and its name (unless `hidden`) | plus notes and checks in the panel |
| `pins` | no (hidden by default) | 📍 marker plus notes and checks |
| `fog` | darkness | the fogged area, faded |
| counters / timer | yes | plus +/− and Spend controls |
| `dial` | only if the GM ticks "players can see" | always |

## Tiered checks
```json
{ "id": "unique-id", "skill": "Religion", "who": "Cal", "approach": "What they try",
  "any": "What they learn even on a fail (0 pts)",
  "tiers": [ { "dc": 12, "pts": 1, "gain": "…" }, { "dc": 16, "pts": 2, "gain": "…" }, { "dc": 20, "pts": 3, "gain": "…" } ] }
```
The GM clicks the highest tier beaten. Beating a higher tier later awards only the difference. Check `id`s must be unique within a file.

## Letter tokens
`glyph` is A–Z, `!` or `?`. `color` is one of `red brown gold green teal blue purple gray`. Files live in `assets/tokens/letters/`.

## Keys and reloading
Every `key` must be unique. Loading a file again updates notes and checks on items with the same key, never moves items, and re-adds fog zones the GM revealed.
