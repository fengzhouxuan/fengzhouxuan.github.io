/* Additional official feeds, exported as a static catalog during the Pages build. */
(function(root){
  'use strict';
  const repositories=typeof module!=='undefined'&&module.exports?require('./repositories.js'):root.WallpaperRepositories;
  const providers=Object.freeze({pepper:{name:'Pepper&Carrot',categories:['anime','illustration']},met:{name:'大都会艺术博物馆',categories:['art','nature']},...repositories.sources});
  const pepperPage='https://www.peppercarrot.com/en/wallpapers/index.html';
  const licenseUrls={pepper:'https://creativecommons.org/licenses/by/4.0/',met:'https://creativecommons.org/publicdomain/zero/1.0/'};
  const text=value=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,500):'';

  function safeURL(value,host,path){
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname===host&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith(path)?url.href:null;}catch(e){return null;}
  }

  function parsePepperIndex(html){
    const records=[],seen=new Set();
    for(const match of String(html||'').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<img\b[^>]*src="([^"]+)"[^>]*>/gi)){
      const download=safeURL(match[1],'www.peppercarrot.com','/0_sources/0ther/wallpapers/hi-res/');
      const image=safeURL(match[2],'www.peppercarrot.com','/cache/');
      const filename=download?.split('/').pop();
      if(!download||!image||!/^\d{4}-\d{2}-\d{2}_[a-z0-9_-]+_by-David-Revoy\.jpg$/i.test(filename)||seen.has(filename))continue;
      seen.add(filename);records.push({filename,download,image,artist:'David Revoy',license:'CC BY 4.0',licenseUrl:licenseUrls.pepper,pageUrl:pepperPage});
    }
    return records;
  }

  function normalizeFeed(records,provider){
    if(!Object.hasOwn(providers,provider))return [];
    if(Object.hasOwn(repositories.sources,provider))return repositories.normalizeRepository(records,provider);
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      let id,title,artist,image,download,pageUrl,width,height,record;
      if(provider==='pepper'){
        if(!raw||typeof raw.filename!=='string'||!/^\d{4}-\d{2}-\d{2}_[a-z0-9_-]+_by-David-Revoy\.jpg$/i.test(raw.filename)||raw.artist!=='David Revoy'||raw.license!=='CC BY 4.0'||raw.licenseUrl!==licenseUrls.pepper||raw.pageUrl!==pepperPage)continue;
        image=safeURL(raw.image,'www.peppercarrot.com','/cache/');download=safeURL(raw.download,'www.peppercarrot.com','/0_sources/0ther/wallpapers/hi-res/');
        if(!download||download.split('/').pop()!==raw.filename)continue;
        id='pepper-'+raw.filename.slice(0,-4);title=raw.filename.replace(/^\d{4}-\d{2}-\d{2}_/,'').replace(/_by-David-Revoy\.jpg$/,'').replaceAll('-',' ');artist=raw.artist;pageUrl=pepperPage;width=raw.width;height=raw.height;
        record={filename:raw.filename,image,download,artist,license:raw.license,licenseUrl:raw.licenseUrl,pageUrl,width,height};
      }else{
        if(!raw||!Number.isSafeInteger(raw.objectID)||raw.objectID<1||raw.isPublicDomain!==true||raw.objectName!=='Painting')continue;
        image=safeURL(raw.primaryImageSmall,'images.metmuseum.org','/CRDImages/');download=safeURL(raw.primaryImage,'images.metmuseum.org','/CRDImages/');
        pageUrl=safeURL(raw.objectURL,'www.metmuseum.org','/art/collection/');
        if(!pageUrl||!pageUrl.endsWith('/'+raw.objectID)||!download)continue;
        width=raw.width;height=raw.height;
        id='met-'+raw.objectID;title=text(raw.title)||'无题';artist=text(raw.artistDisplayName)||'作者未注明';
        record={objectID:raw.objectID,title,artistDisplayName:artist,isPublicDomain:true,primaryImageSmall:image,primaryImage:download,objectURL:pageUrl,width,height,objectName:'Painting'};
      }
      if(!image||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||seen.has(id))continue;
      seen.add(id);
      const license=provider==='pepper'?'CC BY 4.0':'CC0';
      items.push({id,source:provider==='pepper'?'commons':'art',provider,title,artist,image,download,pageUrl,width,height,license,licenseUrl:licenseUrls[provider],categories:providers[provider].categories,tags:[provider==='pepper'?'二次元':'艺术',provider==='pepper'?'插画':'风景',providers[provider].name,width>=height?'横屏':'竖屏'],feedRecord:record});
    }
    return items;
  }

  function normalizeCatalog(catalog){
    if(catalog?.version!==1)return [];
    return Object.keys(providers).flatMap(provider=>normalizeFeed(catalog.records?.[provider],provider));
  }

  function mergeItems(items){
    const records=new Map();
    const union=(first,second)=>[...new Set([...(Array.isArray(first)?first:[]),...(Array.isArray(second)?second:[])])];
    for(const item of Array.isArray(items)?items:[]){
      if(typeof item?.id!=='string'||!item.id)continue;
      const previous=records.get(item.id);
      records.set(item.id,previous?{...item,categories:union(previous.categories,item.categories),tags:union(previous.tags,item.tags)}:item);
    }
    return [...records.values()];
  }

  function mixSources(items,day=''){
    const groups=new Map(),result=[];
    let offset=0;for(const letter of String(day))offset=(offset*31+letter.charCodeAt(0))>>>0;
    for(const item of items){const key=item.provider||item.collection||item.source;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
    const queues=[...groups.values()].map(group=>{const start=offset%group.length;return [...group.slice(start),...group.slice(0,start)];});
    if(!queues.length)return result;
    const start=offset%queues.length;
    for(let index=0;index<Math.max(...queues.map(group=>group.length));index++)for(let source=0;source<queues.length;source++){
      const item=queues[(start+source)%queues.length][index];if(item)result.push(item);
    }
    return result;
  }

  const api={providers,parsePepperIndex,normalizeFeed,normalizeCatalog,mergeItems,mixSources};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperFeeds=api;
})(typeof globalThis!=='undefined'?globalThis:this);
