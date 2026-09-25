const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDxf, primitivesFromDxf, renderCadToSvgDataUrl } = require("../js/preview/dxfPreview.js");

const pairs = entries => entries.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
const dxf = (entities, extras = []) => pairs([
  [0,"SECTION"],[2,"HEADER"],[0,"ENDSEC"], ...extras,
  [0,"SECTION"],[2,"ENTITIES"], ...entities, [0,"ENDSEC"],[0,"EOF"]
]);
const entity = (type, fields) => [[0,type], ...fields];
const svg = source => decodeURIComponent(renderCadToSvgDataUrl(source).split(",")[1]);

const line = entity("LINE", [[10,1],[20,2],[11,6],[21,8]]);

test("LINE rendering remains correct and establishes coordinate extents", () => {
  const output = svg(dxf(line));
  assert.match(output, /<path d="M1 -2 L6 -8"/);
  assert.match(output, /viewBox="0\.52 -8\.48 5\.96 6\.96"/);
});

test("ARC and CIRCLE produce sampled curved paths whose extents include curvature", () => {
  const source = dxf([
    ...entity("ARC", [[10,0],[20,0],[40,10],[50,0],[51,180]]),
    ...entity("CIRCLE", [[10,30],[20,0],[40,5]])
  ]);
  const parsed = primitivesFromDxf(parseDxf(source));
  assert.equal(parsed.length, 2);
  assert.ok(parsed[0].points.length > 10, "arc is not replaced by one straight segment");
  assert.ok(parsed[1].points.length > 20);
  assert.deepEqual(parsed[0].points[0].map(Math.round), [10,0]);
  assert.ok(parsed[0].points.some(point => point[1] > 9.9));
  assert.match(svg(source), /<path d="M10 0 L/);
});

test("LWPOLYLINE honors bulges and the closed flag", () => {
  const source = dxf(entity("LWPOLYLINE", [[70,1],[10,0],[20,0],[42,1],[10,10],[20,0],[10,10],[20,10]]));
  const [primitive] = primitivesFromDxf(parseDxf(source));
  assert.equal(primitive.closed, true);
  assert.ok(primitive.points.length > 20);
  assert.ok(primitive.points.some(point => Math.abs(point[1]) > 4.9), "semicircular bulge contributes to bounds");
  assert.match(svg(source), / Z"/);
});

test("classic POLYLINE consumes VERTEX records through SEQEND", () => {
  const source = dxf([
    ...entity("POLYLINE", [[70,1]]),
    ...entity("VERTEX", [[10,0],[20,0]]),
    ...entity("VERTEX", [[10,4],[20,0],[42,-0.5]]),
    ...entity("VERTEX", [[10,4],[20,4]]), [0,"SEQEND"]
  ]);
  const parsed = parseDxf(source);
  assert.equal(parsed.entities.length, 1);
  assert.equal(parsed.entities[0].vertices.length, 3);
  const [primitive] = primitivesFromDxf(parsed);
  assert.equal(primitive.closed, true);
  assert.ok(primitive.points.length > 8);
});

test("BLOCK/INSERT applies base point, insertion, scale, rotation, and array spacing", () => {
  const blockSection = [
    [0,"SECTION"],[2,"BLOCKS"],
    ...entity("BLOCK", [[2,"CUT"],[10,1],[20,1]]),
    ...entity("LINE", [[10,1],[20,1],[11,3],[21,1]]),
    [0,"ENDBLK"],[0,"ENDSEC"]
  ];
  const source = dxf(entity("INSERT", [[2,"CUT"],[10,10],[20,20],[41,2],[42,3],[50,90],[70,2],[44,5]]), blockSection);
  const primitives = primitivesFromDxf(parseDxf(source));
  assert.equal(primitives.length, 2);
  assert.deepEqual(primitives[0].points.map(p => p.map(Math.round)), [[10,20],[10,24]]);
  assert.deepEqual(primitives[1].points.map(p => p.map(Math.round)), [[10,30],[10,34]]);
});

test("ELLIPSE and SPLINE use bounded multi-segment approximations", () => {
  const source = dxf([
    ...entity("ELLIPSE", [[10,0],[20,0],[11,10],[21,0],[40,0.5],[41,0],[42,6.283185307179586]]),
    ...entity("SPLINE", [[70,8],[71,2],[72,6],[73,3],[40,0],[40,0],[40,0],[40,1],[40,1],[40,1],[10,20],[20,0],[10,25],[20,10],[10,30],[20,0]])
  ]);
  const primitives = primitivesFromDxf(parseDxf(source));
  assert.equal(primitives.length, 2);
  assert.ok(primitives[0].points.length >= 64);
  assert.ok(primitives[0].points.some(point => point[1] > 4.9));
  assert.ok(primitives[1].points.length >= 64);
  assert.ok(primitives[1].points.some(point => point[1] > 4.9));
});

test("POINT markers and escaped TEXT/MTEXT annotations appear in SVG", () => {
  const output = svg(dxf([
    ...entity("POINT", [[10,2],[20,3]]),
    ...entity("TEXT", [[10,4],[20,5],[40,2],[1,"A&B"]]),
    ...entity("MTEXT", [[10,7],[20,8],[40,3],[3,"First\\P"],[1,"Second"]])
  ]));
  assert.match(output, /M[\d.]+ -3 L[\d.]+ -3 M2/);
  assert.match(output, />A&amp;B<\/text>/);
  assert.match(output, />First\nSecond<\/text>/);
});

test("hidden layers/entities are omitted while visible layer color is retained", () => {
  const tables = [[0,"SECTION"],[2,"TABLES"],[0,"TABLE"],[2,"LAYER"],
    ...entity("LAYER", [[2,"CUT"],[62,1],[70,0]]),
    ...entity("LAYER", [[2,"HIDDEN"],[62,-3],[70,0]]),
    [0,"ENDTAB"],[0,"ENDSEC"]];
  const source = dxf([
    ...entity("LINE", [[8,"CUT"],[10,0],[20,0],[11,1],[21,1]]),
    ...entity("LINE", [[8,"HIDDEN"],[10,0],[20,0],[11,9],[21,9]]),
    ...entity("CIRCLE", [[60,1],[10,20],[20,20],[40,2]])
  ], tables);
  const primitives = primitivesFromDxf(parseDxf(source));
  assert.equal(primitives.length, 1);
  assert.equal(primitives[0].color, "#ff0000");
});

test("unsupported and malformed entities fail gracefully", () => {
  const source = dxf([...entity("HATCH", [[10,100],[20,100]]), ...entity("ARC", [[10,"bad"],[20,0],[40,4]])]);
  assert.equal(renderCadToSvgDataUrl(source), "");
});

test("preview API does not reference persistent application or browser storage", () => {
  const implementation = require("node:fs").readFileSync(require.resolve("../js/preview/dxfPreview.js"), "utf8");
  for (const forbidden of ["localStorage", "cuttingJobs", "completedCuttingJobs", "Firestore", "cutting_job_files_v1"])
    assert.equal(implementation.includes(forbidden), false, forbidden);
});
