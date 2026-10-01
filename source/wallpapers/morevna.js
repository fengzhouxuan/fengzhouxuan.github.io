/* Morevna's licensed gallery; unrelated blog images and unfinished studies are excluded. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const source=Object.freeze({name:'Morevna Project',categories:['anime','illustration'],gallery:'https://morevnaproject.org/anime/gallery/',api:'https://morevnaproject.org/wp-json/wp/v2/',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'});
  const categories=Object.freeze({artworks:365,backgrounds:321});
  const excluded=/nsfw|nudity|nude|erotic|sexual|porn|all rights reserved|no redistribution|CC[- ]BY[- ](?:NC|SA)/i;

  function safeURL(value,path){
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='morevnaproject.org'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&path.test(url.pathname)?url.href:null;}catch(e){return null;}
  }
  const imageURL=value=>safeURL(value,/^\/wp-content\/uploads\/\d{4}\/(0[1-9]|1[0-2])\/[a-z0-9_.-]+\.(png|jpe?g|webp)$/i);
  const workURL=value=>safeURL(value,/^\/artwork\/[a-z0-9-]+\/$/);
  const artistURL=value=>safeURL(value,/^\/artist\/[a-z0-9-]+\/$/);
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=30000&&height<=30000;
  const sameRatio=(width,height,otherWidth,otherHeight)=>Math.abs(width*otherHeight/(height*otherWidth)-1)<0.01;

  function relatedPreview(download,image,width,height){
    if(image===download)return true;
    const original=new URL(download),preview=new URL(image),stem=original.pathname.replace(/-scaled(?=\.)/,'').replace(/\.(png|jpe?g|webp)$/i,'');
    return preview.pathname===stem+'-'+width+'x'+height+original.pathname.match(/\.[^.]+$/)[0];
  }

  function galleryLicensed(html){
    return [...String(html||'').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].some(match=>commons.plainText(match[1])==='A collection of images made for Morevna anime and distributed freely under CC-BY 4.0 license');
  }

  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||!Number.isSafeInteger(raw.workID)||raw.workID<1||!Number.isSafeInteger(raw.mediaID)||raw.mediaID<1||!['artwork','background'].includes(raw.kind)||raw.license!==source.license||raw.licenseUrl!==source.licenseUrl||raw.licenseSource!==source.gallery)continue;
      const {width,height,imageWidth,imageHeight,mediaWidth,mediaHeight}=raw,title=commons.plainText(raw.title),artist=commons.plainText(raw.artist);
      if(!title||!artist||excluded.test(title+' '+artist)||!validSize(width,height)||Math.max(width,height)<1600||Math.min(width,height)<800||!validSize(imageWidth,imageHeight)||!sameRatio(width,height,imageWidth,imageHeight)||!validSize(mediaWidth,mediaHeight)||!sameRatio(width,height,mediaWidth,mediaHeight))continue;
      const download=imageURL(raw.download),image=imageURL(raw.image),pageUrl=workURL(raw.pageUrl);
      if(!image||!download||!pageUrl||!Array.isArray(raw.artistUrls)||!raw.artistUrls.length||raw.artistUrls.some(url=>!artistURL(url)))continue;
      if(!relatedPreview(download,image,imageWidth,imageHeight)||image===download&&(width!==imageWidth||height!==imageHeight))continue;
      if(typeof raw.revision!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw.revision)||seen.has(raw.workID)||seen.has(download))continue;
      seen.add(raw.workID);seen.add(download);
      const creditNote=commons.plainText(raw.creditNote);
      const feedRecord={workID:raw.workID,mediaID:raw.mediaID,kind:raw.kind,title,artist,artistUrls:[...new Set(raw.artistUrls)],creditNote,image,download,pageUrl,width,height,imageWidth,imageHeight,mediaWidth,mediaHeight,revision:raw.revision,license:source.license,licenseUrl:source.licenseUrl,licenseSource:source.gallery};
      items.push({id:'morevna-'+raw.workID,source:'commons',provider:'morevna',title,artist:artist+(creditNote?' · '+creditNote:''),image,download,pageUrl,width,height,license:source.license,licenseUrl:source.licenseUrl,categories:source.categories,tags:['二次元','插画',...(raw.kind==='background'?['场景']:[]),source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }

  function parseWork(raw){
    const media=raw?._embedded?.['wp:featuredmedia']?.[0],groups=raw?._embedded?.['wp:term'];
    if(raw?.status!=='publish'||raw.type!=='artwork'||raw.content?.protected===true||!media||media.id!==raw.featured_media||media.media_type!=='image'||!['image/jpeg','image/png','image/webp'].includes(media.mime_type)||!Array.isArray(groups)||groups.some(group=>!Array.isArray(group)))return null;
    const terms=groups.flat(),declared=Array.isArray(raw.artwork_category)?raw.artwork_category:[];
    const matching=terms.filter(term=>term?.taxonomy==='artwork_category'&&Object.hasOwn(categories,term.slug)&&term.id===categories[term.slug]&&declared.includes(term.id));
    const authorIDs=Array.isArray(raw.artist)?raw.artist:[],authors=authorIDs.map(id=>terms.find(term=>term?.taxonomy==='artist'&&term.id===id));
    if(!matching.length||!authors.length||authorIDs.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(authorIDs).size!==authorIDs.length||authors.some(author=>!author||!commons.plainText(author.name)||!artistURL(author.link)))return null;
    const details=media.media_details,display=imageURL(media.source_url),width=details?.width,height=details?.height;
    const content=commons.plainText(raw.content?.rendered);
    if(!display||!validSize(width,height)||excluded.test(content))return null;
    let download=display;
    if(details.original_image){
      if(details.original_image!==display.split('/').pop().replace(/-scaled(?=\.)/,''))return null;
      download=imageURL(new URL(details.original_image,display).href);if(!download)return null;
    }
    const sizes=Object.values(details.sizes||{}).filter(size=>size&&imageURL(size.source_url)&&validSize(size.width,size.height)&&Math.max(size.width,size.height)>=768&&Math.max(size.width,size.height)<=1600&&sameRatio(width,height,size.width,size.height)&&relatedPreview(download,size.source_url,size.width,size.height)).sort((a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height));
    const preview=sizes[0];
    const record={workID:raw.id,mediaID:media.id,kind:matching.some(term=>term.slug==='backgrounds')?'background':'artwork',title:raw.title?.rendered,artist:authors.map(author=>commons.plainText(author.name)).join(' / '),artistUrls:authors.map(author=>author.link),creditNote:content.includes('Pepper&Carrot')&&content.includes('David Revoy')?'Pepper&Carrot 角色：David Revoy':'',image:preview?.source_url||download,download,pageUrl:raw.link,width,height,imageWidth:preview?.width||width,imageHeight:preview?.height||height,mediaWidth:width,mediaHeight:height,revision:raw.modified_gmt,license:source.license,licenseUrl:source.licenseUrl,licenseSource:source.gallery};
    return normalizeRecords([record])[0]?.feedRecord||null;
  }

  const api={source,categories,galleryLicensed,normalizeRecords,parseWork};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperMorevna=api;
})(typeof globalThis!=='undefined'?globalThis:this);
