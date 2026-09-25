# DXF browser preview fidelity

The browser preview is a deliberately dependency-free, memory-only DXF renderer. It parses the verified text and returns an SVG data URL; it does not persist the source bytes, parsed model, or SVG.

## Supported content

- `LINE`
- `LWPOLYLINE`, including per-vertex bulges and closed paths
- legacy `POLYLINE` / `VERTEX` / `SEQEND`, including bulges and closed paths
- `ARC` and `CIRCLE`
- `ELLIPSE`
- rational and non-rational `SPLINE` control points, degrees, knots, and weights
- `BLOCK` / `ENDBLK` definitions and nested `INSERT` references, including block base point, insertion point, X/Y scale, rotation, rectangular row/column arrays, and recursion limits
- `POINT` cross markers
- basic `TEXT` and `MTEXT` placement, height, rotation, paragraph breaks, and XML-safe content
- entity and layer visibility, layer colors, explicit AutoCAD Color Index colors, and geometry-aware view extents

Unsupported records are ignored without preventing supported geometry from rendering. The renderer currently ignores 3D Z coordinates/extrusion directions, thickness/line type/line weight, paper-space viewport semantics, dimension/hatch/solid/trace/image/leader geometry, text fonts and full MTEXT formatting, true-color values, and spline fit-point-only definitions.

## Curve approximation

SVG output uses bounded polylines for portability under arbitrary nested block transforms. A full circle or ellipse uses 64 segments; partial arcs and polyline bulges use a proportional segment count with a minimum of four. Splines use at least 64 samples (or 12 per control point, whichever is greater) evaluated with the rational de Boor algorithm. This preserves curved extents and avoids replacing an arc or bulge with a single chord, but it is an approximation rather than an analytic SVG curve.
