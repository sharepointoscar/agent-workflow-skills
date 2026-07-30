# Restructuring an SVG into animatable layers

This is where most of the real work is, and where a careless pass produces a
diagram that "animates" but looks broken. The rest of the pipeline is mechanical.

## The core rule: dimmable units are flat siblings

Every element you want to independently dim or highlight becomes its own
`<g class="layer" id="...">`, and those groups are **siblings of each other**,
never nested.

The reason is opacity multiplication. If `g-vault-shell` wraps `g-oauth` and you
dim the parent to 0.10 while highlighting the child, the child renders at
0.10 × 1.0 = 0.10. It cannot get brighter than its parent. Highlighting one box
inside a panel while the panel recedes — which is the single most useful move in
this whole technique — becomes impossible.

So a panel and its contents are split:

```xml
<g id="g-vault-shell" class="layer">  <!-- border, title, logo, ribbon -->
<g id="g-oauth"       class="layer">  <!-- one inner box -->
<g id="g-registry"    class="layer">  <!-- another inner box -->
```

A step then focuses `["g-vault-shell","g-oauth","g-registry"]` and the untouched
inner boxes dim on their own.

## Granularity

Split down to the level you might want to narrate separately, and no further.
A four-box panel where the steps only ever reference the panel as a whole stays
one group. A panel where step 3 talks about the OAuth resource server and step 4
talks about the dynamic secrets engine needs those as separate groups.

When unsure, split. Merging later is a two-line edit; splitting later means
re-walking the file.

## Naming

- `g-*` for structural regions: `g-user`, `g-runtime`, `g-audit`
- `f1`…`fN` for flows — the engine parses this pattern to decide whether a flow
  is upcoming (dim), current (hot), or already traversed (trail). Keep it exact:
  `f` followed by digits.
- `p1`…`pN` for the geometry element **inside** each flow group. This is what the
  engine clones and draws.

## Flow group anatomy

```xml
<g id="f3" class="layer flow">
  <line id="p3" class="flowline" x1="786" y1="585" x2="861" y2="262"
        stroke="#a855f7" stroke-width="2" stroke-dasharray="6,3"
        marker-end="url(#ag-purple)"/>
  <g class="badge">
    <circle cx="818" cy="420" r="12" fill="#8b5cf6"/>
    <text x="818" y="424" fill="white" font-size="11" font-weight="bold"
          text-anchor="middle">3</text>
  </g>
  <text x="655" y="455" fill="#c084fc" font-size="9">present JWT → Vault validates,</text>
</g>
```

Three things matter here:

- `id="p3"` on the geometry, `class="flowline"` for the ambient dash drift.
- The number circle + its text wrapped in `<g class="badge">`. The engine scales
  this group on step entry; without the wrapper the circle and the digit scale
  about different origins and visibly separate.
- Keep the label text inside the flow group so it dims and brightens with its arrow.

## Geometry the engine can draw

`<line>`, `<polyline>`, `<polygon>`, and `<path>` all work — they are converted
to path data and cloned. `<rect>`, `<circle>`, and `<ellipse>` are not valid flow
geometry; if a flow is drawn as a rect, replace it with an equivalent path.

Markers stay on the base element only. The engine's draw clone deliberately has
no marker, because SVG renders `marker-end` at the geometric end of the path
regardless of dash offset — a partially-drawn arrow would show its arrowhead
already parked at the destination.

## Ordering

1. Structural groups first (they render underneath).
2. Flow groups after them.
3. `<g id="overlays"></g>` last — `build.py` appends it if absent.

SVG has no `z-index`; document order is the entire stacking model. The draw
clones and pulse dots live in `#overlays` so they always sit above the diagram.

## Things that are easy to get wrong

- **`<defs>` must stay at the top level**, not inside a layer group. Dimming a
  group that contains a gradient definition is harmless, but moving `defs` under
  a group that later gets `display:none` breaks every reference to it.
- **Elements silently left out of any group** never dim. They stay at full
  opacity while everything else recedes, which looks like a rendering bug. After
  grouping, verify that every drawable element has a `.layer` ancestor
  (`scripts/check_layers.py` does this).
- **Duplicate ids** — exporters love emitting them. `build.py` warns; fix them,
  since `getElementById` will silently pick the first.
- **`transform` on a wrapper you add** shifts everything inside it. Add groups
  with no attributes other than `id` and `class`.

## Title / legend handling

A title or legend that dims with everything else makes the frame feel dead.
List those ids in `alwaysVisible` in the steps config and they hold at trail
opacity (0.42) throughout instead of dropping to 0.10.
