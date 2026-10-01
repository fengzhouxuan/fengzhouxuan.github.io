const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const revoy=require('../source/wallpapers/revoy.js');
const feeds=require('../source/wallpapers/feeds.js');
const previews=require('../source/wallpapers/previews.js');
const {collectRevoy,refreshCatalog}=require('../scripts/refresh-wallpaper-feeds.cjs');
const {buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const modified='Fri, 21 Aug 2026 09:42:20 GMT',now=new Date('2026-10-02T00:00:00Z'),logger={log(){},warn(){}};
function candidate(name='Fantasy-Landscape'){
  const filename='2007-01-30_'+name+'_by-David-Revoy.jpg';return {filename,pageUrl:'https://www.peppercarrot.com/en/viewer/misc__'+filename.slice(0,-4)+'.html'};
}
function gallery(items){return items.map(item=>'<a href="'+item.pageUrl+'"><img src="https://www.peppercarrot.com/cache/thumb.jpg"></a>').join('\n');}
function viewer(item,{artist='David Revoy',license='CC BY 4.0',title='Fantasy &amp; Landscape'}={}){
  const base='https://www.peppercarrot.com/0_sources/0ther/misc/';
  return '<a href="'+base+'hi-res/'+item.filename+'"><img src="'+base+'low-res/'+item.filename+'"></a><div class="ViewFooterInfo"><a href="'+item.pageUrl+'">"'+title+'"</a> by '+artist+'\n− <a href="'+(revoy.licenses[license]||'https://example.com/')+'deed.en">'+license.replace('CC ','CC-')+'</a></div>';
}
function record(item=candidate(),options){
  const work=revoy.parseWork(viewer(item,options),item),revision=crypto.createHash('sha256').update(JSON.stringify([work.download,work.image,modified,modified])).digest('hex');
  return {...work,width:3200,height:2000,imageWidth:1280,imageHeight:800,modified,previewModified:modified,revision};
}
const response=html=>({ok:true,status:200,text:async()=>html});
function fetcherFor(items,{changed,missing,withdrawn,headerStatus=200}={}){
  return async(url,options)=>{
    assert.ok(options.signal);assert.match(options.headers['User-Agent'],/RabbitWallpaperStation/);
    if(url===revoy.source.gallery)return response(gallery(items));
    if(options.method==='HEAD')return {ok:headerStatus===200,status:headerStatus,headers:new Headers({'content-type':'image/jpeg','last-modified':changed||modified})};
    const item=items.find(item=>item.pageUrl===url);if(item===missing)throw Error('offline');
    return response(viewer(item,{license:item===withdrawn?'Copyrighted':'CC BY 4.0'}));
  };
}

test('Revoy discovery follows only eligible author paintings in the official misc gallery',()=>{
  const item=candidate();assert.deepEqual(revoy.parseGallery(gallery([item,item])),[item]);assert.deepEqual(revoy.parseGallery(null),[]);
  for(const name of ['article-example','Logo','Tifa','2B','Dr-Slump','fan-art','comic-page','Fairy-Nuts','nude','a'.repeat(301)])assert.equal(revoy.validFilename(candidate(name).filename),false);
  assert.equal(revoy.validFilename(null),false);assert.equal(revoy.validFilename('../art.jpg'),false);
  for(const pageUrl of [item.pageUrl.replace('https:','http:'),item.pageUrl.replace('www.peppercarrot.com','evil.example'),item.pageUrl+'?x=1',item.pageUrl.replace('misc__','artworks__'),item.pageUrl.replace('David-Revoy','Somebody')])assert.deepEqual(revoy.parseGallery(gallery([{...item,pageUrl}])),[]);
});

test('Revoy works need matching image links, title, author and their individual BY or BY-SA license',()=>{
  const item=candidate(),html=viewer(item),raw=revoy.parseWork(html,item);assert.equal(raw.title,'Fantasy & Landscape');assert.equal(raw.artist,'David Revoy');
  assert.equal(revoy.parseWork(viewer(item,{license:'CC BY-SA 4.0'}),item).license,'CC BY-SA 4.0');
  for(const invalid of [null,viewer(item,{artist:'Somebody'}),viewer(item,{license:'Copyrighted'}),viewer(item,{title:''}),viewer(item,{title:'a'.repeat(151)}),viewer(item,{title:'Other comic page'}),html.replace('ViewFooterInfo','SiteFooter'),html.replace('/misc/hi-res/','/misc/other/'),html.replace('/misc/low-res/','/cache/'),html.replace(revoy.licenses['CC BY 4.0'],'https://evil.example/'),html.replace(' by David Revoy','<div class="ViewFooterDisclaimer">Do not reuse</div> by David Revoy')])assert.equal(revoy.parseWork(invalid,item),null);
  assert.equal(revoy.parseWork(html,null),null);assert.equal(revoy.parseWork(html,{...item,pageUrl:item.pageUrl+'#x'}),null);
});

test('Revoy normalization binds metadata, licenses and dimensions without enlarging or cropping previews',()=>{
  const raw=record(),[item]=revoy.normalizeRecords([raw,raw,null]);assert.equal(item.width,3200);assert.equal(item.license,'CC BY 4.0');assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'revoy'),[item]);
  assert.deepEqual(revoy.normalizeRecords(null),[]);assert.ok(item.categories.includes('fantasy'));assert.ok(item.categories.includes('nature'));
  assert.ok(revoy.categoriesFor(candidate('Kiki-Warrior-in-a-Cyberpunk-City-portrait').filename).includes('anime'));
  assert.ok(revoy.categoriesFor(candidate('Cat-in-a-village').filename).includes('animals'));
  assert.deepEqual(revoy.categoriesFor(candidate('Framage-for-Luc').filename),['illustration']);
  for(const mutate of [r=>r.artist='Other',r=>r.filename='../file.jpg',r=>r.title='',r=>r.title='a'.repeat(151),r=>r.title='Article',r=>r.license='CC0',r=>r.licenseUrl='https://evil.example/',r=>r.pageUrl+='?x=1',r=>r.download+='?x=1',r=>r.image+='?x=1',r=>r.width=1599,r=>r.height=799,r=>r.height=NaN,r=>r.width=30001,r=>r.imageWidth=0,r=>r.imageWidth=3201,r=>r.imageHeight=400,r=>r.revision='invalid',r=>r.modified=null,r=>r.previewModified='invalid']){const bad={...raw};mutate(bad);assert.deepEqual(revoy.normalizeRecords([bad]),[]);}
});

test('Revoy synchronization measures new originals and previews, then reuses unchanged header metadata',async()=>{
  const item=candidate(),small=candidate('Small'),privateWork=candidate('Private');let measured=0;
  const options={providerIds:['revoy'],now,logger,fetcher:fetcherFor([item,small,privateWork],{withdrawn:privateWork}),dimensions:async(fetcher,url)=>{measured++;return url.includes('Small')?{width:1200,height:750}:url.includes('hi-res')?{width:3200,height:2000}:{width:1280,height:800};}};
  const first=await refreshCatalog(options);assert.equal(first.failures,0);assert.equal(first.catalog.records.revoy.length,1);assert.equal(measured,4);
  const second=await refreshCatalog({...options,previous:first.catalog,fetcher:fetcherFor([item]),dimensions:()=>assert.fail('unchanged dimensions must be reused')});assert.equal(second.catalog.records.revoy.length,1);
  const changed=await refreshCatalog({...options,previous:first.catalog,fetcher:fetcherFor([item],{changed:'Sat, 22 Aug 2026 09:42:20 GMT'})});assert.equal(measured,6);assert.notEqual(changed.catalog.records.revoy[0].revision,first.catalog.records.revoy[0].revision);
});

test('Revoy withdraws unlicensed and removed images while temporarily unavailable works retain verified records',async()=>{
  const good=candidate(),offline=candidate('Offline'),withdrawn=candidate('Withdrawn'),removed=candidate('Removed');
  const previous={version:1,updatedAt:{revoy:'previous'},records:{revoy:[good,offline,withdrawn,removed].map(item=>record(item))}};
  const options={providerIds:['revoy'],previous,now,logger,fetcher:fetcherFor([good,offline,withdrawn],{missing:offline,withdrawn}),dimensions:()=>assert.fail('unchanged dimensions must be reused')};
  const result=await refreshCatalog(options);assert.equal(result.failures,0);assert.deepEqual(result.catalog.records.revoy.map(raw=>raw.filename),[good.filename,offline.filename]);
  const empty=await refreshCatalog({...options,fetcher:fetcherFor([good],{withdrawn:good})});assert.deepEqual(empty.catalog.records.revoy,[]);
  for(const fetcher of [async()=>{throw Error('offline');},async()=>response('not a gallery'),fetcherFor([good],{headerStatus:429})]){const failed=await refreshCatalog({...options,fetcher});assert.equal(failed.failures,1);assert.equal(failed.catalog.updatedAt.revoy,'previous');assert.deepEqual(failed.catalog.records.revoy,previous.records.revoy);}
});

test('Revoy collector tolerates missing headers and dimensions and stops issuing requests on rate limits',async()=>{
  const item=candidate(),old=revoy.normalizeRecords([record(item)]);
  const invalidHeaders=async(url,options)=>options.method==='HEAD'?{ok:true,status:200,headers:new Headers()}:fetcherFor([item])(url,options);
  assert.deepEqual(await collectRevoy({old,fetcher:invalidHeaders,logger}),[old[0].feedRecord]);
  assert.deepEqual(await collectRevoy({old:null,fetcher:invalidHeaders,logger}),[]);
  assert.deepEqual(await collectRevoy({old,fetcher:fetcherFor([item],{changed:'Sat, 22 Aug 2026 09:42:20 GMT'}),dimensions:async()=>{throw Error('offline');},logger}),[old[0].feedRecord]);
  const many=Array.from({length:20},(_,index)=>candidate('Work-'+index));let calls=0;
  await assert.rejects(collectRevoy({fetcher:async(url,options)=>{if(url===revoy.source.gallery)return response(gallery(many));calls++;if(options.method==='HEAD')return {ok:false,status:503};return response(viewer(many.find(item=>item.pageUrl===url)));},logger}),/冷却/);assert.ok(calls<=6);
  await assert.rejects(collectRevoy({fetcher:async()=>response(''),logger}),/画廊/);
});

test('Revoy avoids a painting already validated in the official Pepper gallery',async()=>{
  const item=candidate(),raw=record(item),existing={...raw,kind:'artwork',pageUrl:item.pageUrl.replace('misc__','artworks__'),download:raw.download.replace('/misc/','/artworks/'),image:raw.image.replace('/misc/','/artworks/')},existingWorks=feeds.normalizeFeed([existing],'pepper');
  assert.equal(existingWorks.length,1);
  const result=await collectRevoy({existingWorks,fetcher:async url=>{assert.equal(url,revoy.source.gallery);return response(gallery([item]));},logger});assert.deepEqual(result,[]);
});

test('Revoy previews compress a verified author JPEG proportionally and verify the cached output digest',async t=>{
  const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-revoy-'));t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
  const bytes=await sharp({create:{width:1280,height:800,channels:3,background:'#276d61'}}).jpeg().toBuffer(),[item]=revoy.normalizeRecords([record()]);
  assert.equal(previews.filenameFor(item),'revoy-'+item.revision+'-v1.webp');assert.equal(previews.filenameFor({...item,feedRecord:{...item.feedRecord,license:'CC0'}}),null);
  const first=await buildPreviews({items:[item],outputDir,logger,now,fetcher:async url=>{assert.equal(url,item.image);return new Response(bytes);}});assert.equal(first.created,1);
  const filename=previews.filenameFor(item),entry=first.manifest.images[item.id],encoded=await fs.readFile(path.join(outputDir,filename)),meta=await sharp(encoded).metadata();assert.equal(entry.digest,crypto.createHash('sha256').update(encoded).digest('hex'));assert.equal(meta.format,'webp');assert.equal(meta.width,1280);assert.equal(meta.height,800);assert.equal(previews.previewFor(item,first.manifest),'./previews/'+filename);assert.match(item.copyrightNotice,/WebP/);
  for(const change of [{url:'https://evil.example/'},{width:1281},{digest:'invalid'}])assert.equal(previews.previewFor(item,{...first.manifest,images:{[item.id]:{...entry,...change}}}),null);
  const cached=await buildPreviews({items:[item],previous:first.manifest,outputDir,logger,now,fetcher:()=>assert.fail('cached author preview must not fetch')});assert.equal(cached.reused,1);
  await fs.writeFile(path.join(outputDir,'revoy-personal.jpg'),'keep');await buildPreviews({items:[],previous:cached.manifest,outputDir,logger,now});await assert.rejects(fs.readFile(path.join(outputDir,filename)),/ENOENT/);assert.equal(await fs.readFile(path.join(outputDir,'revoy-personal.jpg'),'utf8'),'keep');
});
