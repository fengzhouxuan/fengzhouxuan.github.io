/* Author-published wallpaper repositories; image licenses are checked by the collector. */
(function(root){
  'use strict';
  const sources=Object.freeze({
    librepixels:{name:'LibrePixels',artist:'LibrePixels',host:'gitlab',repo:'librepixels/ia.Wallpapers',ref:'main',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
    folium:{name:'Folium Creations',artist:'Folium Creations',host:'github',repo:'FoliumCreations/Wallpapers',ref:'main',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
    midjourney:{name:'Metaory · AI 壁纸',artist:'metaory',host:'github',repo:'metaory/midjourney',ref:'master',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'}
  });
  const labels={anime:'二次元',illustration:'插画',nature:'风景',city:'城市',animals:'动物',minimal:'极简',abstract:'抽象',fantasy:'幻想',cyberpunk:'赛博朋克',pixel:'像素',cars:'汽车'};
  const excluded=/luffy|mariobros|hentai|ecchi|ahegao|futanari|lolicon|shotacon|nude|nudity|erotic|sexual|porn/i;

  function validPath(path,provider){
    if(typeof path!=='string'||path.length>500||/[\\\x00-\x1f?#]/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||!/[.](png|jpe?g|webp)$/i.test(path)||excluded.test(path))return false;
    if(provider==='librepixels')return /^wallpapers\/\[[^\]]+\]_librepixels_[^/]+$/i.test(path);
    if(provider==='folium')return /^(Abstract|De-Minted|HardSurface|Mint|Mobile|Mushroom|Nature)\//.test(path);
    return provider==='midjourney'&&/^assets\/[^/]+$/.test(path);
  }

  function categoriesFor(path,provider){
    const categories=new Set(),name=path.toLowerCase();
    if(provider==='librepixels'){
      const aliases={anime:['anime','illustration'],nature:['nature'],mountain:['nature'],beach:['nature'],abstract:['abstract'],minimal:['minimal'],animals:['animals'],cat:['animals'],buildings:['city'],urban:['city'],cars:['cars'],fantasy:['fantasy','illustration'],illustration:['illustration'],ciberpuck:['cyberpunk','city']};
      for(const tag of (name.match(/\[([^\]]+)\]/)?.[1]||'').split(','))for(const category of aliases[tag.trim()]||[])categories.add(category);
    }else if(provider==='folium'){
      categories.add(name.includes('nature/')||name.startsWith('mushroom/')?'nature':'abstract');
    }else{
      categories.add('illustration');
      if(/8bit|pixel|pixle/.test(name))categories.add('pixel');
      if(/cyberpunk|futuristic|futurestic|highway_tower/.test(name))categories.add('cyberpunk');
      if(/city|highrise|high_rise|tower|highway/.test(name))categories.add('city');
      if(/anime/.test(name))categories.add('anime');
      if(/(?:^|_)car(?:_|\.)/.test(name.split('/').pop()))categories.add('cars');
    }
    if(!categories.size)categories.add('illustration');
    return [...categories];
  }

  function urlsFor(path,provider){
    const source=sources[provider];if(!source||!validPath(path,provider))return null;
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    const pageUrl='https://'+source.host+'.com/'+source.repo+(source.host==='gitlab'?'/-/blob/':'/blob/')+source.ref+'/'+encoded;
    const download=source.host==='gitlab'?'https://gitlab.com/api/v4/projects/68715866/repository/files/'+encodeURIComponent(path)+'/raw?ref='+source.ref:'https://cdn.jsdelivr.net/gh/'+source.repo+'@'+source.ref+'/'+encoded;
    return {image:download,download,pageUrl,...(source.host==='github'?{fallbackImage:download.replace('cdn.jsdelivr.net','fastly.jsdelivr.net')}:{})};
  }

  function normalizeRepository(records,provider){
    const source=sources[provider];if(!source)return [];
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||!validPath(raw.path,provider)||typeof raw.revision!=='string'||! /^[a-f0-9]{40}$/.test(raw.revision)||raw.license!==source.license||raw.licenseUrl!==source.licenseUrl||seen.has(raw.path)||seen.has('sha:'+raw.revision))continue;
      const {width,height}=raw;
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width>30000||height>30000||Math.max(width,height)<1600||Math.min(width,height)<800)continue;
      const urls=urlsFor(raw.path,provider),categories=categoriesFor(raw.path,provider);
      const title=raw.path.split('/').pop().replace(/^\[[^\]]+\]_librepixels_/,'').replace(/\.(png|jpe?g|webp)$/i,'').replace(/_[a-f0-9]{6,10}$/,'').replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').slice(0,100);
      seen.add(raw.path);seen.add('sha:'+raw.revision);
      const feedRecord={path:raw.path,revision:raw.revision,license:source.license,licenseUrl:source.licenseUrl,width,height};
      items.push({id:'repo-'+provider+'-'+encodeURIComponent(raw.path),source:'commons',provider,title,artist:source.artist,...urls,width,height,license:source.license,licenseUrl:source.licenseUrl,categories,tags:[...categories.map(category=>labels[category]),...(provider==='folium'?[]:['AI 插画']),source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }

  const api={sources,validPath,categoriesFor,urlsFor,normalizeRepository};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperRepositories=api;
})(typeof globalThis!=='undefined'?globalThis:this);
