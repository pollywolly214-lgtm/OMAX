# OMAX Preview Pipeline (ORD/OMX/DXF)

## Key behavior from OMAX docs

- When opening ORD/OMX in OMAX LAYOUT, the file is converted to DXF for display.
- ORD is not directly editable.
- Opening OMX loads XY geometry for display (Z/tool info may be removed in display conversion).

This is why the preferred server pipeline is:

`ORD/OMX -> OMAX LAYOUT conversion -> DXF -> server DXF renderer -> SVG/PNG`

## Implemented architecture

- Frontend upload flow should call:
  - `POST /api/uploads`
  - `GET /api/previews/:jobId`
- Backend job service/worker:
  - Store original upload.
  - Enqueue job state (`queued`, `processing`, `done`, `error`).
  - Convert ORD/OMX to DXF via pluggable converter strategy.
  - Render DXF to SVG/PNG using `render_dxf.py`.
  - Persist metadata: bbox, viewBox, units (if known), converterUsed, previewQuality.

## Converter strategies (in order)

1. `OmaxLayoutScriptConverter` (preferred, Windows)
   - Uses env vars: `OMAX_LAYOUT_EXE`, `OMAX_SCRIPT_PATH`, `OMAX_SCRIPT_ARGS`.
   - Uses `scripts/convert_to_dxf.omaxscript` template.
2. `OmaxUiAutomationConverter` (fallback, Windows)
   - Uses env vars: `OMAX_AHK_EXE`, `OMAX_UI_SCRIPT_PATH`.
   - Template script provided at `scripts/omax_ui_automation.ahk`.
3. `OmxTextFallbackConverter` (last resort, cross-platform)
   - Best-effort XY extraction from text payload.
   - Outputs approximate SVG preview with `previewQuality=approx`.

## Open dialog requirement

Automation must use **File > Open** for OMAX-created files and explicitly set file filter to include `.ord/.omx` (or `*.*`) before opening, because some installations default to DXF-only visible filters.

Only if File > Open fails should automation attempt **Import from Other CAD**.

## Security/reliability requirements

- Do not execute uploaded files.
- Treat uploads strictly as data.
- Use isolated temp working directory for each job.
- Enforce file size caps and conversion/render timeouts.
- On failure: keep original upload, mark job `error`, return safe error message.

## Reference URLs

- https://webhelp.omax.com/globalmax/content/wh-globalmax/layout/help_file_open.htm
- https://webhelp.omax.com/globalmax/content/wh-globalmax/layout/help_importing_files.htm
- https://webhelp.omax.com/globalmax/content/wh-globalmax/layout/xdatacodes.htm
- https://knowledgebase.omax.com/protomax/content/wh-protomax/omax_scripting_manual.pdf
- https://sweng.omax.com/ReadMe_Files/ReadMe/EnglishUSA/rev_list.htm
