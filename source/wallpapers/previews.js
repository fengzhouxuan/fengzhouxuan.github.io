/* Build-generated previews never replace the author, license or original download. */
(function(root){
  'use strict';
  const repositories=typeof module!=='undefined'&&module.exports?require('./repositories.js'):root.WallpaperRepositories;
  const ayomi=typeof module!=='undefined'&&module.exports?require('./ayomi.js'):root.WallpaperAyomi;
  const version=1,maxEdge=1280,maxBytes=2*1024*1024,authorMaxBytes=8*1024*1024;

  function filenameFor(item){
    if(item?.provider==='ayomi'){
      const normalized=ayomi.normalizeRecords([item.feedRecord])[0];if(!normalized||normalized.id!==item.id)return null;
      const file=new URL(normalized.download).pathname.slice('/images/gallery/'.length),extension=new URL(normalized.image).pathname.split('.').pop();
      return 'ayomi/'+file+'.'+Date.parse(normalized.revision)+'.'+extension;
    }
    const normalized=repositories.normalizeRepository([item?.feedRecord],item?.provider)[0];
    return normalized&&normalized.id===item?.id?item.provider+'-'+normalized.feedRecord.revision+'-v'+version+'.webp':null;
  }

  function previewFor(item,manifest){
    const filename=filenameFor(item),entry=manifest?.version===version?manifest.images?.[item?.id]:null;
    if(!filename||!entry||entry.revision!==item.feedRecord.revision)return null;
    if(item.provider==='ayomi'){
      if(entry.url!==item.feedRecord.image||entry.width!==item.feedRecord.imageWidth||entry.height!==item.feedRecord.imageHeight||!/^([a-f0-9]{64})$/.test(entry.digest))return null;
    }else if(!Number.isSafeInteger(entry.width)||!Number.isSafeInteger(entry.height)||entry.width<1||entry.height<1||entry.width>maxEdge||entry.height>maxEdge)return null;
    if(!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>(item.provider==='ayomi'?authorMaxBytes:maxBytes))return null;
    return './previews/'+filename;
  }

  function imageCandidates(item,manifest){
    return [...new Set([previewFor(item,manifest),item?.image,item?.fallbackImage].filter(value=>typeof value==='string'&&value.length>0))];
  }

  const api={version,maxEdge,maxBytes,authorMaxBytes,filenameFor,previewFor,imageCandidates};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperPreviews=api;
})(typeof globalThis!=='undefined'?globalThis:this);
