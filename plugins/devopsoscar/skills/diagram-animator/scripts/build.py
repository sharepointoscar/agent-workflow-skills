#!/usr/bin/env python3
"""
build.py — assemble a self-contained animated-diagram HTML from:
  * a layered SVG   (root gets id="diagram"; an <g id="overlays"> is appended)
  * a steps JSON    (see references/steps-schema.md)
  * the bundled engine.css / engine.js / template.html

Usage
-----
  python scripts/build.py \
      --svg diagram.svg \
      --steps steps.json \
      --out flow.html \
      [--title "..."] [--subtitle "..."] [--footer "..."] \
      [--theme dark|light|none] [--theme-file custom.css] \
      [--no-chrome] [--scrub]

Everything is inlined — the output is one file with no external requests, which
is what makes it survive as an artifact, an email attachment, or a file dropped
on a colleague's desktop.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
THEMES = Path(__file__).resolve().parent.parent / "references" / "themes"


def read(p: Path) -> str:
    if not p.exists():
        sys.exit(f"build.py: missing file {p}")
    return p.read_text(encoding="utf-8")


def prepare_svg(svg_text: str) -> str:
    """Give the root <svg> id="diagram" and make sure #overlays exists and is last.

    #overlays must be the final child: the engine appends the bright draw paths
    and pulse dots there, and SVG has no z-index, so document order is the only
    thing keeping them above the diagram."""
    svg_text = svg_text.strip()

    # strip an XML prolog / doctype if the file came from an exporter
    svg_text = re.sub(r"^\s*<\?xml[^>]*\?>\s*", "", svg_text)
    svg_text = re.sub(r"^\s*<!DOCTYPE[^>]*>\s*", "", svg_text, flags=re.I)

    m = re.search(r"<svg\b[^>]*>", svg_text, flags=re.I)
    if not m:
        sys.exit("build.py: no <svg> element found in the SVG input")
    open_tag = m.group(0)

    if re.search(r'\bid\s*=\s*["\']', open_tag):
        new_tag = re.sub(r'\bid\s*=\s*["\'][^"\']*["\']', 'id="diagram"', open_tag, count=1)
    else:
        new_tag = open_tag[:-1].rstrip() + ' id="diagram">'
    svg_text = svg_text[: m.start()] + new_tag + svg_text[m.end():]

    if 'id="overlays"' not in svg_text and "id='overlays'" not in svg_text:
        idx = svg_text.rfind("</svg>")
        svg_text = svg_text[:idx] + '\n  <g id="overlays"></g>\n' + svg_text[idx:]

    return svg_text


def load_theme(name: str, theme_file: str | None) -> str:
    if theme_file:
        return read(Path(theme_file))
    if name in ("none", "dark"):
        return ""  # dark is engine.css's built-in default
    p = THEMES / f"{name}.css"
    if not p.exists():
        avail = ", ".join(sorted(x.stem for x in THEMES.glob("*.css"))) or "(none)"
        sys.exit(f"build.py: unknown theme '{name}'. Available: dark, {avail}")
    return read(p)


def validate(cfg: dict, svg_text: str) -> list[str]:
    """Cheap pre-flight so a typo shows up here rather than as a silent no-op
    in the browser. Returns a list of warnings."""
    warn = []
    for s in cfg.get("steps", []):
        for key in ("n", "path", "flow", "color", "title", "html"):
            if key not in s:
                warn.append(f"step {s.get('n', '?')}: missing '{key}'")
        pid, fid = s.get("path"), s.get("flow")
        if pid and f'id="{pid}"' not in svg_text:
            warn.append(f"step {s.get('n')}: no element with id=\"{pid}\" in the SVG")
        if fid and f'id="{fid}"' not in svg_text:
            warn.append(f"step {s.get('n')}: no element with id=\"{fid}\" in the SVG")
        for lid in s.get("focus", []):
            if f'id="{lid}"' not in svg_text:
                warn.append(f"step {s.get('n')}: focus id \"{lid}\" not found in the SVG")
    if 'class="layer"' not in svg_text and "class='layer'" not in svg_text:
        warn.append("no elements carry class=\"layer\" — nothing will dim or highlight")
    return warn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--svg", required=True)
    ap.add_argument("--steps", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--subtitle", default="Press <b>Play</b> to walk through the flow.")
    ap.add_argument("--footer", default="")
    ap.add_argument("--theme", default="dark")
    ap.add_argument("--theme-file", default=None)
    ap.add_argument("--no-chrome", action="store_true",
                    help="hide playback controls (autoplay-only / screen-recording variant)")
    ap.add_argument("--scrub", action="store_true", help="add a timeline scrubber")
    ap.add_argument("--strict", action="store_true", help="fail instead of warn on validation issues")
    args = ap.parse_args()

    svg_text = prepare_svg(read(Path(args.svg)))
    cfg = json.loads(read(Path(args.steps)))

    warns = validate(cfg, svg_text)
    for w in warns:
        print(f"  warn: {w}", file=sys.stderr)
    if warns and args.strict:
        sys.exit("build.py: validation failed (--strict)")

    title = args.title or cfg.get("title") or "Animated diagram"
    subtitle = args.subtitle if args.subtitle else cfg.get("overview", {}).get("html", "")
    footer = args.footer or cfg.get("footer", "")

    html = read(ASSETS / "template.html")
    html = (html
            .replace("__CSS__", read(ASSETS / "engine.css"))
            .replace("__THEME__", load_theme(args.theme, args.theme_file))
            .replace("__CONFIG__", json.dumps(cfg, ensure_ascii=False))
            .replace("__JS__", read(ASSETS / "engine.js"))
            .replace("__SVG__", svg_text)
            .replace("__TITLE__", title)
            .replace("__SUBTITLE__", subtitle)
            .replace("__FOOTER__", footer))

    if args.no_chrome:
        html = html.replace('<div class="controls chrome">',
                            '<div class="controls chrome" style="display:none">')
    if args.scrub:
        html = html.replace('<div class="spacer"></div>',
                            '<input type="range" id="scrub" min="0" value="0" step="10"/>'
                            '<div class="spacer"></div>')

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    kb = out.stat().st_size / 1024
    print(f"built {out}  ({kb:.0f} KB, {len(cfg.get('steps', []))} steps)")


if __name__ == "__main__":
    main()
