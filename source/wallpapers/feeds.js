/* Additional official feeds, exported as a static catalog during the Pages build. */
(function(root){
  'use strict';
  const repositories=typeof module!=='undefined'&&module.exports?require('./repositories.js'):root.WallpaperRepositories;
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const morevna=typeof module!=='undefined'&&module.exports?require('./morevna.js'):root.WallpaperMorevna;
  const ayomi=typeof module!=='undefined'&&module.exports?require('./ayomi.js'):root.WallpaperAyomi;
  const opengameart=typeof module!=='undefined'&&module.exports?require('./opengameart.js'):root.WallpaperOpenGameArt;
  const revoy=typeof module!=='undefined'&&module.exports?require('./revoy.js'):root.WallpaperRevoy;
  const tyson=typeof module!=='undefined'&&module.exports?require('./tyson.js'):root.WallpaperTyson;
  const providers=Object.freeze({pepper:{name:'Pepper&Carrot',categories:['anime','illustration']},met:{name:'大都会艺术博物馆',categories:['art','nature']},morevna:morevna.source,ayomi:ayomi.source,opengameart:opengameart.source,revoy:revoy.source,tyson:tyson.source,...repositories.sources});
  const pepperPage='https://www.peppercarrot.com/en/wallpapers/index.html';
  const pepperArtworkPage='https://www.peppercarrot.com/en/artworks/artworks.html';
  const pepperFilename=/^\d{4}-\d{2}-\d{2}_[a-z0-9_-]+_by-David-Revoy\.jpg$/i;
  const licenseUrls={pepper:'https://creativecommons.org/licenses/by/4.0/',met:'https://creativecommons.org/publicdomain/zero/1.0/'};
  const text=value=>commons.plainText(value);

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

  function pepperWorkKey(filename){
    return typeof filename==='string'&&filename.length<=500&&pepperFilename.test(filename)?filename.replace(/^\d{4}-\d{2}-\d{2}_/,'').replace(/_by-David-Revoy\.jpg$/i,'').replace(/[-_]/g,'').toLowerCase():null;
  }

  function parsePepperGallery(html){
    const records=[],seen=new Set();
    for(const match of String(html||'').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<img\b[^>]*src="([^"]+)"[^>]*>/gi)){
      const pageUrl=safeURL(match[1],'www.peppercarrot.com','/en/viewer/artworks__');
      const stem=pageUrl?.match(/\/en\/viewer\/artworks__([^/]+)\.html$/)?.[1],filename=stem?stem+'.jpg':null;
      if(!pepperWorkKey(filename)||seen.has(filename))continue;
      seen.add(filename);records.push({filename,pageUrl});
    }
    return records;
  }

  function parsePepperArtwork(html,candidate){
    if(!pepperWorkKey(candidate?.filename))return null;
    const pageUrl='https://www.peppercarrot.com/en/viewer/artworks__'+candidate.filename.slice(0,-4)+'.html';
    if(candidate.pageUrl!==pageUrl)return null;
    const content=String(html||''),footer=content.match(/<div\b[^>]*class="[^\"]*\bViewFooterInfo\b[^\"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if(!footer||!/<\/a>\s+by David Revoy\s*−\s*<a\b/i.test(footer))return null;
    const links=[...footer.matchAll(/<a\b[^>]*href="([^\"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const title=links.find(link=>link[1]===pageUrl);
    if(!title||!links.some(link=>[licenseUrls.pepper,licenseUrls.pepper+'deed.en'].includes(link[1])&&/^CC[- ]BY 4\.0$/i.test(text(link[2]))))return null;
    const download='https://www.peppercarrot.com/0_sources/0ther/artworks/hi-res/'+candidate.filename;
    const image='https://www.peppercarrot.com/0_sources/0ther/artworks/low-res/'+candidate.filename;
    for(const match of content.matchAll(/<a\b[^>]*href="([^\"]+)"[^>]*>\s*<img\b[^>]*src="([^\"]+)"[^>]*>/gi)){
      if(match[1]===download&&match[2]===image)return {filename:candidate.filename,kind:'artwork',title:text(title[2]).replace(/^["“]|["”]$/g,''),download,image,pageUrl,artist:'David Revoy',license:'CC BY 4.0',licenseUrl:licenseUrls.pepper};
    }
    return null;
  }

  function normalizeFeed(records,provider){
    if(!Object.hasOwn(providers,provider))return [];
    if(Object.hasOwn(repositories.sources,provider))return repositories.normalizeRepository(records,provider);
    if(provider==='morevna')return morevna.normalizeRecords(records);
    if(provider==='ayomi')return ayomi.normalizeRecords(records);
    if(provider==='opengameart')return opengameart.normalizeRecords(records);
    if(provider==='revoy')return revoy.normalizeRecords(records);
    if(provider==='tyson')return tyson.normalizeRecords(records);
    const items=[],seen=new Set(),input=Array.isArray(records)?records.slice():[];
    if(provider==='pepper')input.sort((a,b)=>Number(a?.kind==='artwork')-Number(b?.kind==='artwork'));
    for(const raw of input){
      let id,title,artist,image,download,pageUrl,width,height,record;
      if(provider==='pepper'){
        if(!raw||!pepperWorkKey(raw.filename)||raw.kind!==undefined&&raw.kind!=='artwork'||raw.artist!=='David Revoy'||raw.license!=='CC BY 4.0'||raw.licenseUrl!==licenseUrls.pepper)continue;
        const artwork=raw.kind==='artwork',directory='/0_sources/0ther/'+(artwork?'artworks':'wallpapers')+'/';
        pageUrl=artwork?'https://www.peppercarrot.com/en/viewer/artworks__'+raw.filename.slice(0,-4)+'.html':pepperPage;
        if(raw.pageUrl!==pageUrl||artwork&&seen.has('pepper-work:'+pepperWorkKey(raw.filename)))continue;
        image=safeURL(raw.image,'www.peppercarrot.com',artwork?directory+'low-res/':'/cache/');download=safeURL(raw.download,'www.peppercarrot.com',directory+'hi-res/');
        if(artwork&&(image!=='https://www.peppercarrot.com'+directory+'low-res/'+raw.filename||download!=='https://www.peppercarrot.com'+directory+'hi-res/'+raw.filename))continue;
        if(!download||download.split('/').pop()!==raw.filename)continue;
        id='pepper-'+raw.filename.slice(0,-4);title=artwork&&text(raw.title)||raw.filename.replace(/^\d{4}-\d{2}-\d{2}_/,'').replace(/_by-David-Revoy\.jpg$/,'').replaceAll('-',' ');artist=raw.artist;width=raw.width;height=raw.height;
        record={filename:raw.filename,image,download,artist,license:raw.license,licenseUrl:raw.licenseUrl,pageUrl,width,height,...(artwork?{kind:'artwork',title}:{})};
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
      if(provider==='pepper'&&raw.kind!=='artwork')seen.add('pepper-work:'+pepperWorkKey(raw.filename));
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

  function licenseHint(license){
    if(typeof license==='string'&&license.startsWith('CC BY'))return ['署名',...(license.includes('-NC')?['非商业']:[]),...(license.includes('-ND')?['不可改作']:[]),...(license.includes('-SA')?['相同方式共享']:[])].join(' · ');
    return ['CC0','Public domain'].includes(license)?'可自由使用':'查看使用许可';
  }

  const api={providers,pepperPage,pepperArtworkPage,parsePepperIndex,pepperWorkKey,parsePepperGallery,parsePepperArtwork,normalizeFeed,normalizeCatalog,mergeItems,mixSources,licenseHint};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperFeeds=api;
})(typeof globalThis!=='undefined'?globalThis:this);
