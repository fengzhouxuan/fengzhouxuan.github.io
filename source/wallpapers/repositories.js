/* Author-published wallpaper repositories; image licenses are checked by the collector. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const agundurLicenses=Object.freeze({'CC BY 4.0':'https://creativecommons.org/licenses/by/4.0/','CC BY-SA 4.0':'https://creativecommons.org/licenses/by-sa/4.0/'});
  const wallcolleLicenses=Object.freeze({...agundurLicenses,'CC BY-NC 4.0':'https://creativecommons.org/licenses/by-nc/4.0/','Public domain':'https://creativecommons.org/publicdomain/mark/1.0/'});
  const sources=Object.freeze({
    librepixels:{name:'LibrePixels',artist:'LibrePixels',host:'gitlab',repo:'librepixels/ia.Wallpapers',ref:'main',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
    folium:{name:'Folium Creations',artist:'Folium Creations',host:'github',repo:'FoliumCreations/Wallpapers',ref:'main',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
    midjourney:{name:'Metaory · AI 壁纸',artist:'metaory',host:'github',repo:'metaory/midjourney',ref:'master',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/'},
    sermor:{name:'Sermor · AI 壁纸',artist:'Sermoris',host:'github',repo:'Sermoris/sermor-ai-wallpapers',ref:'main',commitPinned:true,license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',categories:['anime','illustration','nature','city','abstract','fantasy','cyberpunk','space']},
    sermornc:{name:'Sermor · 非商业 AI 壁纸',artist:'Sermoris',host:'github',repo:'Sermoris/sermor-ai-generated-wallpapers',ref:'main',commitPinned:true,license:'CC BY-NC-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-nc-sa/4.0/',categories:['illustration','nature','city','fantasy','cyberpunk','space']},
    agundur:{name:'Agundur · 4K',artist:'Agundur',host:'github',repo:'Agundur-KDE/Wallpapers',ref:'main',licenses:agundurLicenses,categories:['anime','illustration','nature','city','animals','minimal','fantasy','cyberpunk','space']},
    wallcolle:{name:'AOSC 社区壁纸',host:'github',repo:'AOSC-Archive/WallColle',ref:'master',licenses:wallcolleLicenses,categories:['nature','city','space']}
  });
  const labels={anime:'二次元',illustration:'插画',nature:'风景',city:'城市',animals:'动物',minimal:'极简',abstract:'抽象',fantasy:'幻想',cyberpunk:'赛博朋克',pixel:'像素',cars:'汽车',space:'星空'};
  const excluded=/luffy|mariobros|hentai|ecchi|ahegao|futanari|lolicon|shotacon|nude|nudity|erotic|sexual|porn/i;

  function sermorWorkKey(path){
    if(typeof path!=='string'||! /^[A-Za-z][A-Za-z0-9 &.:_-]{0,140}[_:]\d{3,5}x\d{3,5}\.png$/.test(path))return null;
    return path.replace(/[_:]\d+x\d+\.png$/,'').replace(/_+$/,'').toLowerCase();
  }

  function sermorDeclarationLicensed(markdown,license,provider){
    if(!['sermor','sermornc'].includes(provider)||typeof markdown!=='string'||typeof license!=='string'||markdown.length>131072||license.length>131072||/except|third.party|all rights reserved|not allowed|not permitted/i.test(markdown))return false;
    if(provider==='sermor')return /images created by me using artificial intelligence/i.test(markdown)&&/^All images in this repository are released via Creative Commons Zero License V1\.0 Universal \(CC0\)\.\s*$/m.test(markdown)&&/^Creative Commons Legal Code\s+CC0 1\.0 Universal\b/.test(license);
    return /^Wallpapers created by me using AI\.\s*$/m.test(markdown)&&/^Images released under CC BY-NC-SA 4\.0 \(Creative Commons Attribution-NonCommercial-ShareAlike 4\.0 International\) license: https:\/\/creativecommons\.org\/licenses\/by-nc-sa\/4\.0\/legalcode\s*$/m.test(markdown)&&/^Attribution-NonCommercial-ShareAlike 4\.0 International\b/.test(license);
  }

  function validPath(path,provider){
    if(typeof path!=='string'||path.length>500||/[\\\x00-\x1f?#]/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')||!/[.](png|jpe?g|webp)$/i.test(path)||excluded.test(path))return false;
    if(provider==='librepixels')return /^wallpapers\/\[[^\]]+\]_librepixels_[^/]+$/i.test(path);
    if(provider==='folium')return /^(Abstract|De-Minted|HardSurface|Mint|Mobile|Mushroom|Nature)\//.test(path);
    if(provider==='agundur')return /^[a-z0-9]+(?:-[a-z0-9]+)*-4k\.png$/.test(path);
    if(['sermor','sermornc'].includes(provider))return sermorWorkKey(path)!==null&&!/sensual|drowinspired/i.test(path);
    if(provider==='wallcolle')return /^contributors\/[a-zA-Z0-9_-]{1,80}\/(?:0|[1-9][0-9]{0,5})\.(jpg|png)$/.test(path);
    return provider==='midjourney'&&/^assets\/[^/]+$/.test(path);
  }

  function categoriesFor(path,provider,description=''){
    const categories=new Set(),name=path.toLowerCase();
    if(provider==='librepixels'){
      const aliases={anime:['anime','illustration'],nature:['nature'],mountain:['nature'],beach:['nature'],abstract:['abstract'],minimal:['minimal'],animals:['animals'],cat:['animals'],buildings:['city'],urban:['city'],cars:['cars'],fantasy:['fantasy','illustration'],illustration:['illustration'],ciberpuck:['cyberpunk','city']};
      for(const tag of (name.match(/\[([^\]]+)\]/)?.[1]||'').split(','))for(const category of aliases[tag.trim()]||[])categories.add(category);
    }else if(provider==='folium'){
      categories.add(name.includes('nature/')||name.startsWith('mushroom/')?'nature':'abstract');
    }else if(provider==='agundur'){
      const content=name+' '+commons.plainText(description).toLowerCase();categories.add('illustration');
      for(const [category,pattern] of Object.entries({anime:/anime|samurai woman/,nature:/bonsai|tree|garden|mountain|highlands|lake/,city:/city|town|street|skyline/,animals:/cat gardener|cyborg tiger|penguin|tux/,minimal:/minimalist/,fantasy:/fantasy|dragon|floating-islands|excalibur/,cyberpunk:/cyberpunk|cybernetic|steampunk/,space:/nebula|galaxy|milky way|shooting stars/}))if(pattern.test(content))categories.add(category);
    }else if(['sermor','sermornc'].includes(provider)){
      const content=path.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();categories.add('illustration');
      for(const [category,pattern] of Object.entries({anime:/\banime\b/,nature:/forest|landscape|mountain|valley|hills|shoreline|coastal|sky meets the sea|silent bay|summer/,city:/city|metropolis|citadel|pagoda|skyscraper|rome|tower/,abstract:/abstract|minimal|silhouette|binary/,fantasy:/fantasy|elf|elven|elvish|witch|enchantress|knight|valkyrie|ethereal|alien|two moons|dreamscape/,cyberpunk:/cyberpunk|cybernetic|cyberlab|neon|steampunk|brass|electric|steel/,space:/galaxy|nebula|orbital|starry|aurora|celestial/}))if(pattern.test(content))categories.add(category);
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

  function parseAgundurDeclaration(markdown){
    const content=typeof markdown==='string'?markdown:'';
    if(content.length>100000||! /built by \[Agundur\]\(https:\/\/www\.agundur\.de\)/.test(content)||!content.includes('\n## Wallpapers\n'))return null;
    const section=content.split('\n## Wallpapers\n')[1].split('\n## ')[0],records=[],seen=new Set();
    const blocks=[...section.matchAll(/^### ([^\n]+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];if(!blocks.length)return null;
    for(const [,heading,body] of blocks){
      const files=[...body.matchAll(/^- File: `([^`]+)`\s*$/gm)];if(files.length!==1)return null;
      const path=files[0][1];if(seen.has(path))return null;seen.add(path);
      const licenses=[...body.matchAll(/^- License: \[([^\]]+)\]\(([^)]+)\)/gm)];
      if(!validPath(path,'agundur')||licenses.length!==1)continue;
      const [,label,licenseUrl]=licenses[0],license=Object.keys(agundurLicenses).find(key=>agundurLicenses[key]===licenseUrl);
      if(!license||label!==(license==='CC BY-SA 4.0'?'CC BY-SA':license))continue;
      const originalDescription=body.split(/^- File:/m)[0],title=commons.plainText(heading),description=commons.plainText(originalDescription);
      if(!title||title.length>100||originalDescription.length>3000)continue;
      records.push({path,title,description,license,licenseUrl});
    }
    return records;
  }

  function validWallcolleTags(tags){
    return Array.isArray(tags)&&tags.length>0&&tags.length<=20&&tags.every(tag=>typeof tag==='string'&&tag.length<=50&&/^[a-zA-Z][a-zA-Z ]*$/.test(tag));
  }

  function wallcolleCategories(tags){
    const categories=new Set();
    for(const tag of Array.isArray(tags)?tags:[]){
      if(['Civil','Metropolis'].includes(tag))categories.add('city');
      if(['Nature','Water','Mountain','Plant','Garden'].includes(tag))categories.add('nature');
      if(tag==='Astronomy')categories.add('space');
    }
    return [...categories];
  }

  function parseWallcolleDeclaration(raw,manifestPath){
    const match=typeof manifestPath==='string'&&manifestPath.match(/^contributors\/([a-zA-Z0-9_-]{1,80})\/me\.json$/);
    if(!match||!raw||raw.uname!==match[1]||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||!Array.isArray(raw.wallpapers)||raw.wallpapers.length>1000)return null;
    const artist=commons.plainText(raw.name);if(!artist)return null;
    const records=[],seen=new Set();
    for(const work of raw.wallpapers){
      if(!work||!Number.isSafeInteger(work.i)||work.i<0||work.i>999999||seen.has(work.i)||typeof work.l!=='string')return null;
      seen.add(work.i);
      const license=work.l==='Public Domain'?'Public domain':work.l;
      if(!Object.hasOwn(wallcolleLicenses,license))continue;
      const path='contributors/'+raw.uname+'/'+work.i+'.'+work.f,title=commons.plainText(work.t);
      if(!validPath(path,'wallcolle')||typeof work.t!=='string'||work.t.length>100||!title||excluded.test(title)||!validWallcolleTags(work.tags)||!wallcolleCategories(work.tags).length)continue;
      records.push({path,title,artist,tags:[...work.tags],license,licenseUrl:wallcolleLicenses[license]});
    }
    return records;
  }

  function urlsFor(path,provider,commit){
    const source=sources[provider];if(!source||!validPath(path,provider))return null;
    const pinned=provider==='wallcolle'||source.commitPinned;
    if(pinned&&(typeof commit!=='string'||! /^[a-f0-9]{40}$/.test(commit)))return null;
    const ref=pinned?commit:source.ref;
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    const pagePath=provider==='wallcolle'?encoded.replace(/\/[^/]+$/,'/me.json'):encoded;
    const pageUrl='https://'+source.host+'.com/'+source.repo+(source.host==='gitlab'?'/-/blob/':'/blob/')+ref+'/'+pagePath;
    const download=source.host==='gitlab'?'https://gitlab.com/api/v4/projects/68715866/repository/files/'+encodeURIComponent(path)+'/raw?ref='+source.ref:'https://cdn.jsdelivr.net/gh/'+source.repo+'@'+ref+'/'+encoded;
    if(source.commitPinned){
      const original='https://raw.githubusercontent.com/'+source.repo+'/'+ref+'/'+encoded;
      return {image:download,download:original,pageUrl,fallbackImage:original};
    }
    return {image:download,download,pageUrl,...(source.host==='github'?{fallbackImage:download.replace('cdn.jsdelivr.net','fastly.jsdelivr.net')}:{})};
  }

  function normalizeRepository(records,provider){
    const source=sources[provider];if(!source)return [];
    const items=[],seen=new Set(),input=Array.isArray(records)?records.slice():[];
    if(source.commitPinned)input.sort((a,b)=>(Number(b?.width)*Number(b?.height)||0)-(Number(a?.width)*Number(a?.height)||0));
    for(const raw of input){
      const perImage=provider==='agundur'?agundurLicenses:provider==='wallcolle'?wallcolleLicenses:null;
      const license=perImage&&Object.hasOwn(perImage,raw?.license)?raw.license:source.license,licenseUrl=perImage?perImage[license]:source.licenseUrl;
      if(!raw||!license||!validPath(raw.path,provider)||typeof raw.revision!=='string'||! /^[a-f0-9]{40}$/.test(raw.revision)||raw.license!==license||raw.licenseUrl!==licenseUrl||seen.has(raw.path)||seen.has('sha:'+raw.revision))continue;
      const {width,height}=raw;
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width>30000||height>30000||Math.max(width,height)<1600||Math.min(width,height)<800)continue;
      if(provider==='agundur'&&(width!==3840||height!==2160||typeof raw.description!=='string'||raw.description.length>3000))continue;
      if(provider==='wallcolle'&&(width*height>60000000||typeof raw.declarationRevision!=='string'||! /^[a-f0-9]{40}$/.test(raw.declarationRevision)||typeof raw.artist!=='string'||!raw.artist.trim()||raw.artist.length>100||typeof raw.title!=='string'||raw.title.length>100||!validWallcolleTags(raw.tags)||excluded.test(raw.title)))continue;
      const workKey=source.commitPinned?sermorWorkKey(raw.path):null;
      if(source.commitPinned){
        const dimensions=raw.path.match(/[_:](\d+)x(\d+)\.png$/);
        if(width*height>60000000||width!==Number(dimensions[1])||height!==Number(dimensions[2])||typeof raw.declarationRevision!=='string'||! /^[a-f0-9]{40}$/.test(raw.declarationRevision)||seen.has('work:'+workKey))continue;
      }
      const description=provider==='agundur'?commons.plainText(raw.description):'',urls=urlsFor(raw.path,provider,raw.commit),categories=provider==='wallcolle'?wallcolleCategories(raw.tags):categoriesFor(raw.path,provider,description);
      const title=perImage?commons.plainText(raw.title):raw.path.split('/').pop().replace(/^\[[^\]]+\]_librepixels_/,'').replace(source.commitPinned?/[_:]\d+x\d+\.png$/:/\.(png|jpe?g|webp)$/i,'').replace(/_[a-f0-9]{6,10}$/,'').replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim().slice(0,100);
      const artist=provider==='wallcolle'?commons.plainText(raw.artist):source.artist;
      if(!urls||!categories.length||!artist||!title||title.length>100||description.length>3000)continue;
      seen.add(raw.path);seen.add('sha:'+raw.revision);
      if(workKey)seen.add('work:'+workKey);
      const feedRecord={path:raw.path,revision:raw.revision,license,licenseUrl,width,height,...(provider==='agundur'?{title,description}:provider==='wallcolle'?{title,artist,tags:[...raw.tags],commit:raw.commit,declarationRevision:raw.declarationRevision}:source.commitPinned?{commit:raw.commit,declarationRevision:raw.declarationRevision}:{})};
      items.push({id:'repo-'+provider+'-'+encodeURIComponent(raw.path),source:'commons',provider,title,artist,...urls,width,height,license,licenseUrl,categories,tags:[...categories.map(category=>labels[category]),...(['librepixels','midjourney'].includes(provider)||source.commitPinned?['AI 插画']:provider==='agundur'?['创作方式未注明']:[]),source.name,width>=height?'横屏':'竖屏'],...(perImage||source.commitPinned?{copyrightNotice:'本站预览等比例缩小为 WebP，高清入口保留作者原图。'+(provider==='wallcolle'?' 原作编号：'+raw.path.split('/').pop().split('.')[0]+'；逐图许可见来源清单。':'')}:{}),feedRecord});
    }
    return items;
  }

  const api={sources,validPath,categoriesFor,sermorWorkKey,sermorDeclarationLicensed,parseAgundurDeclaration,parseWallcolleDeclaration,wallcolleCategories,urlsFor,normalizeRepository};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperRepositories=api;
})(typeof globalThis!=='undefined'?globalThis:this);
