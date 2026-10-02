/* Free final-frame releases from the producer; each asset keeps its own license and attribution. */
(function(root){
  'use strict';
  const origin='https://studio.blender.org',artist='Blender Foundation / Blender Studio';
  const source=Object.freeze({name:'Blender Studio · 原创动画',categories:['illustration','fantasy','nature']});
  const license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/';
  const works=Object.freeze({
    'wing-it':{assetID:7037,projectName:'Wing It!',label:'Wing It!',title:'Wing It - Shot Frames',contributor:'Beau Gerbrands',attribution:'(CC) Blender Foundation | studio.blender.org',directory:'/projects/wing-it/3c402f7c9ab362/',licenseSource:'/projects/wing-it/pages/licensing/',member:/^\d{3}_\d{4}_[A-Z]\.jpg$/,categories:['illustration']},
    spring:{assetID:889,projectName:'Spring',label:'Spring',title:'Frames Selection',contributor:'Francesco Siddi',attribution:'© Blender Foundation | cloud.blender.org/spring',directory:'/projects/spring/5ca60d7ff6c1380028000924/',licenseSource:'/projects/spring/pages/about/',member:/^frames\/\d{1,6}\.png$/,categories:['illustration','fantasy','nature']}
  });
  const frameTitles=Object.freeze({
    'wing-it':{'010_0020_A.jpg':'焊接火花','010_0060_A.jpg':'小狗的飞行梦','020_0040_A.jpg':'进入驾驶舱','020_0100_A.jpg':'谷仓里的飞船','020_0130_A.jpg':'准备起飞','040_0070_A.jpg':'驾驶舱警报','050_0080_A.jpg':'窗外的飞鸡','060_0010_A.jpg':'穿过风暴','070_0030_A.jpg':'飞行后的谷仓'},
    spring:{'frames/1807.png':'云海前的少女','frames/3191.png':'古树下的仰望','frames/1669.png':'牧羊少女','frames/3250.png':'森林中的发现','frames/4336.png':'森林巨兽'}
  });
  const assetURL=key=>Object.hasOwn(works,key)?origin+'/projects/api/assets/'+works[key].assetID+'/?site_context=gallery':null;
  const pageFor=key=>Object.hasOwn(works,key)?origin+works[key].directory:null;
  function fileURL(value){
    try{
      const url=new URL(value),match=url.pathname.match(/^\/download-source\/files\/([a-f0-9]{2})\/([a-f0-9]{32})\/([a-f0-9]{32})\.zip$/);
      return url.origin===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&match&&match[1]===match[2].slice(0,2)&&match[2]===match[3]?url.href:null;
    }catch(error){return null;}
  }
  function originalPath(record){
    return /^[a-f0-9]{64}$/.test(record?.revision)&&['jpg','png'].includes(record?.extension)?'./originals/blender/'+record.revision+'.'+record.extension:null;
  }
  function normalizeRecords(records){
    const items=[],seen=new Set();
    for(const raw of Array.isArray(records)?records:[]){
      const work=raw&&Object.hasOwn(works,raw.work)?works[raw.work]:null;
      if(!work||raw.assetID!==work.assetID||raw.artist!==artist||raw.contributor!==work.contributor||raw.license!==license||raw.licenseUrl!==licenseUrl||raw.licenseSource!==origin+work.licenseSource||raw.pageUrl!==pageFor(raw.work))continue;
      const sourceFile=fileURL(raw.sourceFile),member=typeof raw.member==='string'?raw.member:'',download=originalPath(raw);
      if(!sourceFile||!work.member.test(member)||!download||!(/^[a-f0-9]{64}$/.test(raw.archiveRevision))||raw.extension!==(/\.png$/.test(member)?'png':'jpg'))continue;
      const {width,height,bytes}=raw;
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||width*height>60000000||!Number.isSafeInteger(bytes)||bytes<1||bytes>32*1024*1024)continue;
      const stem=member.split('/').pop().replace(/\.[^.]+$/,''),id='blender-'+work.assetID+'-'+stem.toLowerCase(),title=work.label+' · '+(frameTitles[raw.work][member]||'电影画面 '+stem);
      if(seen.has(id)||seen.has(download))continue;seen.add(id);seen.add(download);
      const feedRecord={work:raw.work,assetID:work.assetID,sourceFile,member,archiveRevision:raw.archiveRevision,revision:raw.revision,extension:raw.extension,bytes,width,height,title,artist,contributor:work.contributor,pageUrl:pageFor(raw.work),license,licenseUrl,licenseSource:origin+work.licenseSource};
      items.push({id,source:'commons',provider:'blender',...feedRecord,image:download,download,copyrightNotice:work.attribution+'。素材发布者：'+work.contributor+'。本站预览等比例缩小并转为 WebP；高清下载保留原文件。',categories:work.categories,tags:['原创动画','动画电影',work.label,source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }
  const api={origin,artist,source,license,licenseUrl,works,assetURL,pageFor,fileURL,originalPath,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperBlender=api;
})(typeof globalThis!=='undefined'?globalThis:this);
