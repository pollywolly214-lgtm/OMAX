(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.JobMaterialCalculator=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  function calculate({material,thicknessInches,pathLengthFt,pathWidthFt,wasteFactor}){
    const thickness=Number(thicknessInches),length=Number(pathLengthFt),width=Number(pathWidthFt);
    const density=Number(material?.density),pricePerLb=Number(material?.pricePerLb),waste=Number(wasteFactor);
    if(!material||![thickness,length,width,density,pricePerLb,waste].every(Number.isFinite)||
      thickness<=0||length<=0||width<=0||density<=0||pricePerLb<0||waste<0)return null;
    const areaSqIn=length*width*144;
    const weight=thickness*areaSqIn*density*(1+waste/100);
    return Object.freeze({areaSqIn,weight,totalCost:weight*pricePerLb});
  }

  return Object.freeze({calculate});
});
