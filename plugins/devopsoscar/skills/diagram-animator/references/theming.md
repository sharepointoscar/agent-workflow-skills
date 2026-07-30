# Theming and variants

The default is the dark technical style: near-black `#0d1117` canvas, a caption
bar accented in the current step's color, circular step chips, colored glow on
focus, everything else at 10% opacity. It suits architecture and systems
diagrams, which is most of what this gets used for, and it matches the palette
most dark-mode diagram exports already use.

Everything adjustable is a CSS custom property. Themes are variable blocks
appended after `engine.css`, so a theme never has to restate the layout.

## Built-in themes

| `--theme` | Use it for |
|---|---|
| `dark` (default) | technical / architecture diagrams, dark source SVG |
| `light` | print, light-background decks, docs embedding |
| `none` | you're supplying `--theme-file` |

```bash
python scripts/build.py --svg d.svg --steps s.json --out f.html --theme light
```

## The knobs

```css
:root{
  --bg:#0d1117;         /* page + stage background — match the SVG canvas */
  --panel:#161b22;      /* caption bar */
  --edge:#30363d;       /* borders */
  --fg:#e6edf3;         /* primary text */
  --muted:#8b949e;      /* caption body */
  --glow:#3b82f6;       /* overwritten per step by the engine — set the initial only */
  --dim-opacity:.10;    /* how far unfocused layers recede */
  --focus-blur-1:7px;   /* inner glow radius on focused layers */
  --focus-blur-2:16px;  /* outer glow radius */
}
```

`--dim-opacity` is the one worth tuning per diagram. 0.10 gives strong focus but
loses context on busy diagrams; 0.18–0.22 keeps the surrounding structure legible
and suits diagrams where the audience is still learning the layout. Above ~0.3
the focus stops reading.

`--focus-blur-*` at the defaults produces a noticeable halo on large panels. On
diagrams built from many small boxes, halve them — the glows otherwise merge into
one another.

## Custom palette

Write a variable block and pass it:

```bash
python scripts/build.py … --theme none --theme-file brand.css
```

```css
/* brand.css */
:root{
  --bg:#101418; --panel:#171d24; --edge:#2a333d;
  --fg:#f0f4f8; --muted:#93a1b0;
  --btn-primary:#7c3aed; --btn-primary-edge:#a855f7;
  --dim-opacity:.14;
}
```

Per-step `color` values live in the steps JSON, not the theme — they should track
the arrow colors already in the SVG.

## Variants

**No chrome** — `--no-chrome` hides the control row. For screen recording, an
embedded loop, or a kiosk display where nobody is clicking. Keyboard shortcuts
still work.

**Scrubber** — `--scrub` adds a timeline slider. Useful when presenting live and
you want to hold a specific moment mid-draw.

**Reduced motion** — `engine.css` already honours `prefers-reduced-motion`,
dropping the layer transitions and the ambient dash drift. Step navigation still
works; it just cuts rather than eases.

## Sizing

The SVG scales to the container width and the page maxes out at 1720 px. For a
diagram much wider than it is tall, that means a short stage and a lot of
whitespace — raise `.wrap { max-width }` in a theme file. For a tall diagram, no
change is needed; it will simply be tall.
