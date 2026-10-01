/* The artist's original gallery projects; third-party fan art and process images are excluded. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://tysontan.com',artist='Tyson Tan (钛山)';
  const source=Object.freeze({name:'钛山 · 原创动漫插画',gallery:origin+'/',api:origin+'/wp-json/wp/v2/',categories:['anime','illustration','fantasy','nature','space','city'],license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'});
  const projects=Object.freeze({'gallery-electric':'电子之心','gallery-spirits':'灵兽化身','gallery-mascots':'开源吉祥物'});
  const excluded=/nsfw|nudity|nude|erotic|sexual|porn|all rights reserved|no redistribution|fan[- ]?art|freedom planet|milla|pencil|sketch|draft|prototype|tutorial|how .* drew|thinking candies|transparent|comparison|isolated|reference sheet|sprite|logo|clipart|blank template|(?:^|[^a-z])PSG(?:[^a-z]|$)/i;
  function safeURL(value,pattern){
    try{const url=new URL(value);return url.origin===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&pattern.test(url.pathname)?url.href:null;}catch(error){return null;}
  }
  const imageURL=value=>safeURL(value,/^\/wp-content\/uploads\/(?:\d{4}\/(?:0[1-9]|1[0-2])\/)?[a-z0-9_.-]{1,250}\.(png|jpe?g|webp)$/i);
  const workURL=value=>safeURL(value,/^\/gallery\/gallery-(?:electric|spirits|mascots)\/[a-z0-9_-]+\/$/i);
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=30000&&height<=30000;
  function categoriesFor(project,title){
    const categories=['anime','illustration'];if(project==='gallery-spirits')categories.push('fantasy');
    if(/forest|hill|lake|sea|waves|waterlil|flower|rain|winter/i.test(title))categories.push('nature');
    if(/aurora|cosmos/i.test(title))categories.push('space');if(/alley|city/i.test(title))categories.push('city');return categories;
  }
  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||!Number.isSafeInteger(raw.workID)||raw.workID<1||!Number.isSafeInteger(raw.mediaID)||raw.mediaID<1||!Object.hasOwn(projects,raw.project)||raw.artist!==artist||raw.license!==source.license||raw.licenseUrl!==source.licenseUrl)continue;
      const title=commons.plainText(raw.title),image=imageURL(raw.image),download=imageURL(raw.download),pageUrl=workURL(raw.pageUrl);
      if(!title||title.length>150||excluded.test(title)||!image||!download||!pageUrl||!new URL(pageUrl).pathname.startsWith('/gallery/'+raw.project+'/')||raw.licenseSource!==pageUrl)continue;
      const {width,height,imageWidth,imageHeight}=raw;
      if(!validSize(width,height)||Math.max(width,height)<1600||Math.min(width,height)<800||!validSize(imageWidth,imageHeight)||imageWidth>width||imageHeight>height||Math.abs(width*imageHeight/(height*imageWidth)-1)>=0.01)continue;
      if(typeof raw.revision!=='string'||!/^[a-f0-9]{64}$/.test(raw.revision)||typeof raw.postModified!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw.postModified)||![raw.modified,raw.previewModified].every(value=>typeof value==='string'&&value.length<100&&Number.isFinite(Date.parse(value))))continue;
      if(seen.has(raw.workID)||seen.has(download))continue;seen.add(raw.workID);seen.add(download);
      const feedRecord={workID:raw.workID,mediaID:raw.mediaID,project:raw.project,title,artist,image,download,pageUrl,width,height,imageWidth,imageHeight,postModified:raw.postModified,modified:raw.modified,previewModified:raw.previewModified,revision:raw.revision,license:source.license,licenseUrl:source.licenseUrl,licenseSource:pageUrl};
      items.push({id:'tyson-'+raw.workID,source:'commons',provider:'tyson',...feedRecord,copyrightNotice:'Copyright © Tyson Tan (钛山)。本站预览等比例缩小并转为 WebP，保留 CC BY-SA 4.0；高清入口保留作者原文件。',categories:categoriesFor(raw.project,title),tags:['二次元','插画',projects[raw.project],source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }
  const api={origin,artist,source,projects,excluded,imageURL,workURL,categoriesFor,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperTyson=api;
})(typeof globalThis!=='undefined'?globalThis:this);
