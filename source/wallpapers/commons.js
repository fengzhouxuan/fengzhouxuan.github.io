/* Open image feeds: every accepted image carries its own creator and license. */
(function(root){
  'use strict';
  const categories=Object.freeze({anime:'Anime illustrations',nature:'Featured pictures of landscapes',city:'Featured pictures of cityscapes',space:'Featured pictures of astronomy',animals:'Featured pictures of Felidae'});
  const labels={anime:'二次元',nature:'风景',city:'城市',space:'星空',animals:'动物'};
  const blocked=/hentai|ecchi|ahegao|futanari|lolicon|shotacon|nud[ei]|erotic|sexual|genital|porn|sukumizu|swimsuit|fetish|license review needed|copyright violations|permission missing|no permission|deletion requests/i;

  function plainText(value){
    if(typeof value!=='string')return '';
    return value.replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(match,code)=>{
      const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
      return point>0&&point<=0x10ffff?String.fromCodePoint(point):'';
    }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(match,key)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[key]).replace(/\s+/g,' ').trim().slice(0,500);
  }

  function safeURL(value,host,path){
    try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!==host||url.username||url.password||!url.pathname.startsWith(path))return null;url.search='';url.hash='';return url.href;}catch(e){return null;}
  }

  function normalizeCommons(records,category){
    if(!Object.hasOwn(categories,category))return [];
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      const info=raw?.imageinfo?.[0],meta=info?.extmetadata;
      if(!Number.isSafeInteger(raw?.pageid)||raw.pageid<1||typeof raw.title!=='string'||!raw.title.startsWith('File:')||!info||!meta||seen.has(raw.pageid))continue;
      if(!['image/jpeg','image/png','image/webp'].includes(info.mime)||!Number.isSafeInteger(info.width)||!Number.isSafeInteger(info.height)||Math.max(info.width,info.height)<1600||Math.min(info.width,info.height)<800)continue;
      const context=[raw.title,meta.Categories?.value,meta.ImageDescription?.value].join(' ');
      if(blocked.test(context)||plainText(meta.Restrictions?.value))continue;
      const image=safeURL(info.thumburl,'thumb.wikimedia.org','/wikipedia/commons/')||safeURL(info.thumburl,'upload.wikimedia.org','/wikipedia/commons/');
      const download=safeURL(info.url,'upload.wikimedia.org','/wikipedia/commons/');
      const pageUrl=safeURL(info.descriptionurl,'commons.wikimedia.org','/wiki/File:');
      if(!image||!download||!pageUrl)continue;
      const license=plainText(meta.LicenseShortName?.value),artist=plainText(meta.Artist?.value);
      let licenseUrl;
      const match=license.match(/^CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)$/);
      if(license==='CC0')licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
      else if(license==='Public domain')licenseUrl='https://creativecommons.org/publicdomain/mark/1.0/';
      else if(match&&artist){
        licenseUrl='https://creativecommons.org/licenses/by'+(match[1]?'-sa':'')+'/'+match[2]+'/';
        const actual=typeof meta.LicenseUrl?.value==='string'?meta.LicenseUrl.value.replace(/^http:/,'https:').replace(/\/?$/,'/'):'';
        if(actual!==licenseUrl)continue;
      }else continue;
      seen.add(raw.pageid);
      const content=[category,...(category==='anime'?['illustration']:[])];
      const tags=[labels[category],...(category==='anime'?['插画']:[]),...( /AI-generated|artificial intelligence/i.test(context)?['AI 插画']:[]),info.width>=info.height?'横屏':'竖屏'];
      const record={pageid:raw.pageid,title:raw.title,imageinfo:[{width:info.width,height:info.height,mime:info.mime,url:download,thumburl:image,descriptionurl:pageUrl,extmetadata:Object.fromEntries(['Artist','LicenseShortName','LicenseUrl','Categories','ImageDescription','Restrictions'].filter(key=>meta[key]).map(key=>[key,{value:meta[key].value}]))}]};
      items.push({id:'commons-'+raw.pageid,source:'commons',collection:category,categories:content,title:plainText(raw.title.slice(5).replace(/\.(jpe?g|png|webp)$/i,'').replaceAll('_',' ')),artist:artist||'作者未注明',license,licenseUrl,width:info.width,height:info.height,image,download,pageUrl,tags,commonsRecord:record});
    }
    return items;
  }

  async function loadCommons({category,fetcher,storage,fallback=[],now=new Date(),timeout=12000}={}){
    if(!Object.hasOwn(categories,category))throw Error('图片分类不存在');
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const cacheKey='rabbit-wallpapers-commons-v1-'+category;
    let cached;
    try{const saved=JSON.parse(storage?.getItem(cacheKey)||'null');if(saved?.version===1)cached={day:saved.day,items:normalizeCommons(saved.records,category)};}catch(e){/* Storage may be disabled. */}
    if(cached?.day===day&&cached.items.length)return {items:cached.items,state:'cached'};
    const controller=new AbortController();let timer;
    try{
      const url=new URL('https://commons.wikimedia.org/w/api.php');
      Object.entries({action:'query',format:'json',origin:'*',generator:'categorymembers',gcmtitle:'Category:'+categories[category],gcmtype:'file',gcmlimit:'40',gcmsort:'timestamp',gcmdir:'desc',prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'960',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl|Categories|ImageDescription|Restrictions'}).forEach(([key,value])=>url.searchParams.set(key,value));
      const records=await Promise.race([
        (async()=>{const response=await fetcher(url.href,{signal:controller.signal});if(!response.ok)throw Error('图片源暂时不可用');const payload=await response.json();return Object.values(payload?.query?.pages||{});})(),
        new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('图片源请求超时'));},timeout);})
      ]);
      const items=normalizeCommons(records,category);if(!items.length)throw Error('没有符合许可和尺寸要求的图片');
      try{storage?.setItem(cacheKey,JSON.stringify({version:1,day,records:items.map(item=>item.commonsRecord)}));}catch(e){/* A full cache must not hide usable images. */}
      return {items,state:'fresh'};
    }catch(e){const items=cached?.items.length?cached.items:normalizeCommons(fallback,category);return {items,state:items.length?'stale':'unavailable'};}
    finally{clearTimeout(timer);}
  }

  const api={categories,plainText,normalizeCommons,loadCommons};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperCommons=api;
})(typeof globalThis!=='undefined'?globalThis:this);
