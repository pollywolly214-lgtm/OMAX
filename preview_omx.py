from __future__ import annotations

import math
from pathlib import Path

EPS = 1e-9


def _is_blank_or_comment(line: str) -> bool:
    s = line.strip()
    return (not s) or s.startswith("//")


def parse_omx_points(path: str | Path):
    """Return tuples of (x, y, bow, q, offset_side) from [0] OMX records."""
    txt = Path(path).read_text(errors="ignore")
    rows: list[tuple[float, float, float, int, int]] = []

    for raw in txt.splitlines():
        if _is_blank_or_comment(raw):
            continue

        s = raw.strip()
        if not s.startswith("[0]"):
            continue

        after = s.split("]", 1)[1].lstrip()
        if after.startswith(","):
            after = after[1:]

        tokens = [t.strip() for t in after.split(",")]
        if len(tokens) < 8:
            continue

        try:
            x = float(tokens[0])
            y = float(tokens[1])
            bow = float(tokens[5])
            q = int(float(tokens[6]))
            side = int(float(tokens[7]))
        except Exception:
            continue

        rows.append((x, y, bow, q, side))

    return rows


def bulge_arc_poly(p0: tuple[float, float], p1: tuple[float, float], bulge: float, steps: int = 32):
    if abs(bulge) < EPS:
        return [p0, p1]

    x0, y0 = p0
    x1, y1 = p1
    chord = math.hypot(x1 - x0, y1 - y0)
    if chord < EPS:
        return [p0]

    theta = 4.0 * math.atan(bulge)
    sin_half = math.sin(abs(theta) / 2.0)
    if abs(sin_half) < EPS:
        return [p0, p1]

    r = chord / (2.0 * sin_half)

    mx, my = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    ux, uy = (x1 - x0) / chord, (y1 - y0) / chord
    nx, ny = -uy, ux

    h = r * math.cos(abs(theta) / 2.0)
    cx = mx + (h * nx if bulge > 0 else -h * nx)
    cy = my + (h * ny if bulge > 0 else -h * ny)

    a0 = math.atan2(y0 - cy, x0 - cx)

    pts = []
    arc_steps = max(8, min(96, int(steps)))
    for i in range(arc_steps + 1):
        t = i / arc_steps
        a = a0 + (t * theta)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    return pts


def preview_omx_to_polylines(path: str | Path):
    rows = parse_omx_points(path)
    if not rows:
        return []

    polylines: list[list[tuple[float, float]]] = []
    prev: tuple[float, float] | None = None

    for x, y, bow, q, side in rows:
        cur = (x, y)
        if prev is None:
            prev = cur
            continue

        if math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < EPS:
            prev = cur
            continue

        if abs(bow) < 1e-8:
            polylines.append([prev, cur])
        else:
            polylines.append(bulge_arc_poly(prev, cur, bow, steps=32))

        prev = cur

    return polylines
