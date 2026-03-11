"""Preview engine for DXF/OMX/ORD files.

This module provides a resilient preview pipeline that always returns a PNG path,
falling back to a placeholder preview when geometry cannot be extracted.
"""

from __future__ import annotations

from dataclasses import dataclass
import importlib
import importlib.util
import math
import re
import struct
from pathlib import Path
from typing import Iterable
import zlib

from preview_omx import preview_omx_to_polylines


MAX_BYTES_READ = 8 * 1024 * 1024
MAX_OMX_POINTS = 25000


@dataclass(frozen=True)
class PreviewResult:
    output_path: Path
    mode: str
    reason: str = ""


def preview_file(file_path: str | Path, output_path: str | Path | None = None, _visited: set[Path] | None = None) -> Path:
    """Generate a preview PNG for *file_path* and return the written PNG path.

    The router is extension-based and intentionally resilient:
    - .dxf => geometry preview via ezdxf + matplotlib when available
    - .omx => best-effort toolpath extraction from binary float32 pairs
    - .ord => metadata/reference lookup and recursive preview of linked layout
    - others => placeholder
    """

    target = Path(file_path).expanduser().resolve()
    if _visited is None:
        _visited = set()

    if target in _visited:
        return render_placeholder(target, "Recursive reference detected", output_path).output_path
    _visited.add(target)

    if output_path is None:
        output = target.with_suffix(".preview.png")
    else:
        output = Path(output_path).expanduser().resolve()
        if output.is_dir():
            output = output / f"{target.stem}.preview.png"

    if not target.exists() or not target.is_file():
        return render_placeholder(target, "File not found", output).output_path

    ext = target.suffix.lower()
    if ext == ".dxf":
        return preview_dxf(target, output).output_path
    if ext == ".omx":
        return render_placeholder(target, "OMX preview is disabled; upload DXF or ORD", output).output_path
    if ext == ".ord":
        return preview_ord(target, output, _visited).output_path

    return render_placeholder(target, "Preview not supported for this format", output).output_path


def preview_dxf(file_path: str | Path, output_path: str | Path | None = None) -> PreviewResult:
    target = Path(file_path).expanduser().resolve()
    output = _resolve_output(target, output_path)

    ezdxf = _optional_import("ezdxf")
    plt = _optional_import("matplotlib.pyplot")
    if ezdxf is None or plt is None:
        return render_placeholder(target, "DXF preview requires ezdxf + matplotlib", output)

    try:
        doc = ezdxf.readfile(str(target))
        msp = doc.modelspace()
    except Exception as exc:  # parser safety
        return render_placeholder(target, f"DXF parse failed: {exc}", output)

    segments: list[tuple[float, float, float, float]] = []
    for entity in msp:
        try:
            etype = entity.dxftype()
            if etype == "LINE":
                segments.append((entity.dxf.start.x, entity.dxf.start.y, entity.dxf.end.x, entity.dxf.end.y))
            elif etype == "ARC":
                segments.extend(_arc_to_segments(entity.dxf.center.x, entity.dxf.center.y, entity.dxf.radius, entity.dxf.start_angle, entity.dxf.end_angle))
            elif etype in {"LWPOLYLINE", "POLYLINE"}:
                points = _extract_polyline_points(entity)
                segments.extend(_points_to_segments(points, _polyline_closed(entity)))
        except Exception:
            continue

    if not segments:
        return render_placeholder(target, "DXF has no previewable entities", output)

    _plot_segments_png(segments, output, plt)
    return PreviewResult(output, mode="dxf")


def preview_omx(file_path: str | Path, output_path: str | Path | None = None) -> PreviewResult:
    target = Path(file_path).expanduser().resolve()
    output = _resolve_output(target, output_path)

    plt = _optional_import("matplotlib.pyplot")
    if plt is None:
        return render_placeholder(target, "OMX preview requires matplotlib", output)

    try:
        polylines = preview_omx_to_polylines(target)
    except Exception as exc:
        return render_placeholder(target, f"OMX parse failed: {exc}", output)

    if not polylines:
        return render_placeholder(target, "OMX XY geometry not found", output)

    _plot_polylines_png(polylines, output, plt)
    return PreviewResult(output, mode="omx", reason="xy-toolpath")


def preview_ord(file_path: str | Path, output_path: str | Path | None = None, _visited: set[Path] | None = None) -> PreviewResult:
    target = Path(file_path).expanduser().resolve()
    output = _resolve_output(target, output_path)
    visited = _visited or set()

    try:
        blob = target.read_bytes()[:MAX_BYTES_READ]
    except Exception as exc:
        return render_placeholder(target, f"ORD read failed: {exc}", output)

    reference = _extract_ord_reference(blob, target.parent)
    if reference and reference.exists() and reference.is_file():
        try:
            linked_preview = preview_file(reference, output, visited)
            return PreviewResult(Path(linked_preview), mode="ord->linked")
        except Exception as exc:
            return render_placeholder(target, f"ORD linked preview failed: {exc}", output)

    size_text = _human_size(target.stat().st_size)
    reason = f"ORD metadata only • size={size_text}"
    return render_placeholder(target, reason, output)


def render_placeholder(file_path: str | Path, reason: str, output_path: str | Path | None = None) -> PreviewResult:
    target = Path(file_path).expanduser().resolve()
    output = _resolve_output(target, output_path)

    plt = _optional_import("matplotlib.pyplot")
    if plt is not None:
        _matplotlib_placeholder_png(target, reason, output, plt)
    else:
        _minimal_placeholder_png(output)

    return PreviewResult(output, mode="placeholder", reason=reason)


def _resolve_output(file_path: Path, output_path: str | Path | None) -> Path:
    if output_path is None:
        return file_path.with_suffix(".preview.png")

    out = Path(output_path).expanduser().resolve()
    if out.is_dir():
        return out / f"{file_path.stem}.preview.png"
    return out


def _optional_import(module_name: str):
    root = module_name.split('.', 1)[0]
    if importlib.util.find_spec(root) is None:
        return None
    if importlib.util.find_spec(module_name) is None:
        return None
    return importlib.import_module(module_name)


def _arc_to_segments(cx: float, cy: float, radius: float, start_deg: float, end_deg: float) -> list[tuple[float, float, float, float]]:
    if not all(map(math.isfinite, [cx, cy, radius, start_deg, end_deg])) or radius <= 0:
        return []

    start = start_deg
    end = end_deg
    while end < start:
        end += 360.0

    sweep = max(1.0, end - start)
    steps = max(12, int(math.ceil(sweep / 8.0)))

    points: list[tuple[float, float]] = []
    for i in range(steps + 1):
        angle = math.radians(start + (sweep * i / steps))
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))

    return _points_to_segments(points, False)


def _extract_polyline_points(entity) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    try:
        if entity.dxftype() == "LWPOLYLINE":
            for item in entity.get_points():
                out.append((float(item[0]), float(item[1])))
        else:
            for vert in entity.vertices:
                out.append((float(vert.dxf.location.x), float(vert.dxf.location.y)))
    except Exception:
        return []
    return out


def _polyline_closed(entity) -> bool:
    try:
        if entity.dxftype() == "LWPOLYLINE":
            return bool(entity.closed)
        return bool(entity.is_closed)
    except Exception:
        return False


def _points_to_segments(points: Iterable[tuple[float, float]], closed: bool) -> list[tuple[float, float, float, float]]:
    pts = list(points)
    if len(pts) < 2:
        return []

    segs: list[tuple[float, float, float, float]] = []
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        if all(map(math.isfinite, [x1, y1, x2, y2])):
            segs.append((x1, y1, x2, y2))

    if closed and len(pts) > 2:
        x1, y1 = pts[-1]
        x2, y2 = pts[0]
        if all(map(math.isfinite, [x1, y1, x2, y2])):
            segs.append((x1, y1, x2, y2))

    return segs


def _plot_segments_png(segments: list[tuple[float, float, float, float]], output_path: Path, plt) -> None:
    fig, ax = plt.subplots(figsize=(7, 5), dpi=120)
    for x1, y1, x2, y2 in segments:
        ax.plot([x1, x2], [y1, y2], color="#1f3a93", linewidth=0.8)

    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")
    _tight_bounds(ax, segments)
    fig.savefig(output_path, bbox_inches="tight", pad_inches=0.1)
    plt.close(fig)




def _plot_polylines_png(polylines: list[list[tuple[float, float]]], output_path: Path, plt) -> None:
    fig, ax = plt.subplots(figsize=(7, 5), dpi=120)

    segments: list[tuple[float, float, float, float]] = []
    for poly in polylines:
        if len(poly) < 2:
            continue
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        ax.plot(xs, ys, color="#264653", linewidth=0.8)
        for i in range(len(poly) - 1):
            x1, y1 = poly[i]
            x2, y2 = poly[i + 1]
            segments.append((x1, y1, x2, y2))

    if not segments:
        plt.close(fig)
        raise RuntimeError("No drawable OMX polylines")

    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")
    _tight_bounds(ax, segments)
    fig.savefig(output_path, bbox_inches="tight", pad_inches=0.1)
    plt.close(fig)

def _plot_path_png(points: list[tuple[float, float]], output_path: Path, plt) -> None:
    fig, ax = plt.subplots(figsize=(7, 5), dpi=120)
    xs, ys = zip(*points)
    ax.plot(xs, ys, color="#264653", linewidth=0.6)
    ax.set_aspect("equal", adjustable="box")
    ax.axis("off")

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span = max(max_x - min_x, max_y - min_y, 1.0)
    pad = span * 0.08
    ax.set_xlim(min_x - pad, max_x + pad)
    ax.set_ylim(min_y - pad, max_y + pad)

    fig.savefig(output_path, bbox_inches="tight", pad_inches=0.1)
    plt.close(fig)


def _tight_bounds(ax, segments: list[tuple[float, float, float, float]]) -> None:
    xs = [n for seg in segments for n in (seg[0], seg[2])]
    ys = [n for seg in segments for n in (seg[1], seg[3])]

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span = max(max_x - min_x, max_y - min_y, 1.0)
    pad = span * 0.08

    ax.set_xlim(min_x - pad, max_x + pad)
    ax.set_ylim(min_y - pad, max_y + pad)


def _extract_float32_xy_pairs(data: bytes) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    last_x = None
    last_y = None

    upper_bound = len(data) - 8
    for i in range(0, upper_bound, 4):
        x = struct.unpack_from("<f", data, i)[0]
        y = struct.unpack_from("<f", data, i + 4)[0]

        if not (math.isfinite(x) and math.isfinite(y)):
            continue
        if not (-100000.0 <= x <= 100000.0 and -100000.0 <= y <= 100000.0):
            continue

        if last_x is not None and last_y is not None:
            if abs(x - last_x) > 10000 or abs(y - last_y) > 10000:
                continue

        points.append((x, y))
        last_x, last_y = x, y

        if len(points) >= MAX_OMX_POINTS:
            break

    deduped: list[tuple[float, float]] = []
    for pt in points:
        if not deduped or pt != deduped[-1]:
            deduped.append(pt)
    return deduped


def _extract_ord_reference(blob: bytes, base_dir: Path) -> Path | None:
    decoded_utf8 = blob.decode("utf-8", errors="ignore")
    decoded_latin = blob.decode("latin-1", errors="ignore")
    text = decoded_utf8 if len(decoded_utf8) >= len(decoded_latin) else decoded_latin

    pattern = re.compile(r"([A-Za-z]:[\\/][^\n\r\0\"]+\.(?:dxf|omx|ord)|[^\n\r\0\"]+\.(?:dxf|omx|ord))", re.IGNORECASE)
    for raw in pattern.findall(text):
        cleaned = raw.strip().strip('"').replace("\\", "/")
        candidate = Path(cleaned)
        if not candidate.is_absolute():
            candidate = (base_dir / candidate).resolve()
        if candidate.exists() and candidate.is_file():
            return candidate

    return None


def _matplotlib_placeholder_png(file_path: Path, reason: str, output_path: Path, plt) -> None:
    name = file_path.name or "(unknown)"
    ext = file_path.suffix.lower() or "(none)"
    size = _human_size(file_path.stat().st_size) if file_path.exists() else "0 B"

    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=110)
    fig.patch.set_facecolor("#f7f8fb")
    ax.set_facecolor("#ffffff")
    ax.axis("off")

    lines = [
        "Preview not supported for this format",
        f"File: {name}",
        f"Type: {ext}",
        f"Size: {size}",
        f"Reason: {reason}",
    ]

    ax.text(0.03, 0.92, lines[0], transform=ax.transAxes, fontsize=14, fontweight="bold", va="top", color="#1f2d3d")
    y = 0.75
    for line in lines[1:]:
        ax.text(0.03, y, line, transform=ax.transAxes, fontsize=11, va="top", color="#334e68")
        y -= 0.13

    fig.savefig(output_path, bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)


def _minimal_placeholder_png(output_path: Path) -> None:
    width, height = 320, 180
    bg = (245, 247, 252)

    row = b"\x00" + bytes(bg * width)
    raw = row * height
    compressed = zlib.compress(raw, 9)

    def chunk(tag: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return len(payload).to_bytes(4, "big") + tag + payload + crc.to_bytes(4, "big")

    ihdr = chunk(b"IHDR", width.to_bytes(4, "big") + height.to_bytes(4, "big") + b"\x08\x02\x00\x00\x00")
    idat = chunk(b"IDAT", compressed)
    iend = chunk(b"IEND", b"")

    output_path.write_bytes(b"\x89PNG\r\n\x1a\n" + ihdr + idat + iend)


def _human_size(size: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    value = float(size)
    for unit in units:
        if value < 1024.0 or unit == units[-1]:
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{size} B"


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate a preview PNG for CAD-like files.")
    parser.add_argument("file", help="Input file path")
    parser.add_argument("--output", help="Output PNG path (optional)")
    args = parser.parse_args()

    out = preview_file(args.file, args.output)
    print(out)
