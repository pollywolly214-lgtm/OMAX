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
  function createPreviewCache(){
    const previews=new Map();
    const loading=new Map();
    let downloadCount=0;
    const keyFor=value=>JSON.stringify([value?.jobId,value?.fileId,value?.sha256].map(part=>String(part||"").trim()));
    const normalize=(identity,value)=>Object.freeze({
      key:keyFor(identity),jobId:String(identity?.jobId||""),fileId:String(identity?.fileId||""),sha256:String(identity?.sha256||""),
      status:value?.previewData?"ready":(value?.status==="error"?"error":"unavailable"),
      previewData:value?.previewData?String(value.previewData):"",
      diagnostics:Object.freeze({completed:value?.completed===true,blockers:Object.freeze(Array.isArray(value?.blockers)?value.blockers.map(String):[]),previewRoute:String(value?.previewRoute||""),previewAvailable:value?.previewAvailable===true,previewDisplayed:value?.previewDisplayed===true,opened:value?.opened===true,error:value?.error?Object.freeze({code:String(value.error.code||""),message:String(value.error.message||"")}):null})
    });
    const peek=identity=>previews.get(keyFor(identity))||null;
    const load=(identity,loader)=>{
      const key=keyFor(identity);
      if(!identity?.jobId||!identity?.fileId||!identity?.sha256)return Promise.resolve(null);
      if(previews.has(key))return Promise.resolve(previews.get(key));
      if(loading.has(key))return loading.get(key);
      downloadCount+=1;
      const request=Promise.resolve().then(()=>loader(identity)).then(value=>{const result=normalize(identity,value);previews.set(key,result);return result;},error=>{const result=normalize(identity,{status:"error",error:{code:String(error?.code||"previewFailure"),message:String(error?.message||error||"Preview failed.")}});previews.set(key,result);return result;}).finally(()=>loading.delete(key));
      loading.set(key,request);return request;
    };
    return Object.freeze({peek,load,has:identity=>previews.has(keyFor(identity)),isLoading:identity=>loading.has(keyFor(identity)),clear:()=>previews.clear(),diagnostics:()=>Object.freeze({cachedPreviewCount:previews.size,inFlightPreviewCount:loading.size,downloadCount,persistent:false})});
  }
  return Object.freeze({createCache,createPreviewCache});
});
