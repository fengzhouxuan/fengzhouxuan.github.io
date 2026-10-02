/* Build-generated previews never replace the author, license or original download. */
(function(root){
  'use strict';
  const repositories=typeof module!=='undefined'&&module.exports?require('./repositories.js'):root.WallpaperRepositories;
  const ayomi=typeof module!=='undefined'&&module.exports?require('./ayomi.js'):root.WallpaperAyomi;
  const revoy=typeof module!=='undefined'&&module.exports?require('./revoy.js'):root.WallpaperRevoy;
  const tyson=typeof module!=='undefined'&&module.exports?require('./tyson.js'):root.WallpaperTyson;
  const feeds=typeof module!=='undefined'&&module.exports?require('./feeds.js'):root.WallpaperFeeds;
  const version=1,maxEdge=1280,maxBytes=2*1024*1024,authorMaxBytes=8*1024*1024,recheckAfterMs=7*24*60*60*1000;

  function filenameFor(item){
    if(['pepper','morevna'].includes(item?.provider)){
      const normalized=feeds.normalizeFeed([item.feedRecord],item.provider)[0];if(!normalized||normalized.id!==item.id)return null;
      if(item.provider==='pepper')return normalized.feedRecord.filename.length<=200?'pepper/'+normalized.feedRecord.filename+'.'+normalized.width+'x'+normalized.height+'-v'+version+'.webp':null;
      const modified=Date.parse(normalized.feedRecord.revision+'Z');if(!Number.isFinite(modified))return null;
      if(new URL(normalized.download).pathname.split('/').pop().length>200)return null;
      return 'morevna/'+new URL(normalized.download).pathname.slice('/wp-content/uploads/'.length)+'.'+modified+'-v'+version+'.webp';
    }
    if(item?.provider==='tyson'){
      const normalized=tyson.normalizeRecords([item.feedRecord])[0];return normalized&&normalized.id===item.id?'tyson-'+normalized.revision+'-v'+version+'.webp':null;
    }
    if(item?.provider==='revoy'){
      const normalized=revoy.normalizeRecords([item.feedRecord])[0];return normalized&&normalized.id===item.id?'revoy-'+normalized.revision+'-v'+version+'.webp':null;
    }
    if(['opengameart','hdwallpapers','blender','unicorn','eso'].includes(item?.provider)){
      const normalized=feeds.normalizeFeed([item.feedRecord],item.provider)[0];return normalized&&normalized.id===item.id?item.provider+'-'+normalized.feedRecord.revision+'-v'+version+'.webp':null;
    }
    if(item?.provider==='ayomi'){
      const normalized=ayomi.normalizeRecords([item.feedRecord])[0];if(!normalized||normalized.id!==item.id)return null;
      const file=new URL(normalized.download).pathname.slice('/images/gallery/'.length),extension=new URL(normalized.image).pathname.split('.').pop();
      return 'ayomi/'+file+'.'+Date.parse(normalized.revision)+'.'+extension;
    }
    const normalized=repositories.normalizeRepository([item?.feedRecord],item?.provider)[0];
    return normalized&&normalized.id===item?.id?item.provider+'-'+normalized.feedRecord.revision+'-v'+version+'.webp':null;
  }

  function revisionFor(item){
    if(!filenameFor(item))return null;
    return item.provider==='pepper'?JSON.stringify([item.feedRecord.download,item.feedRecord.width,item.feedRecord.height]):item.feedRecord.revision;
  }

  function previewFor(item,manifest){
    const filename=filenameFor(item),entry=manifest?.version===version?manifest.images?.[item?.id]:null;
    if(!filename||!entry||entry.revision!==revisionFor(item))return null;
    if(item.provider==='ayomi'){
      if(entry.url!==item.feedRecord.image||entry.width!==item.feedRecord.imageWidth||entry.height!==item.feedRecord.imageHeight||!/^([a-f0-9]{64})$/.test(entry.digest))return null;
    }else if(!Number.isSafeInteger(entry.width)||!Number.isSafeInteger(entry.height)||entry.width<1||entry.height<1||entry.width>maxEdge||entry.height>maxEdge)return null;
    if(['revoy','tyson','eso'].includes(item.provider)&&(entry.url!==item.image||!/^[a-f0-9]{64}$/.test(entry.digest)||Math.abs(item.width*entry.height/(item.height*entry.width)-1)>=0.01))return null;
    if(['pepper','morevna'].includes(item.provider)){
      const record=item.feedRecord,sourceURL=item.provider==='pepper'?record.download:record.image;
      if(entry.url!==sourceURL||!/^[a-f0-9]{64}$/.test(entry.digest)||Math.abs(record.width*entry.height/(record.height*entry.width)-1)>=0.01||entry.width>record.width||entry.height>record.height)return null;
      if(item.provider==='pepper'&&(typeof entry.checkedAt!=='string'||!Number.isFinite(Date.parse(entry.checkedAt))))return null;
      if(item.provider==='morevna'&&(entry.width>record.imageWidth||entry.height>record.imageHeight))return null;
    }
    if(!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>(item.provider==='ayomi'?authorMaxBytes:maxBytes))return null;
    return './previews/'+filename;
  }

  function imageCandidates(item,manifest){
    if(item?.provider==='pepper'){
      const normalized=feeds.normalizeFeed([item.feedRecord],'pepper')[0];
      return normalized&&normalized.id===item.id?[...new Set([previewFor(item,manifest),normalized.download].filter(Boolean))]:[];
    }
    return [...new Set([previewFor(item,manifest),item?.image,item?.fallbackImage].filter(value=>typeof value==='string'&&value.length>0))];
  }

  const api={version,maxEdge,maxBytes,authorMaxBytes,recheckAfterMs,filenameFor,revisionFor,previewFor,imageCandidates};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperPreviews=api;
})(typeof globalThis!=='undefined'?globalThis:this);
