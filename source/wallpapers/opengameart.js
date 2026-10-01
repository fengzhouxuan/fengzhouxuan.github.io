/* Individually verified author releases; collection titles do not grant image rights. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://opengameart.org',licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
  const source=Object.freeze({name:'OpenGameArt 场景',categories:['illustration','nature','fantasy','city','space']});
  const works=Object.freeze({
    painted:{slug:'40-game-backgrounds-1-painted-style-and-photorealistic',artist:'rubberduck',artistPath:'/users/rubberduck',archive:true,file:/^40-game-backgrounds-1-painted-style\.zip$/,member:/^40-game-backgrounds-1-painted-style\/bg-\d{2}\.JPG$/i,categories:['nature','illustration'],label:'绘画风景'},
    studies:{slug:'concept-art-studies-bundle-1',artist:'Eon Cire',artistPath:'/users/eon-cire',archive:true,file:/^Concept-Art-Studies(?:_\d+)?\.zip$/,member:/^Concept-Art-Studies\/(?!(?:.*(?:thumbnail|sketch|pistol|sheet|preview|sprite)))[a-z0-9_-]{1,100}\.(jpe?g|png|webp)$/i,categories:['fantasy','illustration'],label:'幻想场景'},
    underwater:{slug:'underwater-background-2',artist:'donte',artistPath:'/users/donte',file:/^bg(?:_\d+)?\.png$/,categories:['nature','illustration'],label:'水下世界'},
    skyline:{slug:'simple-city-silhouetteskyline-with-clouds',artist:'Gariot',artistPath:'/users/gariot',file:/^bg_silhouette2(?:_\d+)?\.png$/,categories:['city','illustration','minimal'],label:'城市剪影'},
    stars:{slug:'starsspace-background',artist:'leyren',artistPath:'/users/leyren',file:/^Starset(?:_\d+)?\.png$/,categories:['space','illustration'],label:'星云'}
  });

  function fileURL(value){
    try{
      const url=new URL(value),name=decodeURIComponent(url.pathname.slice('/sites/default/files/'.length));
      return url.origin===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/sites/default/files/')&&/^[a-z0-9 _().-]+\.(zip|png|jpe?g|webp)$/i.test(name)?url.href:null;
    }catch(error){return null;}
  }

  function originalPath(record){
    return /^[a-f0-9]{64}$/.test(record?.revision)&&['jpg','png','webp'].includes(record?.extension)?'./originals/opengameart/'+record.revision+'.'+record.extension:null;
  }

  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      const work=raw&&Object.hasOwn(works,raw.work)?works[raw.work]:null;if(!work||raw.artist!==work.artist||raw.license!=='CC0'||raw.licenseUrl!==licenseUrl||raw.pageUrl!==origin+'/content/'+work.slug)continue;
      const file=fileURL(raw.sourceFile),member=typeof raw.member==='string'?raw.member:'',download=originalPath(raw);
      if(!file||!work.file.test(decodeURIComponent(new URL(file).pathname.split('/').pop()))||!Number.isSafeInteger(raw.fileID)||raw.fileID<1||!download)continue;
      if(work.archive?!work.member.test(member):member!==decodeURIComponent(new URL(file).pathname.split('/').pop()))continue;
      if(raw.extension!==(/\.png$/i.test(member)?'png':/\.webp$/i.test(member)?'webp':'jpg'))continue;
      const {width,height,bytes}=raw;
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||width*height>60000000||!Number.isSafeInteger(bytes)||bytes<1||bytes>32*1024*1024)continue;
      const title=commons.plainText(raw.title),copyrightNotice=commons.plainText(raw.copyrightNotice),id='opengameart-'+raw.fileID+'-'+member.split('/').pop().toLowerCase().replace(/\.[^.]+$/,'');
      if(!title||seen.has(id)||seen.has(download))continue;seen.add(id);seen.add(download);
      const feedRecord={work:raw.work,fileID:raw.fileID,sourceFile:file,member,revision:raw.revision,extension:raw.extension,bytes,width,height,title,artist:work.artist,pageUrl:raw.pageUrl,license:'CC0',licenseUrl,copyrightNotice};
      items.push({id,source:'commons',provider:'opengameart',title,artist:work.artist,image:download,download,pageUrl:raw.pageUrl,width,height,license:'CC0',licenseUrl,copyrightNotice,categories:work.categories,tags:[work.label,source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }

  const api={origin,source,works,licenseUrl,fileURL,originalPath,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperOpenGameArt=api;
})(typeof globalThis!=='undefined'?globalThis:this);
