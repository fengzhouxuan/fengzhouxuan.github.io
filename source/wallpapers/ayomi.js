/* Author-published AI illustrations; every image must carry the noncommercial license. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://oc.nekosia.cat',creator=origin+'/#creator';
  const source=Object.freeze({name:'AyomiArt · AI 插画',artist:'AyomiCat',gallery:origin+'/gallery',categories:['anime','illustration'],license:'CC BY-NC-ND 4.0',licenseUrl:'https://creativecommons.org/licenses/by-nc-nd/4.0/'});
  const blocked=/hentai|ecchi|ahegao|futanari|lolicon|shotacon|nsfw|nudity|nude|erotic|sexual|porn|swimsuit|bikini|lingerie|panties|shower|towel/i;
  const fanart=/(?:^|[^a-z])(?:pikachu|pokemon|pokémon|kanade|beast[\s_-]?tamer|arona|blue[\s_-]?archive)(?:$|[^a-z])/i;
  const pathPart='[a-z0-9_-]+';
  const imagePath=new RegExp('^/images/gallery/('+pathPart+'(?:/'+pathPart+'){1,5}\\.(?:png|jpe?g|webp))$','i');
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=30000&&height<=30000;
  function safeURL(value){
    try{const url=new URL(value,origin);return url.origin===origin&&!url.username&&!url.password&&!url.port&&!url.hash?url:null;}catch(e){return null;}
  }
  function galleryURL(value){
    const url=safeURL(value);
    if(!url||!new RegExp('^/gallery(?:/'+pathPart+'){0,5}$').test(url.pathname)||[...url.searchParams.keys()].some(key=>key!=='page')||url.searchParams.getAll('page').length>1)return null;
    const page=url.searchParams.get('page');if(page!==null&&(!/^[1-9]\d*$/.test(page)||Number(page)>50))return null;
    return url.href;
  }
  function cleanRecord(raw){
    if(!raw||raw.artist!==source.artist||raw.license!==source.license||raw.licenseUrl!==source.licenseUrl)return null;
    const original=safeURL(raw.download),page=galleryURL(raw.pageUrl),file=original&&!original.search?original.pathname.match(imagePath)?.[1]:null;
    if(!file||!page||new URL(page).pathname!=='/gallery/'+file.slice(0,file.lastIndexOf('/')))return null;
    if(/^(?:various-images-not-just-anime|weapon)\//.test(file))return null;
    const title=commons.plainText(raw.title),context=commons.plainText(raw.context),copyrightNotice=commons.plainText(raw.copyrightNotice);
    const description=file+' '+title+' '+String(raw.context||'');
    if(!title||blocked.test(description)||fanart.test(description)||!copyrightNotice.includes(source.license)||typeof raw.revision!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.revision)||!Number.isFinite(Date.parse(raw.revision)))return null;
    const preview=safeURL(raw.image);
    if(!preview||preview.search||preview.href!==original.href&&preview.pathname!=='/images/thumbs/'+file+'.webp')return null;
    return {title,artist:source.artist,context,copyrightNotice,download:original.href,image:preview.href,pageUrl:page,revision:raw.revision,license:source.license,licenseUrl:source.licenseUrl};
  }
  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      const record=cleanRecord(raw);if(!record||seen.has(record.download))continue;
      const {width,height,imageWidth,imageHeight}=raw;
      if(!validSize(width,height)||Math.max(width,height)<1536||Math.min(width,height)<1024||!validSize(imageWidth,imageHeight)||imageWidth>width||imageHeight>height||Math.abs(width*imageHeight/(height*imageWidth)-1)>=0.01||record.image===record.download&&(imageWidth!==width||imageHeight!==height))continue;
      seen.add(record.download);
      const feedRecord={...record,width,height,imageWidth,imageHeight};
      items.push({id:'ayomi-'+encodeURIComponent(new URL(record.download).pathname.slice('/images/gallery/'.length)),source:'commons',provider:'ayomi',...record,...(record.image!==record.download?{fallbackImage:record.download}:{}),width,height,categories:source.categories,tags:['二次元','插画','AI 插画',source.artist,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }
  function parseGallery(html,pageUrl){
    const page=galleryURL(pageUrl);if(!page)throw Error('画廊地址无效');
    const scripts=[...String(html||'').matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    const galleries=scripts.map(match=>JSON.parse(match[1])).filter(value=>value?.['@type']==='ImageGallery');
    if(galleries.length!==1||galleries[0].author?.name!==source.artist||galleries[0].author?.['@id']!==creator||galleries[0].author?.url!==origin+'/')throw Error('画廊作者信息无法核对');
    const footer=String(html).match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1]||'';
    if(!/All artworks are licensed under CC BY-NC-ND 4\.0/.test(commons.plainText(footer))||!footer.includes('href="'+source.licenseUrl.slice(0,-1)+'"'))throw Error('画廊分享许可无法核对');
    const stats=String(html).match(/<div\b[^>]*id="gallery-stats"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const text=commons.plainText(stats),total=Number(text.match(/Total: (\d+) (?:items|artworks)/)?.[1]),range=text.match(/Showing: (\d+)-(\d+)/),paging=text.match(/Page: (\d+) of (\d+)/);
    const first=Number(range?.[1]),last=Number(range?.[2]),current=Number(paging?.[1]),pages=Number(paging?.[2]),requested=Number(new URL(page).searchParams.get('page')||1);
    if(!Number.isSafeInteger(total)||total<0||total>5000||current!==requested||pages!==Math.max(1,Math.ceil(total/20))||pages>50||first!==(total?(current-1)*20+1:0)||last!==Math.min(total,current*20))throw Error('画廊分页信息不一致');
    const children=[];
    for(const article of String(html).matchAll(/<article\b[^>]*class="category-item"[^>]*>([\s\S]*?)<\/article>/gi)){
      const child=galleryURL(article[1].match(/<a\b[^>]*href="([^"]+)"/)?.[1]);
      if(!child||new URL(child).search||!new URL(child).pathname.startsWith(new URL(page).pathname+'/')||children.includes(child))throw Error('画廊目录包含无效或重复子分类');children.push(child);
    }
    const gallery=galleries[0],rootPage=new URL(page).pathname==='/gallery',images=rootPage?[]:gallery.image;
    if(rootPage){
      const list=gallery.mainEntity;if((children.length||list!==undefined)&&(list?.['@type']!=='ItemList'||list.numberOfItems!==children.length||!Array.isArray(list.itemListElement)||list.itemListElement.length!==children.length||list.itemListElement.some((entry,index)=>entry.item?.['@type']!=='CollectionPage'||galleryURL(entry.item.url)!==children[index])))throw Error('画廊分类与结构化目录不一致');
    }else if(!Array.isArray(images)||gallery.numberOfItems!==images.length)throw Error('作品列表与结构化目录不一致');
    const thumbnails=new Map();let displayed=0;
    for(const article of String(html).matchAll(/<article\b[^>]*class="gallery-item"[^>]*data-image="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi)){
      displayed++;
      const image=safeURL(article[1]),thumb=safeURL(article[2].match(/<img\b[^>]*src="([^"]+)"/)?.[1]);
      if(image&&thumb)thumbnails.set(image.href,thumb.href);
    }
    if((rootPage?children.length+displayed:images.length)!==last-first+(total?1:0)||!rootPage&&displayed!==images.length)throw Error('画廊页面未完整读取');
    const records=[],seen=new Set();
    for(const image of images){
      if(image?.['@type']!=='ImageObject'||image.contentUrl!==image.url||image['@id']!==image.url||image.creditText!==source.artist||image.creator?.['@id']!==creator||image.license?.replace(/\/?$/,'/')!==source.licenseUrl||!['image/png','image/jpeg','image/webp'].includes(image.encodingFormat))continue;
      const extension=image.contentUrl.split('.').pop().toLowerCase();if(image.encodingFormat!==({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'})[extension])continue;
      const record=cleanRecord({title:image.name,artist:image.creditText,download:image.contentUrl,image:thumbnails.get(image.contentUrl)||image.contentUrl,pageUrl:page,context:[image.description,image.caption,image.keywords].filter(Boolean).join(' '),copyrightNotice:image.copyrightNotice,revision:image.dateModified,license:source.license,licenseUrl:source.licenseUrl});
      if(record&&!seen.has(record.download)){records.push(record);seen.add(record.download);}
    }
    return {total,pages,current,children,records};
  }
  const api={source,galleryURL,normalizeRecords,parseGallery};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperAyomi=api;
})(typeof globalThis!=='undefined'?globalThis:this);
