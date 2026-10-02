const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const repositories=require('../source/wallpapers/repositories.js');
const feeds=require('../source/wallpapers/feeds.js');
const previews=require('../source/wallpapers/previews.js');
const collector=require('../scripts/refresh-wallpaper-feeds.cjs');
const builder=require('../scripts/build-wallpaper-previews.cjs');
const commit='c'.repeat(40),revision='a'.repeat(40),logger={log(){},warn(){}},now=new Date('2026-10-02T12:00:00Z');
const hash=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const readmes={sermor:'Images created by me using artificial intelligence.\n\nAll images in this repository are released via Creative Commons Zero License V1.0 Universal (CC0).\n',sermornc:'Wallpapers created by me using AI.\n\nImages released under CC BY-NC-SA 4.0 (Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International) license: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode\n'};
const licenses={sermor:'Creative Commons Legal Code\n\nCC0 1.0 Universal\n',sermornc:'Attribution-NonCommercial-ShareAlike 4.0 International\n'};
const record=(provider='sermor',extra={})=>({path:'EtherealAnimeGirl_1920x1080.png',revision,width:1920,height:1080,license:repositories.sources[provider].license,licenseUrl:repositories.sources[provider].licenseUrl,commit,declarationRevision:'b'.repeat(40),...extra});

function api({provider='sermor',images=[{path:record().path,sha:revision,size:1000}],readme=readmes[provider],license=licenses[provider],ref=commit,change=()=>{}}={}){
  const bytes=new Map(),declarations=[['README.md',readme],['LICENSE',license]].map(([path,value])=>{
    const data=Buffer.from(value),sha=hash(data);bytes.set(sha,data);return {type:'blob',path,sha,size:data.length};
  });
  const tree={truncated:false,tree:[...declarations,...images.map(image=>({type:'blob',...image}))]};
  change(tree);
  return async url=>{
    let body;
    if(url.endsWith('/commits/main'))body={sha:ref};
    else if(url.endsWith('/git/trees/'+ref+'?recursive=1'))body=tree;
    else if(url.includes('/git/blobs/')){const data=bytes.get(url.split('/').pop());if(!data)throw Error('Unknown blob');body={encoding:'base64',content:data.toString('base64')};}
    else throw Error('Unexpected request');
    return {ok:true,json:async()=>body};
  };
}

test('Sermor paths accept original PNG names and normalize only resolution variants',()=>{
  assert.equal(repositories.sermorWorkKey('DigitalArtworkPortrait01_1920x1080.png'),'digitalartworkportrait01');
  assert.equal(repositories.sermorWorkKey('DigitalArtworkPortrait01_3072x1728.png'),'digitalartworkportrait01');
  assert.equal(repositories.sermorWorkKey('Cyberlab:4096x2304.png'),'cyberlab');
  assert.equal(repositories.sermorWorkKey('FuturisticLandscape__1920x1080.png'),'futuristiclandscape');
  for(const provider of ['sermor','sermornc']){
    for(const filename of [record().path,'Brass&Steam_4096x2304.png','NoirStylePortraitOf aJazzLounge_1920x1080.png','OldRuinPanoramicView.5_1920x1080.png'])assert.ok(repositories.validPath(filename,provider));
    for(const filename of [null,'../Girl_1920x1080.png','nested/Girl_1920x1080.png','Girl_1920x1080.jpg','Girl_1920x1080.PNG','Girl_1920x1080.png?x','Girl_1920x1080.png#x','Girl\u0000_1920x1080.png','Girl_20x20.png','x'.repeat(150)+'_1920x1080.png','NudeGirl_1920x1080.png','SensualWoman_1920x1080.png','ElfFemaleDrowInspired01_4096x2304.png'])assert.equal(repositories.validPath(filename,provider),false);
  }
  for(const invalid of [null,12,'file.png','nested/Girl_1920x1080.png'])assert.equal(repositories.sermorWorkKey(invalid),null);
});

test('Sermor checks the author image grant and matching legal document instead of a repository code license',()=>{
  for(const provider of ['sermor','sermornc']){
    assert.equal(repositories.sermorDeclarationLicensed(readmes[provider],licenses[provider],provider),true);
    for(const [readme,legal] of [[null,licenses[provider]],[readmes[provider],null],[readmes[provider],'MIT'],['Images from the internet.\n'+readmes[provider].split('\n\n')[1],licenses[provider]],[readmes[provider]+'Except third-party images.',licenses[provider]],[readmes[provider].replace(/CC0|CC BY-NC-SA/g,'All rights reserved'),licenses[provider]],[readmes[provider],licenses[provider].repeat(20000)]])assert.equal(repositories.sermorDeclarationLicensed(readme,legal,provider),false);
  }
  assert.equal(repositories.sermorDeclarationLicensed(readmes.sermor,licenses.sermor,'unknown'),false);
  assert.equal(repositories.sermorDeclarationLicensed(readmes.sermornc.replace('/by-nc-sa/','/by-nc-nd/'),licenses.sermornc,'sermornc'),false);
  assert.equal(repositories.sermorDeclarationLicensed('x'.repeat(131073),licenses.sermor,'sermor'),false);
});

test('Sermor binds native dimensions, immutable URLs, credits and the best verified resolution of each work',()=>{
  for(const provider of ['sermor','sermornc']){
    const low=record(provider),high=record(provider,{path:'EtherealAnimeGirl_4096x2304.png',revision:'d'.repeat(40),width:4096,height:2304});
    const [item]=repositories.normalizeRepository([low,high,low],provider);
    assert.equal(item.feedRecord.path,high.path);assert.equal(item.artist,'Sermoris');assert.equal(item.title,'Ethereal Anime Girl');
    assert.ok(item.categories.includes('anime'));assert.ok(item.tags.includes('AI 插画'));assert.match(item.copyrightNotice,/等比例/);
    assert.equal(repositories.normalizeRepository([low,high],provider).length,1);assert.deepEqual(feeds.normalizeFeed([item.feedRecord],provider),[item]);
    assert.equal(item.download,'https://raw.githubusercontent.com/'+repositories.sources[provider].repo+'/'+commit+'/'+high.path);assert.ok(item.pageUrl.includes('/blob/'+commit+'/'));assert.ok(item.image.includes('@'+commit+'/'));assert.equal(item.fallbackImage,item.download);
    assert.equal(repositories.urlsFor('Brass&Steam_4096x2304.png',provider,commit).download.split('/').pop(),'Brass%26Steam_4096x2304.png');
    for(const value of [null,'main','bad','z'.repeat(40)])assert.equal(repositories.urlsFor(low.path,provider,value),null);
    for(const extra of [{width:4096},{commit:null},{declarationRevision:null},{declarationRevision:'bad'},{license:'MIT'},{licenseUrl:'https://example.com/'},{width:20000,height:4000,path:'Scene_20000x4000.png'}])assert.deepEqual(repositories.normalizeRepository([record(provider,extra)],provider),[]);
    const invalid={...high,width:4095};assert.deepEqual(repositories.normalizeRepository([invalid,low],provider).map(x=>x.feedRecord),[low]);
  }
  assert.equal(feeds.licenseHint('CC BY-NC-SA 4.0'),'署名 · 非商业 · 相同方式共享');
  assert.ok(!repositories.categoriesFor('NoirOldFashionWoman_1920x1080.png','sermor').includes('anime'));
  assert.ok(repositories.categoriesFor('CyberpunkCityRainSoaked_1920x1080.png','sermor').includes('city'));
  assert.deepEqual(repositories.normalizeRepository(null,'sermor'),[]);
});

test('Sermor discovers only native image files under the hash-verified grant at one commit',async()=>{
  const images=[{path:record().path,sha:revision,size:1000},{path:'Scene_4096x2304.png',sha:'d'.repeat(40),size:32*1024*1024+1},{path:'preview.png',sha:'e'.repeat(40),size:1000}];
  for(const provider of ['sermor','sermornc']){
    const files=await collector.repositoryFiles(provider,api({provider,images}));
    assert.equal(files.length,1);assert.equal(files[0].commit,commit);assert.match(files[0].declarationRevision,/^[a-f0-9]{40}$/);assert.equal(files[0].revision,revision);
    assert.ok(!Object.hasOwn(files[0],'size'));
  }
});

test('Sermor refresh reuses unchanged files, preserves failed replacements and removes missing works',async()=>{
  let measurements=0;
  const options={providerIds:['sermor'],logger,now,dimensions:async(fetcher,url)=>{measurements++;assert.ok(url.includes('@'+commit+'/'));return {width:1920,height:1080};}};
  const initial=await collector.refreshCatalog({...options,fetcher:api()});assert.equal(initial.failures,0);assert.equal(measurements,1);
  const reused=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:api({ref:'d'.repeat(40)})});assert.equal(measurements,1);assert.equal(reused.catalog.records.sermor[0].commit,'d'.repeat(40));
  const changed=api({ref:'e'.repeat(40),images:[{path:record().path,sha:'f'.repeat(40),size:1000}]});
  const failed=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:changed,dimensions:async()=>{throw Error('Timeout');}});
  assert.deepEqual(failed.catalog.records.sermor,initial.catalog.records.sermor);assert.equal(failed.catalog.records.sermor[0].commit,commit);
  const removed=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:api({images:[]})});assert.deepEqual(removed.catalog.records.sermor,[]);
  const previous={...initial.catalog,records:{...initial.catalog.records,sermornc:[record('sermornc')]},updatedAt:{...initial.catalog.updatedAt,sermornc:'2026-10-01T00:00:00Z'}};
  const selective=await collector.refreshCatalog({...options,previous,fetcher:api()});assert.deepEqual(selective.catalog.records.sermornc,previous.records.sermornc);assert.equal(selective.catalog.updatedAt.sermornc,previous.updatedAt.sermornc);
});

test('Sermor refuses incomplete, mismatched or changed grants while keeping the last verified snapshot',async()=>{
  const previous={version:1,records:{sermor:[record()]},updatedAt:{sermor:'2026-10-01T00:00:00Z'}};
  const changes=[tree=>tree.truncated=true,tree=>tree.tree=null,tree=>tree.tree=[],tree=>tree.tree.push(tree.tree[0]),tree=>tree.tree[0].sha='bad',tree=>tree.tree[0].size=131073,tree=>tree.tree[0].size++,tree=>tree.tree[2].size=0,tree=>tree.tree=Array(10001).fill(tree.tree[0])];
  for(const fetcher of [...changes.map(change=>api({change})),api({ref:'bad'}),api({readme:'All rights reserved.'}),async()=>{throw Error('Offline');},async()=>({ok:true,json:async()=>({sha:commit,truncated:false,tree:[{type:'blob',path:'README.md',sha:revision,size:1000},{type:'blob',path:'LICENSE',sha:revision,size:1000}],encoding:'text',content:''})})]){
    const result=await collector.refreshCatalog({providerIds:['sermor'],previous,fetcher,logger});
    assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.sermor,previous.records.sermor);assert.equal(result.catalog.updatedAt.sermor,previous.updatedAt.sermor);
  }
  const mismatched=api(),fetcher=async url=>{const result=await mismatched(url);if(!url.includes('/git/blobs/'))return result;return {ok:true,json:async()=>({encoding:'base64',content:Buffer.from('Wrong bytes').toString('base64')})};};
  await assert.rejects(collector.repositoryFiles('sermor',fetcher),/提交版本/);
});

test('Sermor previews verify PNG bytes and dimensions, preserve NC-SA credits and reuse bounded WebP files',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-sermor-'));
  try{
    const bytes=await sharp({create:{width:1920,height:1080,channels:3,background:'#97a1bf'}}).png().toBuffer();
    const [item]=repositories.normalizeRepository([record('sermornc',{revision:hash(bytes)})],'sermornc');
    const fetcher=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
    const created=await builder.buildPreviews({items:[item],fetcher,outputDir:directory,logger,now});
    assert.equal(created.created,1);assert.equal(created.failures,0);assert.equal(item.license,'CC BY-NC-SA 4.0');assert.equal(item.feedRecord.download,undefined);
    const filename=previews.filenameFor(item),metadata=await sharp(await fs.readFile(path.join(directory,filename))).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,1280);assert.equal(metadata.height,720);assert.equal(item.download,item.fallbackImage);
    const reused=await builder.buildPreviews({items:[item],previous:created.manifest,fetcher:async()=>{throw Error('No refetch');},outputDir:directory,logger,now});assert.equal(reused.reused,1);
    let requests=[];
    const fallback=await builder.buildPreviews({items:[item],fetcher:async(url,options)=>{requests.push({url,range:options.headers.Range});return url===item.image?new Response('File size exceeded the configured limit of 20 MB.',{status:403}):new Response(bytes);},outputDir:directory,logger,now});
    assert.equal(fallback.created,1);assert.equal(fallback.failures,0);assert.deepEqual(requests,[{url:item.image,range:undefined},{url:item.download,range:'bytes=0-33554431'}]);
    const incomplete=await builder.buildPreviews({items:[item],fetcher:async url=>url===item.image?new Response('',{status:403}):new Response(bytes.subarray(0,100),{status:206}),outputDir:directory,logger,now});
    assert.equal(incomplete.created,0);assert.equal(incomplete.failures,1);
    for(const data of [await sharp(bytes).resize(960,540).png().toBuffer(),await sharp(bytes).jpeg().toBuffer()]){
      const [wrong]=repositories.normalizeRepository([record('sermor',{revision:hash(data)})],'sermor');
      const failed=await builder.buildPreviews({items:[wrong],fetcher:async()=>new Response(data),outputDir:directory,logger,now});assert.equal(failed.failures,1);assert.equal(failed.created,0);
    }
    await fs.writeFile(path.join(directory,'sermor-personal.webp'),'preserve');await builder.buildPreviews({items:[],outputDir:directory,logger,now});
    assert.equal(await fs.readFile(path.join(directory,'sermor-personal.webp'),'utf8'),'preserve');assert.deepEqual((await fs.readdir(directory)).filter(name=>/^(?:sermor|sermornc)-[a-f0-9]{40}-v1/.test(name)),[]);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
