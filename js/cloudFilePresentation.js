(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.Cfr05CloudFilePresentation=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function createCache(){
    const filesByJobId=new Map();
    const loadingByJobId=new Map();
    const normalizeId=value=>String(value||"").trim();
    const normalizeResult=(jobId,value)=>{
      const result=value&&typeof value==="object"?value:{};
      return Object.freeze({
        jobId,
        files:Object.freeze((Array.isArray(result.files)?result.files:[]).map(file=>Object.freeze({...file}))),
        cloudFileCount:Number(result.cloudFileCount)||0,
        rejectedMetadataDocumentCount:Number(result.rejectedMetadataDocumentCount)||0,
        rejectedMetadataReasons:Object.freeze(Array.isArray(result.rejectedMetadataReasons)?result.rejectedMetadataReasons.map(item=>Object.freeze({...item})):[]),
        blockers:Object.freeze(Array.isArray(result.blockers)?result.blockers.map(String):[]),
        error:result.error?Object.freeze({code:String(result.error.code||""),message:String(result.error.message||"")}):null
      });
    };
    const peek=jobId=>filesByJobId.get(normalizeId(jobId))||null;
    const load=(jobId,loader,options={})=>{
      const id=normalizeId(jobId);
      if(!id)return Promise.resolve(null);
      if(options.force!==true&&filesByJobId.has(id))return Promise.resolve(filesByJobId.get(id));
      if(loadingByJobId.has(id))return loadingByJobId.get(id);
      const request=Promise.resolve().then(()=>loader(id)).then(value=>{
        const normalized=normalizeResult(id,value);
        filesByJobId.set(id,normalized);
        return normalized;
      },error=>{
        const normalized=normalizeResult(id,{files:[],cloudFileCount:0,blockers:[],error:{code:String(error?.code||"listingFailure"),message:String(error?.message||error||"Cloud listing failed.")}});
        filesByJobId.set(id,normalized);
        return normalized;
      }).finally(()=>loadingByJobId.delete(id));
      loadingByJobId.set(id,request);
      return request;
    };
    return Object.freeze({
      peek,
      load,
      has:jobId=>filesByJobId.has(normalizeId(jobId)),
      isLoading:jobId=>loadingByJobId.has(normalizeId(jobId)),
      invalidate:jobId=>filesByJobId.delete(normalizeId(jobId)),
      clear:()=>filesByJobId.clear(),
      diagnostics:()=>Object.freeze({cachedJobCount:filesByJobId.size,inFlightJobCount:loadingByJobId.size,persistent:false})
    });
  }
  return Object.freeze({createCache});
});
