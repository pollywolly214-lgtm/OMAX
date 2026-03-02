from __future__ import annotations

import json
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Literal

from omax_preview.converters import CONVERTERS, ConverterError, ConvertResult


Status = Literal["queued", "processing", "done", "error"]


@dataclass
class PreviewJob:
    id: str
    status: Status
    input_url: str
    ext: str
    created_at: float
    preview_svg_url: str | None = None
    preview_png_url: str | None = None
    metadata_url: str | None = None
    preview_quality: str | None = None
    converter_used: str | None = None
    error_message: str | None = None


class PreviewRepository:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = self.root / "preview_jobs.json"
        if not self.db.exists():
            self.db.write_text("{}")

    def _read(self):
        return json.loads(self.db.read_text())

    def _write(self, data):
        self.db.write_text(json.dumps(data, indent=2))

    def save(self, job: PreviewJob):
        data = self._read()
        data[job.id] = asdict(job)
        self._write(data)

    def get(self, job_id: str) -> PreviewJob | None:
        data = self._read().get(job_id)
        return PreviewJob(**data) if data else None


class PreviewService:
    MAX_UPLOAD_BYTES = 200 * 1024 * 1024

    def __init__(self, storage_root: Path):
        self.storage = storage_root
        self.uploads = self.storage / "uploads"
        self.previews = self.storage / "previews"
        self.uploads.mkdir(parents=True, exist_ok=True)
        self.previews.mkdir(parents=True, exist_ok=True)
        self.repo = PreviewRepository(self.storage)

    def create_upload_job(self, source_file: Path) -> PreviewJob:
        if source_file.stat().st_size > self.MAX_UPLOAD_BYTES:
            raise ValueError("Upload exceeds size limit")

        job_id = uuid.uuid4().hex
        ext = source_file.suffix.lower()
        saved = self.uploads / f"{job_id}{ext}"
        shutil.copy2(source_file, saved)

        job = PreviewJob(
            id=job_id,
            status="queued",
            input_url=str(saved),
            ext=ext,
            created_at=time.time(),
        )
        self.repo.save(job)
        return job

    def get_status(self, job_id: str) -> PreviewJob | None:
        return self.repo.get(job_id)


class PreviewWorker:
    def __init__(self, service: PreviewService):
        self.service = service

    def process_job(self, job_id: str):
        job = self.service.repo.get(job_id)
        if not job:
            raise KeyError(job_id)

        job.status = "processing"
        self.service.repo.save(job)

        try:
            self._run(job)
        except Exception as exc:
            job.status = "error"
            job.error_message = "Preview generation failed"
            self.service.repo.save(job)
            with (self.service.storage / "worker_errors.log").open("a", encoding="utf-8") as fh:
                fh.write(f"{job.id}: {exc}\n")

    def _run(self, job: PreviewJob):
        input_path = Path(job.input_url)
        preview_dir = self.service.previews / job.id
        preview_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="omax_preview_") as tmp:
            tmp_dir = Path(tmp)
            conversion = self._convert(job.ext, input_path, tmp_dir)

            if conversion.output_dxf:
                from subprocess import run

                meta_path = preview_dir / "metadata.json"
                svg_path = preview_dir / "preview.svg"
                png_path = preview_dir / "preview.png"
                cmd = [
                    "python3",
                    str(Path(__file__).resolve().parent.parent / "render_dxf.py"),
                    str(conversion.output_dxf),
                    str(svg_path),
                    "--png",
                    str(png_path),
                    "--meta",
                    str(meta_path),
                ]
                result = run(cmd, capture_output=True, text=True, timeout=90)
                if result.returncode != 0:
                    raise RuntimeError(result.stderr or "DXF render failed")
            elif conversion.output_svg:
                svg_path = preview_dir / "preview.svg"
                shutil.copy2(conversion.output_svg, svg_path)
                png_path = preview_dir / "preview.png"
                meta_path = preview_dir / "metadata.json"
                meta_path.write_text(
                    json.dumps(
                        {
                            "bbox": None,
                            "viewBox": None,
                            "units": "unknown",
                            "previewQuality": conversion.preview_quality,
                            "converterUsed": conversion.converter_used,
                        },
                        indent=2,
                    )
                )
            else:
                raise RuntimeError("No conversion artifact generated")

        job.status = "done"
        job.preview_svg_url = str(preview_dir / "preview.svg")
        job.preview_png_url = str(preview_dir / "preview.png") if (preview_dir / "preview.png").exists() else None
        job.metadata_url = str(preview_dir / "metadata.json")
        job.preview_quality = conversion.preview_quality
        job.converter_used = conversion.converter_used
        self.service.repo.save(job)

    def _convert(self, ext: str, input_path: Path, work_dir: Path) -> ConvertResult:
        errors = []
        for converter in CONVERTERS:
            if not converter.can_handle(ext):
                continue
            try:
                return converter.convert(input_path, work_dir)
            except ConverterError as exc:
                errors.append(f"{converter.name}: {exc}")
                continue
        if ext == ".dxf":
            return ConvertResult(output_dxf=input_path, converter_used="passthrough_dxf", preview_quality="high")
        raise RuntimeError("; ".join(errors) or f"No converter for {ext}")
