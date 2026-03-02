from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

try:
    import ezdxf
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"ezdxf is required: {exc}")


def arc_to_segments(cx, cy, r, start, end):
    while end < start:
        end += 360
    sweep = max(1, end - start)
    steps = max(12, math.ceil(sweep / 8))
    points = []
    for i in range(steps + 1):
        ang = math.radians(start + (sweep * i / steps))
        points.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return points


def points_to_segments(points, closed=False):
    out = []
    for i in range(len(points) - 1):
        out.append((points[i], points[i + 1]))
    if closed and len(points) > 2:
        out.append((points[-1], points[0]))
    return out


def extract_segments(path: Path):
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    segments = []
    for e in msp:
        try:
            t = e.dxftype()
            if t == "LINE":
                segments.append(((e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)))
            elif t == "CIRCLE":
                pts = arc_to_segments(e.dxf.center.x, e.dxf.center.y, e.dxf.radius, 0, 360)
                segments.extend(points_to_segments(pts))
            elif t == "ARC":
                pts = arc_to_segments(e.dxf.center.x, e.dxf.center.y, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle)
                segments.extend(points_to_segments(pts))
            elif t == "LWPOLYLINE":
                pts = [(p[0], p[1]) for p in e.get_points()]
                segments.extend(points_to_segments(pts, bool(e.closed)))
            elif t == "POLYLINE":
                pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
                segments.extend(points_to_segments(pts, bool(e.is_closed)))
        except Exception:
            continue
    return segments


def render_svg(segments, out_svg: Path):
    if not segments:
        raise RuntimeError("No renderable DXF entities")
    xs = [p[0] for s in segments for p in s]
    ys = [p[1] for s in segments for p in s]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    w = max(1.0, maxx - minx)
    h = max(1.0, maxy - miny)
    pad = max(w, h) * 0.08
    vb = (minx - pad, -(maxy + pad), w + 2 * pad, h + 2 * pad)
    stroke = max(vb[2], vb[3]) / 450

    d_parts = []
    for (x1, y1), (x2, y2) in segments:
        d_parts.append(f"M {x1} {-y1} L {x2} {-y2}")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}">'
        f'<rect x="{vb[0]}" y="{vb[1]}" width="{vb[2]}" height="{vb[3]}" fill="#ffffff"/>'
        f'<path d="{" ".join(d_parts)}" fill="none" stroke="#243b53" stroke-width="{stroke}" stroke-linecap="round"/>'
        "</svg>"
    )
    out_svg.write_text(svg)

    return {
        "bbox": {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy},
        "viewBox": f"{vb[0]} {vb[1]} {vb[2]} {vb[3]}",
        "units": "unknown",
    }


def maybe_render_png(svg_path: Path, png_path: Path):
    try:
        import cairosvg

        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path))
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_dxf")
    ap.add_argument("output_svg")
    ap.add_argument("--png", dest="output_png")
    ap.add_argument("--meta", dest="output_meta")
    args = ap.parse_args()

    segments = extract_segments(Path(args.input_dxf))
    meta = render_svg(segments, Path(args.output_svg))

    if args.output_png:
        maybe_render_png(Path(args.output_svg), Path(args.output_png))

    if args.output_meta:
        Path(args.output_meta).write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
