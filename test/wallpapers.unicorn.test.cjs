const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const unicorn=require('../source/wallpapers/unicorn.js'),feeds=require('../source/wallpapers/feeds.js'),previews=require('../source/wallpapers/previews.js');
const {parseSource,inspectImage,collectUnicorn}=require('../scripts/collect-unicorn.cjs');
const {refreshCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs'),{buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const now=new Date('2026-10-02T12:00:00Z'),logger={log(){},warn(){}},hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const imageURL=key=>unicorn.imageOrigin+unicorn.works[key].assetPath+'/original/Example.jpg';
const grant='<p>The images in this asset pack are released under the <a href="'+unicorn.licenseUrl+'">Creative Commons Attribution 4.0 International</a> licence.</p>';
function page({licensed=true,keys=Object.keys(unicorn.works),extra=''}={}){
  return '<h1 class="game_title">Shopping Backgrounds</h1><div class="formatted_description">'+(licensed?grant:'All rights reserved.')+'</div><div class="game_info_panel_widget"><table><tr><td>Author</td><td><a href="'+unicorn.origin+'">Unicorn Creates</a></td></tr><tr><td>Asset license</td><td><a href="https://itch.io/game-assets/assets-cc4-by">Creative Commons Attribution</a></td></tr></table></div><div class="screenshot_list">'+keys.map(key=>'<a href="'+imageURL(key)+'"><img src="'+unicorn.imageOrigin+unicorn.works[key].assetPath+'/347x500/Preview.jpg"></a>').join('')+extra+'</div>';
}
const image=(color='#dab29a',format='jpeg',width=1920,height=1080)=>sharp({create:{width,height,channels:3,background:color}}).toFormat(format).toBuffer();
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-unicorn-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function resources(data){return new Map([[unicorn.origin+'/robots.txt','User-agent: *\nDisallow: /*/download/\nDisallow: /-/'],[unicorn.imageOrigin+'/robots.txt',new Response('not found',{status:404})],[unicorn.pageUrl,page()],...Object.keys(unicorn.works).map(key=>[imageURL(key),data])]);}
function fetcher(map,calls=[]){return async(url,options)=>{calls.push(url);assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);const value=map.get(url);if(value instanceof Error)throw value;return value instanceof Response?new Response(null,{status:value.status,headers:value.headers}):new Response(value===undefined?'Missing':value,{status:value===undefined?404:200});};}
const sync=options=>collectUnicorn({now,logger,wait:async()=>{},...options});
async function record(){return inspectImage(await image(),parseSource(page()).records[0]);}

test('Unicorn author and license checks are scoped to its own description, metadata and reviewed gallery assets',()=>{
  const parsed=parseSource(page());assert.equal(parsed.licensed,true);assert.deepEqual(parsed.records.map(r=>r.work),['mall','clothes']);assert.equal(parsed.records[0].kind,'published-gallery');
  assert.deepEqual(parseSource(page({licensed:false})),{licensed:false,records:[]});assert.equal(parseSource(page().replace(unicorn.licenseUrl,'https://example.test/license')).licensed,false);
  assert.equal(parseSource(page().replace('</div>','<p>No redistribution.</p></div>')).licensed,false);
  assert.equal(parseSource(page({licensed:false})+'<div class="comment-body">'+grant+'</div>').licensed,false);
  assert.deepEqual(parseSource(page({keys:[]})).records,[]);
  const thirdParty='<a href="https://img.itch.zone/unknown/original/Character.jpg"><img src="https://img.itch.zone/unknown/347x500/Character.jpg"></a>';assert.equal(parseSource(page({extra:thirdParty})).records.length,2);
  for(const html of ['',page().replace('Shopping Backgrounds','Other'),page().replace('game_info_panel_widget','other'),page().replace('formatted_description','comment-body'),page().replace('href="'+unicorn.origin+'"','href="https://other.itch.io"'),page().replace('/347x500/','/another/'),page({extra:'<a href="'+imageURL('mall')+'"><img src="'+unicorn.imageOrigin+unicorn.works.mall.assetPath+'/347x500/Extra.jpg"></a>'})])assert.throws(()=>parseSource(html));
});

test('Unicorn native records bind reviewed works, image hosts, publisher JPEG files and local SHA downloads',async()=>{
  const raw=await record(),[item]=unicorn.normalizeRecords([raw,raw]);assert.equal(item.title,'商场扶梯');assert.deepEqual(item.categories,['anime','illustration']);assert.equal(item.license,'CC BY 4.0');assert.equal(item.artist,unicorn.artist);assert.match(item.copyrightNotice,/JPEG/);assert.match(item.copyrightNotice,/4K PNG/);
  assert.equal(item.download,'./originals/unicorn/'+raw.revision+'.jpg');assert.deepEqual(feeds.normalizeFeed([raw],'unicorn'),[item]);assert.equal(unicorn.normalizeRecords([raw,raw]).length,1);
  for(const changes of [{work:'__proto__'},{artist:'Other'},{pageUrl:'https://example.test'},{license:'CC0'},{licenseUrl:unicorn.origin},{kind:'package-master'},{revision:'bad'},{extension:'png'},{width:1599},{height:799},{width:300000},{bytes:0},{bytes:33*1024*1024},{publishedImage:imageURL('clothes')}])assert.deepEqual(unicorn.normalizeRecords([{...raw,...changes}]),[]);
  for(const url of [null,imageURL('mall').replace('https:','http:'),imageURL('mall')+'?token=1',imageURL('mall')+'#x',imageURL('mall').replace('img.itch.zone','img.itch.zone@evil.test'),imageURL('mall').replace('/original/','/347x500/'),imageURL('mall').replace('.jpg','.png')])assert.equal(unicorn.imageURL(url,'mall'),null);
  assert.equal(unicorn.imageURL(imageURL('mall'),'unknown'),null);assert.equal(unicorn.originalPath(null),null);assert.deepEqual(unicorn.normalizeRecords(null),[]);assert.deepEqual(unicorn.normalizeRecords([null]),[]);
  assert.deepEqual(unicorn.normalizeRecords([{...raw,work:'clothes',publishedImage:imageURL('clothes')},raw]).map(i=>i.work),['clothes']);
});

test('Unicorn fully decodes native JPEGs and rejects unsupported formats, small images, orientation and corrupt data',async()=>{
  const raw=parseSource(page()).records[0],bytes=await image(),record=await inspectImage(bytes,raw);assert.equal(record.revision,hash(bytes));assert.equal(record.width,1920);assert.equal(record.height,1080);
  assert.equal(await inspectImage(bytes,null),null);assert.equal(await inspectImage(bytes,{...raw,publishedImage:'https://example.test'}),null);assert.equal(await inspectImage(bytes,{...raw,license:'CC0'}),null);
  for(const data of [await image('#000','png'),await image('#000','jpeg',1280,720),await sharp(bytes).withMetadata({orientation:6}).toBuffer()])assert.equal(await inspectImage(data,raw),null);
  await assert.rejects(inspectImage(Buffer.from('corrupt'),raw));await assert.rejects(inspectImage(bytes.subarray(0,bytes.length-100),raw));
});

test('Unicorn sync preserves publisher bytes, paces requests, updates files and cleans only its managed originals',async t=>{
  const outputDir=await directory(t),bytes=await image(),map=resources(bytes),calls=[],delays=[];
  const first=await sync({outputDir,fetcher:fetcher(map,calls),wait:async delay=>delays.push(delay)});assert.equal(first.records.length,1);assert.equal(first.updated,true);assert.equal(calls.length,5);assert.deepEqual(delays,[1000,1000,1000,1000]);
  const saved=first.records[0],file=path.join(outputDir,saved.revision+'.jpg');assert.deepEqual(await fs.readFile(file),bytes);
  const clothes=await image('#abc');map.set(imageURL('clothes'),clothes);await fs.writeFile(path.join(outputDir,'user-note.txt'),'preserve');await fs.writeFile(path.join(outputDir,'0'.repeat(64)+'.jpg'),'obsolete');
  const second=await sync({outputDir,old:unicorn.normalizeRecords(first.records),fetcher:fetcher(map)});assert.equal(second.records.length,2);assert.equal(second.records.find(r=>r.work==='clothes').revision,hash(clothes));assert.equal(await fs.readFile(path.join(outputDir,'user-note.txt'),'utf8'),'preserve');await assert.rejects(fs.readFile(path.join(outputDir,'0'.repeat(64)+'.jpg')),{code:'ENOENT'});
  const revoked=new Map(map);revoked.set(unicorn.pageUrl,page({licensed:false}));const third=await sync({outputDir,old:unicorn.normalizeRecords(second.records),fetcher:fetcher(revoked)});assert.deepEqual(third.records,[]);await assert.rejects(fs.readFile(file),{code:'ENOENT'});
});

test('Unicorn retains failed files but retires successfully confirmed missing or invalid backgrounds',async t=>{
  const outputDir=await directory(t),mall=await image(),clothes=await image('#fab'),map=resources(mall);map.set(imageURL('clothes'),clothes);
  const first=await sync({outputDir,fetcher:fetcher(map)}),old=unicorn.normalizeRecords(first.records);assert.equal(first.records.length,2);
  map.set(imageURL('mall'),Error('Offline'));const partial=await sync({outputDir,old,fetcher:fetcher(map)});assert.deepEqual(partial.records.find(r=>r.work==='mall'),first.records.find(r=>r.work==='mall'));
  map.set(imageURL('mall'),await image('#000','jpeg',1280,720));const invalid=await sync({outputDir,old,fetcher:fetcher(map)});assert.deepEqual(invalid.records.map(r=>r.work),['clothes']);
  map.set(unicorn.pageUrl,page({keys:['clothes']}));const missing=await sync({outputDir,old,fetcher:fetcher(map)});assert.deepEqual(missing.records.map(r=>r.work),['clothes']);
  map.set(unicorn.pageUrl,page({keys:['mall']}));map.set(imageURL('mall'),mall);const selective=await sync({outputDir,old,workIds:['mall'],fetcher:fetcher(map)});assert.equal(selective.records.length,2);
  map.set(imageURL('mall'),Error('Offline'));map.set(unicorn.pageUrl,page());map.set(imageURL('clothes'),Error('Offline'));await assert.rejects(sync({outputDir,old,fetcher:fetcher(map)}),/均无法/);
});

test('Unicorn respects robots exclusions and limits, preserving retry metadata across catalog and seed merging',async t=>{
  const outputDir=await directory(t),raw=await record(),old=unicorn.normalizeRecords([raw]),map=resources(await image());
  const previous={version:1,records:{unicorn:[raw]},updatedAt:{unicorn:'2026-10-01T00:00:00Z'},continuation:{unicorn:null}};
  const options={providerIds:['unicorn'],previous,now,logger,unicornOptions:{outputDir,wait:async()=>{}}};
  map.set(unicorn.pageUrl,new Response('Slow',{status:503,headers:{'Retry-After':'120'}}));const paused=await refreshCatalog({...options,fetcher:fetcher(map)});assert.equal(paused.failures,1);assert.equal(paused.catalog.continuation.unicorn.retryAt,'2026-10-02T12:02:00.000Z');assert.deepEqual(paused.catalog.records.unicorn,[raw]);assert.equal(paused.catalog.updatedAt.unicorn,previous.updatedAt.unicorn);
  const cooled=await refreshCatalog({...options,previous:paused.catalog,fetcher:()=>assert.fail('cooldown')});assert.equal(cooled.failures,1);assert.equal(mergeCatalogs(previous,paused.catalog).continuation.unicorn.retryAt,paused.catalog.continuation.unicorn.retryAt);
  assert.deepEqual((await refreshCatalog({...options,providerIds:[]})).catalog.continuation.unicorn,previous.continuation.unicorn);
  for(const [url,value]of [[unicorn.origin+'/robots.txt','<html>blocked</html>'],[unicorn.origin+'/robots.txt','User-agent: *\nDisallow: /shopping-backgrounds'],[unicorn.imageOrigin+'/robots.txt','User-agent: *\nDisallow: /'],[unicorn.pageUrl,'Changed structure']]){const bad=resources(await image());bad.set(url,value);const result=await refreshCatalog({...options,fetcher:fetcher(bad)});assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.unicorn,[raw]);assert.equal(result.catalog.updatedAt.unicorn,previous.updatedAt.unicorn);}
  const denied=resources(await image());denied.set(unicorn.origin+'/robots.txt',new Response('Unavailable',{status:403}));await assert.rejects(sync({outputDir,old,fetcher:fetcher(denied)}));
  const limited=resources(await image());limited.set(imageURL('mall'),new Response('Slow',{status:429}));assert.equal((await sync({outputDir,old,fetcher:fetcher(limited)})).interrupted,true);
  for(const settings of [{intervalMs:-1},{intervalMs:60001},{workIds:[]},{workIds:null},{workIds:['__proto__']},{workIds:['mall','mall']}])await assert.rejects(sync({outputDir,fetcher:()=>assert.fail('invalid config'),...settings}),/配置/);
});

test('Unicorn previews preserve full frames, use native single-file downloads and detect original cache tampering',async t=>{
  const unicornOriginalsDir=await directory(t),outputDir=await directory(t),bytes=await image(),raw=await record(),[item]=unicorn.normalizeRecords([raw]);await fs.writeFile(path.join(unicornOriginalsDir,raw.revision+'.jpg'),bytes);
  const options={items:[item],unicornOriginalsDir,outputDir,logger,now,fetcher:()=>assert.fail('cached original')};const built=await buildPreviews(options);assert.equal(built.created,1);assert.equal(built.failures,0);
  const meta=await sharp(await fs.readFile(path.join(outputDir,previews.filenameFor(item)))).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,720);assert.equal(meta.format,'webp');assert.deepEqual(previews.imageCandidates(item,built.manifest),[previews.previewFor(item,built.manifest),item.download]);
  assert.equal((await buildPreviews({...options,previous:built.manifest})).reused,1);await fs.writeFile(path.join(unicornOriginalsDir,raw.revision+'.jpg'),await image('#000'));assert.equal((await buildPreviews(options)).failures,1);
  await fs.unlink(path.join(unicornOriginalsDir,raw.revision+'.jpg'));assert.equal((await buildPreviews(options)).failures,1);await buildPreviews({items:[],outputDir,logger,now});await assert.rejects(fs.readFile(path.join(outputDir,previews.filenameFor(item))),{code:'ENOENT'});
});
