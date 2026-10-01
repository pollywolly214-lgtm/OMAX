"use strict";
const zlib=require("node:zlib");
const xml=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
function zip(files){
  const chunks=[],central=[];let offset=0;
  for(const[name,value]of Object.entries(files)){
    const data=Buffer.from(value),raw=zlib.deflateRawSync(data),nb=Buffer.from(name),local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(raw.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nb.length,26);chunks.push(local,nb,raw);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(raw.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nb.length,28);c.writeUInt32LE(offset,42);central.push(c,nb);offset+=local.length+nb.length+raw.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,cd,end]);
}
const column=i=>{let s="";for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
function workbook(sheets){
  const files={};files["xl/workbook.xml"]=`<workbook xmlns:r="urn:relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" r:id="r${i}"/>`).join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"]=`<Relationships>${sheets.map((s,i)=>`<Relationship Id="r${i}" Target="worksheets/sheet${i}.xml"/>`).join("")}</Relationships>`;
  sheets.forEach((sheet,i)=>{const cells=[sheet.headers,...sheet.rows.map(row=>sheet.headers.map(h=>row[h]??""))];files[`xl/worksheets/sheet${i}.xml`]=`<worksheet><sheetData>${cells.map((values,r)=>`<row r="${r+1}">${values.map((v,c)=>typeof v==="number"?`<c r="${column(c)}${r+1}"><v>${v}</v></c>`:`<c r="${column(c)}${r+1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;});
  return zip(files);
}
function file(name,sheets){const bytes=workbook(sheets);return{name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}
module.exports={zip,workbook,file};
