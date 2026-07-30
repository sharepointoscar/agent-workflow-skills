#!/usr/bin/env python3
"""
check_layers.py — pre-flight a restructured SVG before building.

Catches the failure modes that are invisible until you watch the animation:
elements left outside every .layer group (they never dim, which looks like a
rendering bug), nested layers (opacity multiplies, so a highlighted child can
never outshine a dimmed parent), duplicate ids, flows missing geometry, and
flow-group / geometry id mismatches.

Usage:  python scripts/check_layers.py diagram.svg [steps.json]
Exit code is 1 if any error-level problem is found.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

SVG = "{http://www.w3.org/2000/svg}"
DRAWABLE = {"rect", "circle", "ellipse", "line", "polyline", "polygon",
            "path", "text", "image", "use"}
GEOMETRY = {"line", "polyline", "polygon", "path"}


def tag(el):
    return el.tag.split("}")[-1]


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: check_layers.py diagram.svg [steps.json]")
    svg_path = Path(sys.argv[1])
    steps_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    for p in (svg_path, steps_path):
        if p and not p.exists():
            sys.exit(f"check_layers.py: no such file: {p}")

    raw = svg_path.read_text(encoding="utf-8")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        sys.exit(f"check_layers.py: {svg_path} is not well-formed XML — {e}")

    errors, warns = [], []

    # ---- duplicate ids
    ids = [el.get("id") for el in root.iter() if el.get("id")]
    for i, c in Counter(ids).items():
        if c > 1:
            errors.append(f"duplicate id '{i}' appears {c}× — getElementById picks the first")

    # ---- collect layers and check nesting
    parents = {child: parent for parent in root.iter() for child in parent}

    def ancestors(el):
        cur = parents.get(el)
        while cur is not None:
            yield cur
            cur = parents.get(cur)

    layers = [el for el in root.iter()
              if "layer" in (el.get("class") or "").split()]
    if not layers:
        errors.append("no elements carry class=\"layer\" — nothing will dim or highlight")

    for l in layers:
        for a in ancestors(l):
            if "layer" in (a.get("class") or "").split():
                errors.append(
                    f"layer '{l.get('id')}' is nested inside layer '{a.get('id')}' — "
                    "opacity will multiply; make them siblings")
                break
        if not l.get("id"):
            errors.append("a .layer group has no id")

    layer_set = set(layers)

    # ---- drawables with no layer ancestor
    orphans = []
    for el in root.iter():
        if tag(el) not in DRAWABLE:
            continue
        if any(tag(a) in ("defs", "marker", "clipPath", "mask", "pattern", "symbol")
               for a in ancestors(el)):
            continue
        if not any(a in layer_set for a in ancestors(el)):
            desc = tag(el)
            if desc == "text":
                desc += f" \"{(el.text or '')[:40]}\""
            elif el.get("id"):
                desc += f" #{el.get('id')}"
            orphans.append(desc)
    # the root background rect is conventionally left ungrouped; tolerate one
    if len(orphans) > 1:
        warns.append(f"{len(orphans)} drawable elements are outside every .layer "
                     f"(they will never dim): " + ", ".join(orphans[:8]) +
                     (" …" if len(orphans) > 8 else ""))

    # ---- flow groups
    flow_ids = sorted(
        (el.get("id") for el in layers if el.get("id") and re.fullmatch(r"f\d+", el.get("id"))),
        key=lambda s: int(s[1:]))
    for fid in flow_ids:
        n = fid[1:]
        g = next(el for el in layers if el.get("id") == fid)
        geo = [c for c in g.iter() if c.get("id") == f"p{n}"]
        if not geo:
            errors.append(f"flow '{fid}' has no geometry element with id='p{n}'")
        elif tag(geo[0]) not in GEOMETRY:
            errors.append(f"'p{n}' is a <{tag(geo[0])}> — flow geometry must be "
                          "line / polyline / polygon / path")
        if not any("badge" in (c.get("class") or "").split() for c in g.iter()):
            warns.append(f"flow '{fid}' has no <g class=\"badge\"> — the number "
                         "will not pop on step entry")

    if flow_ids:
        nums = [int(f[1:]) for f in flow_ids]
        expected = list(range(1, len(nums) + 1))
        if nums != expected:
            warns.append(f"flow ids are {flow_ids} — expected a contiguous f1..f{len(nums)}")

    # ---- cross-check the steps file
    if steps_path:
        cfg = json.loads(steps_path.read_text(encoding="utf-8"))
        present = set(ids)
        for s in cfg.get("steps", []):
            for key in ("path", "flow"):
                v = s.get(key)
                if v and v not in present:
                    errors.append(f"step {s.get('n')}: {key} id '{v}' not in the SVG")
            for lid in s.get("focus", []):
                if lid not in present:
                    errors.append(f"step {s.get('n')}: focus id '{lid}' not in the SVG")
                elif not any(l.get("id") == lid for l in layers):
                    warns.append(f"step {s.get('n')}: focus id '{lid}' exists but is "
                                 "not a .layer — it will not highlight")
        for lid in cfg.get("alwaysVisible", []):
            if lid not in present:
                warns.append(f"alwaysVisible id '{lid}' not in the SVG")

    for w in warns:
        print(f"  warn:  {w}")
    for e in errors:
        print(f"  ERROR: {e}")
    if not warns and not errors:
        print(f"ok — {len(layers)} layers, {len(flow_ids)} flows, no problems found")
    else:
        print(f"\n{len(errors)} error(s), {len(warns)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
