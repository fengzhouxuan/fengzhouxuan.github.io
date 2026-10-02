/* Only explicitly CC0, site-authored AI releases from the anime collection. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://www.hdwallpapers.org',artist='hdwallpapers.org';
  const source=Object.freeze({name:'HDWallpapers · AI 动漫',gallery:origin+'/category/anime/',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',categories:['anime','illustration','nature','city','space','fantasy','cyberpunk','animals']});
  const excluded=/nsfw|nudity|nude|erotic|sexual|porn|fan[- ]?art|genshin|arknights|evangelion|hatsune|miku|naruto|one[- ]piece|demon[- ]slayer|dragon[- ]ball|pokemon|pok[eé]mon|blue[- ]archive|honkai|sailor[- ]moon|frieren|jujutsu|bleach|chainsaw|bocchi|touhou|azur[- ]lane|kousei|your[- ]lie[- ]in[- ]april|sword[- ]art[- ]online|final[- ]fantasy/i;
  function workURL(value){
    try{const url=new URL(value);return url.origin===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/wallpaper\/anime\/[a-z0-9-]{1,150}\/[a-zA-Z0-9]{2,8}\/$/i.test(url.pathname)?url.href:null;}catch(error){return null;}
  }
  function sourceFileURL(value,workID,width,height){
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)return null;
    try{
      const url=new URL(value);if(url.origin!==origin||url.username||url.password||url.search||url.hash||!/^\/uploads\/converted\/\d{2}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/[a-z0-9_-]{1,240}\.jpg$/i.test(url.pathname))return null;
      return /^[a-zA-Z0-9]{2,8}$/.test(workID)&&url.pathname.endsWith('-'+workID+'-'+width+'x'+height+'-MM-90.jpg')?url.href:null;
    }catch(error){return null;}
  }
  function originalPath(record){return /^[a-f0-9]{64}$/.test(record?.revision)?'./originals/hdwallpapers/'+record.revision+'.jpg':null;}
  function categoriesFor(title,tags=[]){
    const categories=['anime','illustration'],text=title+' '+tags.join(' ');
    for(const [category,pattern] of Object.entries({nature:/scenery|forest|tree|cloud|sunset|grass|mountain|garden/i,city:/city|street|alley|skyscraper/i,space:/galaxy|space|stars|cosmos/i,fantasy:/fantasy|magic|dragon/i,cyberpunk:/cyberpunk|neon/i,animals:/kitty|cat|fox|rabbit/i}))if(pattern.test(text))categories.push(category);
    return categories;
  }
  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||raw.artist!==artist||raw.license!==source.license||raw.licenseUrl!==source.licenseUrl||raw.ai!==true)continue;
      const pageUrl=workURL(raw.pageUrl),title=commons.plainText(raw.title),{width,height,bytes}=raw,download=originalPath(raw),tags=Array.isArray(raw.tags)?raw.tags.map(commons.plainText):[];
      if(!pageUrl||raw.licenseSource!==pageUrl||raw.workID!==new URL(pageUrl).pathname.split('/').at(-2)||!title||title.length>150||!/(?:^|[^a-z])ai(?:[^a-z]|$)/i.test(title+' '+tags.join(' '))||excluded.test(title+' '+tags.join(' ')))continue;
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||width*height>60000000||!Number.isSafeInteger(bytes)||bytes<1||bytes>32*1024*1024||!download||!sourceFileURL(raw.sourceFile,raw.workID,width,height))continue;
      if(raw.modified!==null&&(typeof raw.modified!=='string'||!Number.isFinite(Date.parse(raw.modified))))continue;
      if(raw.etag!==null&&(typeof raw.etag!=='string'||!raw.etag||raw.etag.length>200))continue;
      if(seen.has(raw.workID)||seen.has(download))continue;seen.add(raw.workID);seen.add(download);
      const categories=categoriesFor(title,tags),feedRecord={workID:raw.workID,title,artist,ai:true,tags,sourceFile:raw.sourceFile,pageUrl,width,height,bytes,revision:raw.revision,modified:raw.modified,etag:raw.etag,license:source.license,licenseUrl:source.licenseUrl,licenseSource:pageUrl};
      items.push({id:'hdwallpapers-'+raw.workID,source:'commons',provider:'hdwallpapers',title,artist,image:download,download,pageUrl,width,height,license:source.license,licenseUrl:source.licenseUrl,copyrightNotice:'图源提供的最高分辨率版本；本站预览等比例缩小并转为 WebP。',categories,tags:['二次元','AI 插画',...tags,source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }
  const api={origin,artist,source,excluded,workURL,sourceFileURL,originalPath,categoriesFor,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperHDWallpapers=api;
})(typeof globalThis!=='undefined'?globalThis:this);
