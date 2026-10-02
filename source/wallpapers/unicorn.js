/* Reviewed author-published full-frame gallery files; package masters are separate downloads. */
(function(root){
  'use strict';
  const origin='https://unicorncreates.itch.io',imageOrigin='https://img.itch.zone',pageUrl=origin+'/shopping-backgrounds';
  const artist='Unicorn Creates',license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/';
  const source=Object.freeze({name:'Unicorn Creates · 手绘场景',categories:['anime','illustration']});
  const works=Object.freeze({
    mall:{title:'商场扶梯',assetPath:'/aW1hZ2UvNDI2OTM2NS8yNTU3Mzg1Ny5qcGc='},
    clothes:{title:'服装店',assetPath:'/aW1hZ2UvNDI2OTM2NS8yNTU3Mzg1My5qcGc='}
  });
  function imageURL(value,key){
    if(!Object.hasOwn(works,key))return null;
    try{
      const url=new URL(value),prefix=works[key].assetPath+'/original/';
      return url.origin===imageOrigin&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith(prefix)&&/^[A-Za-z0-9_-]{1,80}\.jpg$/.test(url.pathname.slice(prefix.length))?url.href:null;
    }catch(error){return null;}
  }
  function originalPath(record){return /^[a-f0-9]{64}$/.test(record?.revision)&&record?.extension==='jpg'?'./originals/unicorn/'+record.revision+'.jpg':null;}
  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||!Object.hasOwn(works,raw.work)||raw.artist!==artist||raw.pageUrl!==pageUrl||raw.license!==license||raw.licenseUrl!==licenseUrl||raw.kind!=='published-gallery')continue;
      const publishedImage=imageURL(raw.publishedImage,raw.work),download=originalPath(raw),{width,height,bytes}=raw;
      if(!publishedImage||!download||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||width*height>60000000||!Number.isSafeInteger(bytes)||bytes<1||bytes>32*1024*1024||seen.has(raw.work)||seen.has(download))continue;
      seen.add(raw.work);seen.add(download);
      const title=works[raw.work].title,id='unicorn-shopping-'+raw.work;
      const feedRecord={work:raw.work,title,publishedImage,revision:raw.revision,extension:'jpg',bytes,width,height,artist,pageUrl,license,licenseUrl,kind:'published-gallery'};
      items.push({id,source:'commons',provider:'unicorn',...feedRecord,image:download,download,categories:source.categories,tags:['二次元','手绘插画','购物场景',title,source.name,width>=height?'横屏':'竖屏'],copyrightNotice:'高清入口保留作者公开的 JPEG 展示文件；素材包的 4K PNG 为独立版本。本站预览等比例缩小并转为 WebP。',feedRecord});
    }
    return items;
  }
  const api={origin,imageOrigin,pageUrl,artist,license,licenseUrl,source,works,imageURL,originalPath,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperUnicorn=api;
})(typeof globalThis!=='undefined'?globalThis:this);
