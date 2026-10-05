(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CuttingJobImportDownload=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function prepare(filename,data,browser=globalThis){
    const blob=new browser.Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    if(!blob.size||blob.type!=="application/json")throw Error("Backup JSON Blob is invalid.");
    const url=browser.URL.createObjectURL(blob);
    if(typeof url!=="string"||!url.startsWith("blob:")){
      if(url)browser.URL.revokeObjectURL(url);
      throw Error("Backup object URL could not be created.");
    }
    let used=false,disposed=false,cleanupScheduled=false;
    const revoke=()=>{if(disposed)return;disposed=true;browser.URL.revokeObjectURL(url);};
    // Retain the URL long enough for the browser to consume the navigation.
    // This single cleanup timer is unrelated to import progression.
    const delayedRevoke=()=>{if(!cleanupScheduled){cleanupScheduled=true;browser.setTimeout(revoke,60000);}};
    return Object.freeze({
      trigger(event){
        if(used||disposed)throw Error("Backup is no longer ready; preview again.");
        if(event?.isTrusted!==true||browser.navigator?.userActivation?.isActive===false)throw Error("Backup download requires a fresh confirmation button click.");
        used=true;let link;
        try{
          link=browser.document.createElement("a");link.href=url;
          link.download=String(filename||"omax-cutting-job-import-backup.json").replace(/[^a-z0-9._-]+/gi,"_");
          browser.document.body.appendChild(link);
          link.click();
          return Object.freeze({triggerStarted:true,acceptance:"Browser completion is not observable by the page."});
        }finally{
          try{link?.remove();}finally{delayedRevoke();}
        }
      },
      dispose(){if(used)delayedRevoke();else revoke();}
    });
  }
  const boundedError=error=>String(error?.message||error||"Unknown error").replace(/https?:\/\/\S+/gi,"[URL]").replace(/\s+/g," ").slice(0,240);
  return Object.freeze({prepare,boundedError});
});
