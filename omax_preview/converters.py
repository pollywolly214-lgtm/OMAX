from __future__ import annotations

import abc
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


class ConverterError(RuntimeError):
    pass


@dataclass
class ConvertResult:
    output_dxf: Path | None = None
    output_svg: Path | None = None
    preview_quality: str = "high"
    converter_used: str = ""


class Converter(abc.ABC):
    name = "base"

    @abc.abstractmethod
    def can_handle(self, ext: str) -> bool:
        raise NotImplementedError

    @abc.abstractmethod
    def convert(self, input_path: Path, work_dir: Path, timeout_s: int = 120) -> ConvertResult:
        raise NotImplementedError


class OmaxLayoutScriptConverter(Converter):
    name = "omax_layout_script"

    def can_handle(self, ext: str) -> bool:
        return ext in {".ord", ".omx"}

    def convert(self, input_path: Path, work_dir: Path, timeout_s: int = 180) -> ConvertResult:
        exe = os.getenv("OMAX_LAYOUT_EXE")
        script = os.getenv("OMAX_SCRIPT_PATH")
        if not exe or not script:
            raise ConverterError("OMAX_LAYOUT_EXE / OMAX_SCRIPT_PATH not configured")

        output_dxf = work_dir / "output.dxf"
        args_file = work_dir / "omax_script_args.json"
        args_file.write_text(json.dumps({"input_path": str(input_path), "output_dxf_path": str(output_dxf)}))

        cmd = [exe, script]
        extra = os.getenv("OMAX_SCRIPT_ARGS", "").strip()
        if extra:
            cmd.extend(extra.split())
        cmd.append(str(args_file))

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        if proc.returncode != 0:
            raise ConverterError(f"OMAX script failed ({proc.returncode})")
        if not output_dxf.exists() or output_dxf.stat().st_size == 0:
            raise ConverterError("OMAX script did not produce output.dxf")

        return ConvertResult(output_dxf=output_dxf, preview_quality="high", converter_used=self.name)


class OmaxUiAutomationConverter(Converter):
    name = "omax_ui_automation"

    def can_handle(self, ext: str) -> bool:
        return ext in {".ord", ".omx"}

    def convert(self, input_path: Path, work_dir: Path, timeout_s: int = 180) -> ConvertResult:
        ahk = os.getenv("OMAX_AHK_EXE")
        script = os.getenv("OMAX_UI_SCRIPT_PATH")
        if not ahk or not script:
            raise ConverterError("OMAX_AHK_EXE / OMAX_UI_SCRIPT_PATH not configured")

        output_dxf = work_dir / "output.dxf"
        proc = subprocess.run(
            [ahk, script, str(input_path), str(output_dxf)],
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
        if proc.returncode != 0:
            raise ConverterError(f"OMAX UI automation failed ({proc.returncode})")
        if not output_dxf.exists() or output_dxf.stat().st_size == 0:
            raise ConverterError("UI automation did not produce output.dxf")

        return ConvertResult(output_dxf=output_dxf, preview_quality="high", converter_used=self.name)


class OmxTextFallbackConverter(Converter):
    name = "omx_text_fallback"

    def can_handle(self, ext: str) -> bool:
        return ext in {".ord", ".omx"}

    def convert(self, input_path: Path, work_dir: Path, timeout_s: int = 60) -> ConvertResult:  # noqa: ARG002
        text = _safe_text(input_path)
        if not text.strip():
            raise ConverterError("No text payload available for approximate conversion")

        points = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            x = _extract_value(line, "X")
            y = _extract_value(line, "Y")
            if x is not None and y is not None:
                points.append((x, y))
                continue
            nums = [n for n in _parse_numbers(line)]
            if len(nums) == 2:
                points.append((nums[0], nums[1]))

        if len(points) < 2:
            raise ConverterError("Unable to extract enough XY points")

        svg_path = work_dir / "output_approx.svg"
        _write_polyline_svg(points, svg_path)
        return ConvertResult(output_svg=svg_path, preview_quality="approx", converter_used=self.name)


def _safe_text(path: Path) -> str:
    data = path.read_bytes()
    text = data.decode("utf-8", errors="ignore").replace("\x00", "")
    if text.strip():
        return text
    return data.decode("latin-1", errors="ignore").replace("\x00", "")


def _extract_value(line: str, axis: str) -> float | None:
    import re

    m = re.search(rf"\b{axis}\s*[:=]?\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)", line, re.IGNORECASE)
    return float(m.group(1)) if m else None


def _parse_numbers(line: str):
    import re

    for match in re.finditer(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", line):
        yield float(match.group(0))


def _write_polyline_svg(points: list[tuple[float, float]], out: Path) -> None:
    min_x = min(p[0] for p in points)
    max_x = max(p[0] for p in points)
    min_y = min(p[1] for p in points)
    max_y = max(p[1] for p in points)
    w = max(1.0, max_x - min_x)
    h = max(1.0, max_y - min_y)
    pad = max(w, h) * 0.08

    d = [f"M {points[0][0]} {-points[0][1]}"]
    for x, y in points[1:]:
        d.append(f"L {x} {-y}")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{min_x-pad} {-max_y-pad} {w+2*pad} {h+2*pad}">'
        f'<rect x="{min_x-pad}" y="{-max_y-pad}" width="{w+2*pad}" height="{h+2*pad}" fill="#fff"/>'
        f'<path d="{" ".join(d)}" fill="none" stroke="#334e68" stroke-width="{max(w,h)/450}"/>'
        "</svg>"
    )
    out.write_text(svg)


CONVERTERS: list[Converter] = [
    OmaxLayoutScriptConverter(),
    OmaxUiAutomationConverter(),
    OmxTextFallbackConverter(),
]
