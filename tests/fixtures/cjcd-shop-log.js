"use strict";
// Synthetic identities only. One row per recorded cut; matching descriptions
// intentionally remain separate records. No production records are imported.
const rows = [
  ["01", "1241", '51" x 8"', '1/2" A36', 0.5],
  ["01", "1242", 'Test Shoe, 19" x 4"', '1.25" RC50', null],
  ["01", "1242", '75" x 46"', '1.25" RC50', 22],
  ["06", "1241", 'Endplates, 46" x 53"', '1/4" A36', 23/60],
  ["06", "1241", '72" x 20"', '1/2" A36', 1.9],
  ["06", "1241", '8" x 51"', '1/2" A36', 28/60],
  ["06", "1251", '25" x 39"', '1/16" Aluminum', 4/60],
  ["06", "1251", '25" x 39"', '1/16" Aluminum', 4/60],
  ["07", "1242", 'Backing Plate, 19" x 3"', '3/8" RC50', 5/60],
  ["07", "1242", 'Backing Plate, 19" x 3"', '3/8" RC50', 5/60],
  ["07", "1242", 'Backing Plate, 55" x 47"', '3/8" RC50', 1.8],
  ["07", "1247", 'Backing Plate, 17" x 4"', '3/8" RC50', 5/60],
  ["07", "1247", 'Backing Plate, 33" x 47"', '3/8" RC50', 1.2],
  ["07", "1247", 'Test Shoe, 17" x 4"', '1.25" RC50', 0.5],
  ["08", "1247", '114" x 44"', '1.25" RC50', 25.2],
  ["14", "1242", '88" x 48"', '0.375" RC50', 2.8]
];
const jobs = () => rows.map(([day, projectNumber, name, material, actualHours], index) => ({
  id:`synthetic-cjcd-${index+1}`, name, projectNumber, material, actualHours,
  materialQty:1, cat:`project-${projectNumber}`, cutNumber:`C${String(index+1).padStart(3,"0")}`,
  startISO:"2026-10-02", dueISO:"2026-10-05", completedAtISO:`2026-10-${day}`,
  files:[{fileId:`fixture-file-${index}`, name:"fixture.dxf"}], manualLogs:[],
  importProvenance:{sourceRowNumber:index+1}, notes:"preserve synthetic history"
}));
module.exports = { jobs };
