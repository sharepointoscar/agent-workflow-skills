# Getting to a layered SVG from whatever you were handed

The pipeline needs one thing: an SVG whose meaningful parts are addressable by
id. How you get there depends on the source.

## A. Hand-authored SVG (best case)

Coordinates and colors are already deliberate. Wrap elements into `.layer`
groups per `grouping.md`, add `fN`/`pN` ids to the flows, done. Geometry is never
modified — the animation is purely additive, so the static diagram still renders
identically with JS disabled.

## B. Mermaid

Render to SVG first, then map:

```bash
npm i -g @mermaid-js/mermaid-cli
mmdc -i diagram.mmd -o diagram.svg -b transparent -t dark
```

Mermaid emits stable-ish structure you can key off:

- Nodes: `g.node[id^="flowchart-"]` — the id embeds the node's mermaid name, e.g.
  `flowchart-vault-3`.
- Edges: `path.flowchart-link`, in declaration order, with classes like
  `LS-user LE-agent` encoding start/end node names.
- Labels: `g.edgeLabel`, `.nodeLabel`.

Post-process rather than hand-editing — mermaid output is regenerated whenever
the source changes. A small script that walks the SVG, renames matched groups to
your `g-*` scheme, and tags the Nth link as `p<N>` keeps the diagram editable at
the mermaid level. Give the script the mermaid node name → layer id mapping as
a dict at the top so re-running after a source edit is a one-liner.

Caveats worth knowing before committing to this path: mermaid wraps nodes in
nested `<g>` elements, so pick the outermost per-node group as the `.layer` and
do not add a second layer inside it. Mermaid also emits its own `<style>` block —
leave it alone; engine.css only touches classes mermaid does not use.

## C. Graphviz / DOT

```bash
dot -Tsvg -o diagram.svg diagram.dot
```

Graphviz is friendlier than mermaid here: it emits `<g class="node">` and
`<g class="edge">` with a `<title>` child holding the exact node name or
`a->b` edge spec. Matching on `<title>` text is stable across regenerations.
Add `id=` attributes in the DOT source itself and graphviz passes them through,
which is the cleanest option of all:

```dot
vault [id="g-vault", label="HashiCorp Vault"];
user -> agent [id="p1"];
```

## D. PNG or other raster (fallback)

Lower fidelity, but workable when no vector source exists. The text stays raster
and cannot reflow, and dimming is applied to overlay shapes rather than to the
artwork itself.

Build an SVG that is a background image plus hand-authored overlay geometry:

```xml
<svg id="diagram" viewBox="0 0 2600 1495" xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,..." x="0" y="0" width="2600" height="1495"/>

  <!-- one translucent scrim per region, dimmed inversely to focus -->
  <g id="g-vault" class="layer">
    <rect x="1370" y="160" width="360" height="880" rx="12"
          fill="none" stroke="#3b82f6" stroke-width="3" opacity="0.9"/>
  </g>

  <g id="f1" class="layer flow">
    <path id="p1" class="flowline" d="M320,390 L470,375"
          stroke="#3b82f6" stroke-width="3" stroke-dasharray="6,3"/>
    <g class="badge">…</g>
  </g>
</svg>
```

Two adjustments make the raster path look intentional rather than broken:

1. **Invert the dimming.** You cannot dim parts of a single `<image>`. Instead,
   put a full-canvas scrim rect *above* the image and *below* the overlays, and
   cut holes in it with a `<mask>` built from the focused regions' rects. Focus
   then reads as "spotlight" rather than "everything else faded".
2. **Set `viewBox` to the image's native pixel dimensions** so every coordinate
   you measure off the PNG maps 1:1. Measure by opening the image and reading
   coordinates directly; do not scale mentally.

Embed the PNG as a data URL so the output stays a single file.

## Which path to take

Ask the user for the vector source before falling back to raster — most diagrams
that arrive as a PNG were exported from something. The quality gap is large
enough that one round-trip to fetch the SVG is usually worth it. If the chat
uploader rejects a `.svg` attachment as an unprocessable image, suggest renaming
it to `.svg.txt`, connecting the containing folder, or pasting the source.
