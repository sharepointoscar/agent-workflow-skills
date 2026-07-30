# Steps config schema

One JSON file drives the whole animation. `scripts/build.py` inlines it as
`window.DIAGRAM_CONFIG`.

```jsonc
{
  "title": "Agentic Runtime Security — Bedrock AgentCore + Vault",
  "footer": "Optional line under the diagram.",
  "baseColor": "#3b82f6",          // accent used in the overview state
  "trailOpacity": 0.16,            // already-traversed flow overlays
  "alwaysVisible": ["g-title"],    // layers that hold at 0.42 instead of dimming

  "timing": {                      // milliseconds
    "draw": 950,                   // arrow draw-on
    "hold": 2150,                  // dwell after the draw, with pulse looping
    "pulseCycle": 1250,            // one traveller lap
    "outro": 900                   // pause before the complete state
  },

  "overview": {
    "title": "Full architecture — 7-step request path",
    "html": "Press <b>Play</b>, or click any numbered chip."
  },
  "complete": {
    "color": "#22c55e",
    "title": "Complete — one trust plane each, one seam between them",
    "html": "Summary shown after the last step."
  },

  "steps": [
    {
      "n": 1,                      // 1-based, must match the fN / pN ids
      "path": "p1",                // id of the geometry element
      "flow": "f1",                // id of the flow group (badge lives here)
      "color": "#3b82f6",          // drives glow, caption accent, chip fill
      "tag": "authN",              // small uppercase pill next to the title
      "focus": ["g-user", "g-ac-shell", "g-runtime"],
      "title": "Authenticate + invoke",
      "html": "Prose with <b>bold</b> allowed.",

      "halo": [{ "x": 545, "y": 258 }],   // optional attention rings (max 3)
      "width": 3.2,                       // optional draw stroke width
      "dotR": 5                           // optional traveller radius
    }
  ]
}
```

## Field notes

**`focus`** is the set of layer ids that stay bright and gain the colored glow.
Everything else drops to `--dim-opacity` (0.10), except flows, which use their
own ordering rule, and `alwaysVisible` ids.

Include the *containing shell* alongside an inner box. Focusing `g-oauth` without
`g-vault-shell` leaves a bright box floating on a nearly-invisible panel with no
border or title — it reads as detached. This is the most common authoring mistake.

**`color`** should match the arrow's own stroke. The engine paints the caption
border, the number bubble, the chip, the glow, and the draw overlay from this one
value, so a mismatch shows up in five places at once.

**`html`** is the narration. Two to four sentences is the sweet spot: enough to
say what actually happens and why, short enough that the reader finishes before
the step advances. Name the concrete mechanism — protocol, claim, component —
rather than restating the arrow label. If the caption only says what the picture
already shows, the animation is decorative.

**`tag`** is a 1–2 word category (`authN`, `the seam`, `JIT creds`, `attribution`).
It gives the viewer a spine to hang the sequence on. Skip it rather than pad it.

**`timing`** — hold should comfortably exceed reading time for the longest
caption. 2150 ms suits ~35 words. If captions run long, raise `hold` rather than
trimming the prose to fit; the viewer can also pause.

**`halo`** draws expanding rings at a coordinate, for the case where the step's
subject is a node rather than an edge. Use sparingly — more than one or two
across a whole sequence stops reading as emphasis.
