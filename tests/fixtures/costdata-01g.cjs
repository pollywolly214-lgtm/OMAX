"use strict";
const {fixture:protectedState}=require("./mdel01-maintenance-task"),{fixture:costHistory}=require("./costdata-01f.cjs");
function fixture(){
  const state={...protectedState(),...costHistory()};
  state.settingsFolders=[{id:"root",name:"All Tasks",parent:null,order:2},{id:"integration-category",name:"Synthetic integration",parent:"root",order:1}];
  state.tasksInterval.forEach((task,index)=>Object.assign(task,{templateId:task.id,cat:"integration-category",parentTask:null,order:index+1,pn:"",manualLink:"",storeLink:"",note:""}));
  state.inventory=state.tasksInterval.map((task,index)=>{const id=index?"integration-stock-"+index:"integration-stock";task.inventoryId=id;return {id,name:"Synthetic linked stock "+index,linkedTaskId:task.id,qtyNew:1,qtyOld:0};});
  state.inventoryFolders=[];
  return state;
}
module.exports={fixture};
