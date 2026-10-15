"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const dimensions=require("../js/cuttingJobDimensions"),calculator=require("../js/materialCalculator");
const examples=[['1.5',1.5,`1'-6"`],['24"',2,`2'-0"`],['3/12',.25,`0'-3"`],['0.5005',.5005,`0'-6"`],['1.125',1.125,`1'-1 1/2"`]];
for(const [text,feet,display] of examples)test(`${text} keeps ${feet} feet and displays ${display}`,()=>{
  assert.equal(dimensions.parseFeet(text),feet);assert.equal(dimensions.formatFeet(feet),display);
  assert.equal(dimensions.parseFeet(display),Math.round(feet*192)/192);
});
test("sixteenths reduce and roll over at twelve inches",()=>{
  for(const [feet,display]of [[1/192,`0'-0 1/16"`],[5/192,`0'-0 5/16"`],[8/192,`0'-0 1/2"`],[11.99/12,`1'-0"`],[(11+31/32)/12,`1'-0"`]])assert.equal(dimensions.formatFeet(feet),display);
  assert.equal(dimensions.parseFeet(`1' 1 1/2"`),1.125);
  assert.equal(dimensions.parseFeet(`1′-1 1/2″`),1.125);
  assert.equal(dimensions.parseFeet(`1 1/2"`),.125);
  assert.equal(dimensions.parseFeet(`1'`),1);
});
test("malformed, nonfinite and negative measurements are rejected",()=>{
  for(const text of ['','.', '1/0','1/2/3','1+2','eval(1)','0x10','Infinity','NaN','1e309','1/1e309','-1','-1/-2','1/-2',`-24"`,`1'-`,`1'--3"`,`1'-3`,`1 3/2"`,`24" junk`])assert.equal(Number.isNaN(dimensions.parseFeet(text)),true,text);
  assert.equal(dimensions.parseFeet('2e-1'),.2);
});
function input(value){return{value,dataset:{},setCustomValidity(message){this.validationMessage=message;}};}
test("live preview preserves input/caret and blur preserves authoritative precision through draft and calculations",()=>{
  const field=input('.5005'),preview={textContent:''};field.selectionStart=3;
  dimensions.updateInput(field,preview);assert.equal(field.value,'.5005');assert.equal(field.selectionStart,3);
  assert.match(preview.textContent,/0'-6"/);
  dimensions.updateInput(field,preview,true);assert.equal(field.value,`0'-6"`);
  assert.equal(dimensions.readInput(field),.5005);assert.equal(dimensions.draftValue(field),'0.5005');
  const args={material:{density:.284,pricePerLb:2},thicknessInches:.25,pathWidthFt:4,wasteFactor:10};
  assert.deepEqual(calculator.calculate({...args,pathLengthFt:dimensions.readInput(field)}),calculator.calculate({...args,pathLengthFt:.5005}));
  assert.notDeepEqual(calculator.calculate({...args,pathLengthFt:dimensions.readInput(field)}),calculator.calculate({...args,pathLengthFt:.5}));
  const rerendered=input(dimensions.draftValue(field));assert.equal(dimensions.readInput(rerendered),.5005);
  field.value='24"';assert.equal(dimensions.readInput(field),2,'an actual edit replaces the retained precision');
});
test("invalid and negative dimensions retain editable input and set form validity; existing records remain untouched",()=>{
  const original={pathLength:.5005,pathWidth:1.125,thickness:.333333333333},before=structuredClone(original);
  for(const value of ['-1','0','1/0']){const field=input(value);dimensions.updateInput(field,{},true);assert.ok(field.validationMessage);assert.equal(field.value,value);}
  dimensions.formatFeet(original.pathLength);dimensions.parseFeet(String(original.pathWidth));assert.deepEqual(original,before);
});
