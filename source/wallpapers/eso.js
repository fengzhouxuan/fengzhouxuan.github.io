/* ESO astronomical observations, with the publisher's complete linked credit. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://www.eso.org',imageOrigin='https://cdn.eso.org';
  const source=Object.freeze({name:'ESO · 星空与星云',categories:['space'],gallery:origin+'/public/images/',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'});
  const licenseSource=origin+'/public/outreach/copyright/';
  const groups=Object.freeze({nebulae:'星云',galaxies:'星系',starclusters:'星团'});
  const excluded=/annotated|annotation|chart|diagram|comparison|spectrum|artist.?s impression|illustration|all rights reserved|no redistribution/i;
  function safeURL(value,base,pattern){
    try{const url=new URL(value);return url.origin===base&&!url.username&&!url.password&&!url.search&&!url.hash&&pattern.test(url.pathname)?url.href:null;}catch(error){return null;}
  }
  const workURL=value=>safeURL(value,origin,/^\/public\/images\/[a-z0-9_-]{1,100}\/$/);
  function imageURL(value,id,format){
    if(typeof id!=='string'||!/^[a-z0-9_-]{1,100}$/.test(id)||!['screen','publicationjpg','large'].includes(format))return null;
    return value===imageOrigin+'/images/'+format+'/'+id+'.jpg'?value:null;
  }
  function creditURL(value){
    try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.href.length<=1000?url.href:null;}catch(error){return null;}
  }
  function creditParts(value,artist){
    if(!Array.isArray(value)||!value.length||value.length>64||typeof artist!=='string'||!artist||artist.length>2000||/[<>]/.test(artist))return null;
    if(value.some(part=>!part||typeof part.text!=='string'||!part.text||/[<>\r\n\t]/.test(part.text)||part.href!==undefined&&!creditURL(part.href)))return null;
    if(value.map(part=>part.text).join('')!==artist)return null;
    return value.map(part=>({text:part.text,...(part.href?{href:creditURL(part.href)}:{})}));
  }
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=30000&&height<=30000&&width*height<=60000000;
  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||!Object.hasOwn(groups,raw.group)||raw.type!=='Observation'||raw.license!==source.license||raw.licenseUrl!==source.licenseUrl||raw.licenseSource!==licenseSource)continue;
      const pageUrl=workURL(raw.pageUrl),title=commons.plainText(raw.title),parts=creditParts(raw.creditParts,raw.artist);
      if(!pageUrl||pageUrl!==origin+'/public/images/'+raw.workID+'/'||!parts||!title||title.length>300||excluded.test(title))continue;
      const {width,height,imageWidth,imageHeight}=raw;
      if(!validSize(width,height)||Math.max(width,height)<1600||Math.min(width,height)<800||!validSize(imageWidth,imageHeight)||imageWidth>width||imageHeight>height||Math.abs(width*imageHeight/(height*imageWidth)-1)>=0.01)continue;
      const download=imageURL(raw.download,raw.workID,raw.format),image=imageURL(raw.image,raw.workID,'screen');
      if(!['publicationjpg','large'].includes(raw.format)||!download||!image||typeof raw.revision!=='string'||!/^[a-f0-9]{64}$/.test(raw.revision)||![raw.modified,raw.previewModified].every(value=>typeof value==='string'&&value.length<100&&Number.isFinite(Date.parse(value)))||seen.has(raw.workID))continue;
      seen.add(raw.workID);
      const feedRecord={workID:raw.workID,group:raw.group,type:raw.type,title,artist:raw.artist,creditParts:parts,pageUrl,image,download,format:raw.format,width,height,imageWidth,imageHeight,modified:raw.modified,previewModified:raw.previewModified,revision:raw.revision,license:source.license,licenseUrl:source.licenseUrl,licenseSource};
      items.push({id:'eso-'+raw.workID,source:'commons',provider:'eso',...feedRecord,categories:source.categories,tags:['星空','宇宙','天文',groups[raw.group],source.name,width>=height?'横屏':'竖屏'],copyrightNotice:'下载为 ESO 官方'+(raw.format==='publicationjpg'?' Publication JPEG':' Large JPEG')+'，尺寸以该文件为准；更大的 TIFF 等版本可在作品页获取。本站预览等比例缩小并转为 WebP。使用时保留完整署名和链接。',feedRecord});
    }
    return items;
  }
  const api={origin,imageOrigin,source,licenseSource,groups,excluded,workURL,imageURL,creditURL,creditParts,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperESO=api;
})(typeof globalThis!=='undefined'?globalThis:this);
