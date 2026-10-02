/* Individually verified author releases; collection titles do not grant image rights. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://opengameart.org',licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
  const source=Object.freeze({name:'OpenGameArt 场景',categories:['anime','illustration','nature','fantasy','city','space','minimal']});
  const works=Object.freeze({
    painted:{slug:'40-game-backgrounds-1-painted-style-and-photorealistic',artist:'rubberduck',artistPath:'/users/rubberduck',archive:true,file:/^40-game-backgrounds-1-painted-style\.zip$/,member:/^40-game-backgrounds-1-painted-style\/bg-\d{2}\.JPG$/i,categories:['nature','illustration'],label:'绘画风景'},
    studies:{slug:'concept-art-studies-bundle-1',artist:'Eon Cire',artistPath:'/users/eon-cire',archive:true,file:/^Concept-Art-Studies(?:_\d+)?\.zip$/,member:/^Concept-Art-Studies\/(?!(?:.*(?:thumbnail|sketch|pistol|sheet|preview|sprite)))[a-z0-9_-]{1,100}\.(jpe?g|png|webp)$/i,categories:['fantasy','illustration'],label:'幻想场景'},
    underwater:{slug:'underwater-background-2',artist:'donte',artistPath:'/users/donte',file:/^bg(?:_\d+)?\.png$/,categories:['nature','illustration'],label:'水下世界'},
    skyline:{slug:'simple-city-silhouetteskyline-with-clouds',artist:'Gariot',artistPath:'/users/gariot',file:/^bg_silhouette2(?:_\d+)?\.png$/,categories:['city','illustration','minimal'],label:'城市剪影'},
    stars:{slug:'starsspace-background',artist:'leyren',artistPath:'/users/leyren',file:/^Starset(?:_\d+)?\.png$/,categories:['space','illustration'],label:'星云'},
    manga:{slug:'manga-style-background',artist:'Kutejnikov',artistPath:'/users/kutejnikov',archive:'7z',file:/^manga_bg(?:_\d+)?\.7z$/,member:/^manga_bg_\d{2}\.png$/,categories:['anime','illustration','city'],label:'黑白漫画场景'},
    ink:{slug:'japanese-style-simple-backgrounds',artist:'Oyasumi',artistPath:'/users/oyasumi',file:/^(?:bamboo|sakura_tree|temple)(?:_\d+)?\.png$/,categories:['nature','illustration','minimal'],label:'日式水墨',titles:{bamboo:'竹林',sakura_tree:'樱花',temple:'鸟居'}},
    office:{slug:'visual-novel-tutorial-set',artist:'DasBilligeAlien',artistPath:'/users/dasbilligealien',archive:true,file:/^Belle Tutorial(?:_\d+)?\.zip$/,member:/^VN_tutorial_assets_background\.png$/,categories:['anime','illustration'],label:'视觉小说场景',titles:{VN_tutorial_assets_background:'办公室'}},
    sunny:{slug:'sunny-sky',artist:'LisadiKaprio',artistPath:'/users/lisadikaprio',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',file:/^sunny(?:_\d+)?\.png$/,categories:['anime','illustration','nature'],label:'手绘天空',titles:{sunny:'晴空与白云'}},
    rainy:{slug:'rainy-sky',artist:'LisadiKaprio',artistPath:'/users/lisadikaprio',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',file:/^rainy(?:_\d+)?\.png$/,categories:['anime','illustration','nature'],label:'手绘天空',titles:{rainy:'雨天云层'}},
    hallway:{slug:'hallway-daynight-background-for-visual-novels',artist:'LisadiKaprio',artistPath:'/users/lisadikaprio',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',file:/^entrance_-_(?:brightly_lit|dark_night)(?:_\d+)?\.png$/,categories:['anime','illustration'],label:'手绘走廊',titles:{'entrance_-_brightly_lit':'白昼玄关','entrance_-_dark_night':'夜间玄关'}},
    auditorium:{slug:'visual-novel-background-auditorium',artist:'frances',artistPath:'/users/frances',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',file:/^audi_scaled(?:_\d+)?\.png$/,categories:['anime','illustration'],label:'视觉小说场景',titles:{audi_scaled:'礼堂舞台'}},
    vnstyle:{slug:'visual-novel-style-backgrounds',artist:'queenofzan',artistPath:'/users/queenofzan',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',archive:true,file:/^visual novel style backgrounds(?:_\d+)?\.zip$/,member:/^(?:outside|bar|dressing room|green room)\.png$/,categories:['illustration','city'],label:'手绘场景',titles:{outside:'夜间后门',bar:'酒吧休息区','dressing room':'化妆间','green room':'后台休息室'}}
  });

  function fileURL(value){
    try{
      const url=new URL(value),name=decodeURIComponent(url.pathname.slice('/sites/default/files/'.length));
      return url.origin===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/sites/default/files/')&&/^[a-z0-9 _().-]+\.(zip|7z|png|jpe?g|webp)$/i.test(name)?url.href:null;
    }catch(error){return null;}
  }

  function originalPath(record){
    return /^[a-f0-9]{64}$/.test(record?.revision)&&['jpg','png','webp'].includes(record?.extension)?'./originals/opengameart/'+record.revision+'.'+record.extension:null;
  }

  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      const work=raw&&Object.hasOwn(works,raw.work)?works[raw.work]:null;if(!work)continue;
      const license=work.license||'CC0',workLicenseUrl=work.licenseUrl||licenseUrl;
      if(raw.artist!==work.artist||raw.license!==license||raw.licenseUrl!==workLicenseUrl||raw.pageUrl!==origin+'/content/'+work.slug)continue;
      const file=fileURL(raw.sourceFile),member=typeof raw.member==='string'?raw.member:'',download=originalPath(raw);
      if(!file||!work.file.test(decodeURIComponent(new URL(file).pathname.split('/').pop()))||!Number.isSafeInteger(raw.fileID)||raw.fileID<1||!download)continue;
      if(work.archive?!work.member.test(member):member!==decodeURIComponent(new URL(file).pathname.split('/').pop()))continue;
      if(raw.extension!==(/\.png$/i.test(member)?'png':/\.webp$/i.test(member)?'webp':'jpg'))continue;
      const {width,height,bytes}=raw;
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||width*height>60000000||!Number.isSafeInteger(bytes)||bytes<1||bytes>32*1024*1024)continue;
      const title=commons.plainText(raw.title),copyrightNotice=commons.plainText(raw.copyrightNotice),id='opengameart-'+raw.fileID+'-'+member.split('/').pop().toLowerCase().replace(/\.[^.]+$/,'');
      if(!title||seen.has(id)||seen.has(download))continue;seen.add(id);seen.add(download);
      const feedRecord={work:raw.work,fileID:raw.fileID,sourceFile:file,member,revision:raw.revision,extension:raw.extension,bytes,width,height,title,artist:work.artist,pageUrl:raw.pageUrl,license,licenseUrl:workLicenseUrl,copyrightNotice};
      items.push({id,source:'commons',provider:'opengameart',title,artist:work.artist,image:download,download,pageUrl:raw.pageUrl,width,height,license,licenseUrl:workLicenseUrl,copyrightNotice,categories:work.categories,tags:[work.label,source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }

  const api={origin,source,works,licenseUrl,fileURL,originalPath,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperOpenGameArt=api;
})(typeof globalThis!=='undefined'?globalThis:this);
