const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const sharp=require('sharp');
const {zipSync}=require('fflate');
const oga=require('../source/wallpapers/opengameart.js');
const feeds=require('../source/wallpapers/feeds.js');
const previews=require('../source/wallpapers/previews.js');
const {parseWork,archiveImages,inspectImage,collectOpenGameArt}=require('../scripts/collect-opengameart.cjs');
const {refreshCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs');
const {buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const logger={log(){},warn(){}},now=new Date('2026-10-02T03:00:00Z');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const filename='40-game-backgrounds-1-painted-style/bg-01.JPG';
const jpg=(color='#53749a',width=1800,height=900)=>sharp({create:{width,height,channels:3,background:color}}).jpeg().toBuffer();
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-oga-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

function workPage(key,bytes,{license='CC0',licenseLink=oga.licenseUrl,artist,body='Author made these backgrounds',fileID=10,fileURL,mime,notice='Artwork by the author',empty=false}={}){
  const work=oga.works[key],file=fileURL||(key==='painted'?'40-game-backgrounds-1-painted-style.zip':key==='studies'?'Concept-Art-Studies_0.zip':key==='underwater'?'bg_13.png':key==='skyline'?'bg_silhouette2.png':'Starset_6.png');
  mime??=work.archive?'application/zip':'image/png';
  return '<div class="node node-art view-mode-full"><div class="field-name-author-submitter"><div class="field-items"><a href="'+work.artistPath+'">'+(artist||work.artist)+'</a></div></div><div class="field-name-field-art-licenses"><a href="'+licenseLink+'"><div class="license-name">'+license+'</div></a></div><div class="field-name-body">'+body+'</div><div class="field-name-field-copyright-notice"><div class="field-items">'+notice+'</div></div><div class="field-name-field-art-files">'+(empty?'':'<a href="'+oga.origin+'/sites/default/files/'+file+'" type="'+mime+'; length='+bytes.length+'" data-fid="'+fileID+'">File</a>')+'</div></div>';
}
function catalog(map,robots='User-agent: *\nCrawl-delay: 10\nDisallow: /search/'){return async(url,options)=>{
  assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);
  if(url===oga.origin+'/robots.txt')return new Response(robots);
  const result=map.get(url);if(result instanceof Error)throw result;if(result instanceof Response)return result;
  return result===undefined?new Response('Not found',{status:404}):new Response(result);
};}
function resources(key,bytes,options){
  const html=workPage(key,bytes,options),[raw]=parseWork(html,key);
  return new Map([[oga.origin+'/content/'+oga.works[key].slug,html],...(raw?[[raw.sourceFile,bytes]]:[])]);
}
const sync=options=>collectOpenGameArt({logger,now,wait:async()=>{},...options});
async function record(){const data=await jpg(),raw=parseWork(workPage('painted',Buffer.alloc(10)),'painted')[0];return inspectImage(data,raw,filename);}

test('only the author work field grants CC0 to its bound files',()=>{
  const bytes=Buffer.alloc(10),html=workPage('painted',bytes),[raw]=parseWork(html,'painted');
  assert.equal(raw.artist,'rubberduck');assert.equal(raw.copyrightNotice,'Artwork by the author');assert.equal(raw.sourceBytes,10);
  for(const options of [{license:'CC BY 4.0'},{licenseLink:'https://evil.example/license'},{artist:'Unverified uploader'},{fileID:-1},{fileID:0},{fileURL:'../other.zip'},{mime:'image/jpeg'},{body:'AI-generated images'},{notice:'No redistribution allowed'}])assert.deepEqual(parseWork(workPage('painted',bytes,options),'painted'),[]);
  assert.deepEqual(parseWork(workPage('painted',bytes,{empty:true}),'painted'),[]);
  const unbound=html.replace(oga.licenseUrl,'https://example.test')+'<a href="'+oga.licenseUrl+'">CC0</a>';
  assert.deepEqual(parseWork(unbound,'painted'),[]);
  assert.equal(parseWork(html.replace(oga.licenseUrl,oga.licenseUrl.replace('https:','http:')),'painted').length,1);
  assert.throws(()=>parseWork('', 'painted'),/结构/);assert.throws(()=>parseWork(html,'unknown'),/未知/);
  const duplicate=html.replace('</div></div>',html.match(/<a href="https[^>]+type=[\s\S]+?<\/a>/)[0]+'</div></div>');assert.equal(parseWork(duplicate,'painted').length,1);
});

test('source URLs, file members and native records cannot escape the verified release',async()=>{
  for(const url of [null,'http://opengameart.org/sites/default/files/bg.png','https://other.test/sites/default/files/bg.png',oga.origin+'/sites/default/files/../bg.png',oga.origin+'/sites/default/files/a%2Fb.png',oga.origin+'/sites/default/files/bg.png?token=1',oga.origin+'/sites/default/files/bg.png#x',oga.origin+'/sites/default/files/../files/bg.svg'])assert.equal(oga.fileURL(url),null);
  assert.equal(oga.originalPath({revision:'../x',extension:'jpg'}),null);assert.equal(oga.originalPath({revision:'a'.repeat(64),extension:'svg'}),null);
  const raw=await record(),[item]=oga.normalizeRecords([raw,raw]);assert.equal(item.width,1800);assert.equal(item.height,900);assert.equal(item.download,item.image);assert.match(item.download,/^\.\/originals\/opengameart\/[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(feeds.normalizeFeed([raw],'opengameart'),[item]);assert.ok(item.categories.includes('nature'));assert.ok(!item.categories.includes('anime'));
  for(const changes of [{work:'__proto__'},{artist:'Other'},{license:'MIT'},{licenseUrl:oga.origin},{pageUrl:oga.origin},{member:'../bg-01.JPG'},{member:'Concept-Art-Studies/cloud-farm.JPG'},{sourceFile:oga.origin+'/sites/default/files/other.zip'},{fileID:NaN},{revision:'bad'},{extension:'png'},{width:1599},{height:799},{bytes:0},{bytes:33*1024*1024},{title:''}])assert.deepEqual(oga.normalizeRecords([{...raw,...changes}]),[]);
  assert.deepEqual(oga.normalizeRecords(null),[]);assert.deepEqual(oga.normalizeRecords([null]),[]);
});

test('archive reading ignores collages and drafts and bounds paths, file counts and size before inflation',()=>{
  const good=zipSync({[filename]:Buffer.from('native'), '40-game-backgrounds-1-painted-style/readme.txt':Buffer.from('ignored')});
  assert.deepEqual(archiveImages(good,'painted'),[{member:filename,data:Buffer.from('native')}]);
  const studies=zipSync({'Concept-Art-Studies/cloud-farm.JPG':Buffer.from('scene'),'Concept-Art-Studies/TrainSketch.png':Buffer.from('draft'),'Concept-Art-Studies/environment-thumbnails.jpg':Buffer.from('collage')});
  assert.equal(archiveImages(studies,'studies').length,1);
  assert.throws(()=>archiveImages(good,'stars'),/大小限制/);assert.throws(()=>archiveImages(Buffer.alloc(33*1024*1024),'painted'),/大小限制/);
  for(const name of ['../escape.jpg','/absolute.jpg','folder\\x.jpg','folder/./x.jpg'])assert.throws(()=>archiveImages(zipSync({[name]:Buffer.from('x')}),'painted'),/路径/);
  assert.throws(()=>archiveImages(Buffer.from('bad archive'),'painted'));
  assert.throws(()=>archiveImages(zipSync(Object.fromEntries(Array.from({length:251},(_,i)=>['f'+i,Buffer.alloc(0)]))),'painted'),/文件数/);
  const central=Buffer.from(good),offset=central.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));central.writeUInt32LE(33*1024*1024,offset+24);assert.throws(()=>archiveImages(central,'painted'),/大小/);
  const duplicate=Buffer.from(zipSync({[filename]:Buffer.from('one'),[filename.replace('01','02')]:Buffer.from('two')})),from=Buffer.from('bg-02.JPG'),to=Buffer.from('bg-01.JPG');
  for(let index=duplicate.indexOf(from);index>=0;index=duplicate.indexOf(from,index+from.length))to.copy(duplicate,index);
  assert.throws(()=>archiveImages(duplicate,'painted'),/重复路径/);
  const expanded=Buffer.from(zipSync(Object.fromEntries(Array.from({length:5},(_,i)=>['f'+i,Buffer.alloc(0)]))));
  for(let index=expanded.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));index>=0;index=expanded.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),index+4))expanded.writeUInt32LE(32*1024*1024,index+24);
  assert.throws(()=>archiveImages(expanded,'painted'),/展开大小/);
});

test('real native inspection rejects tiny, transparent, animated or unsupported files',async()=>{
  const raw=parseWork(workPage('painted',Buffer.alloc(10)),'painted')[0];
  assert.equal(await inspectImage(await jpg('#123456',1000,500),raw,filename),null);
  const transparent=await sharp({create:{width:1800,height:900,channels:4,background:{r:10,g:20,b:30,alpha:0.2}}}).png().toBuffer();
  assert.equal(await inspectImage(transparent,{...raw,work:'underwater',sourceFile:oga.origin+'/sites/default/files/bg_13.png'},'bg_13.png'),null);
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="900"/>');assert.equal(await inspectImage(svg,raw,filename),null);
  await assert.rejects(inspectImage(Buffer.from('not an image'),raw,filename));
  const png=await sharp({create:{width:1800,height:900,channels:4,background:{r:10,g:20,b:30,alpha:1}}}).png().toBuffer();
  const [file]=parseWork(workPage('underwater',png),'underwater');assert.equal((await inspectImage(png,file,'bg_13.png')).extension,'png');
});

test('collector preserves every original byte, follows crawl delay and updates archive contents automatically',async t=>{
  const outputDir=await directory(t),data=await jpg(),second=await jpg('#a47652'),archive=zipSync({[filename]:data,'40-game-backgrounds-1-painted-style/bg-02.JPG':second}),waits=[];
  const map=resources('painted',archive),options={outputDir,workIds:['painted'],fetcher:catalog(map),intervalMs:0,wait:async ms=>waits.push(ms)};
  const first=await sync(options);assert.equal(first.records.length,2);assert.deepEqual(waits,[10000,10000]);
  assert.deepEqual(await fs.readFile(path.join(outputDir,digest(data)+'.jpg')),data);
  const unrelated=path.join(outputDir,'keep-user-file.txt');await fs.writeFile(unrelated,'untouched');
  const next=zipSync({'40-game-backgrounds-1-painted-style/bg-03.JPG':second});
  const changed=await sync({...options,old:oga.normalizeRecords(first.records),fetcher:catalog(resources('painted',next))});assert.equal(changed.records.length,1);assert.match(changed.records[0].member,/bg-03/);
  await assert.rejects(fs.readFile(path.join(outputDir,digest(data)+'.jpg')),/ENOENT/);assert.equal(await fs.readFile(unrelated,'utf8'),'untouched');
});

test('temporary failures retain verified records; license withdrawal or removed files retires them',async t=>{
  const outputDir=await directory(t),data=await jpg(),archive=zipSync({[filename]:data}),map=resources('painted',archive),options={outputDir,workIds:['painted'],fetcher:catalog(map)};
  const first=await sync(options),old=oga.normalizeRecords(first.records),page=oga.origin+'/content/'+oga.works.painted.slug;
  await assert.rejects(sync({...options,old,fetcher:catalog(new Map([[page,Error('offline')]]))}),/所有场景/);
  for(const mutation of [html=>html.replace('length='+archive.length,'length=2'),html=>html.replace('view-mode-full','changed-structure')]){
    const changed=new Map(map);changed.set(page,mutation(map.get(page)));await assert.rejects(sync({...options,old,fetcher:catalog(changed)}),/所有场景/);
  }
  const withdrawn=await sync({...options,old,fetcher:catalog(resources('painted',archive,{license:'All rights reserved'}))});assert.deepEqual(withdrawn.records,[]);assert.deepEqual(await fs.readdir(outputDir),[]);
  const empty=await sync({...options,old,fetcher:catalog(resources('painted',archive,{empty:true}))});assert.deepEqual(empty.records,[]);
});

test('rate limits stop all source requests and survive refresh and cache merging',async t=>{
  const outputDir=await directory(t),data=await jpg(),archive=zipSync({[filename]:data}),map=resources('painted',archive),[raw]=parseWork(map.values().next().value,'painted');
  map.set(raw.sourceFile,new Response('limited',{status:429,headers:{'retry-after':'120'}}));let calls=0;
  const fetcher=catalog(map),options={outputDir,workIds:['painted'],wait:async()=>{},fetcher:async(...args)=>{calls++;return fetcher(...args);}};
  const paused=await sync(options);assert.equal(calls,3);assert.equal(paused.retryAt,'2026-10-02T03:02:00.000Z');assert.equal(paused.interrupted,true);
  const cooling=await sync({...options,retryAt:paused.retryAt,fetcher:()=>assert.fail('cooldown cannot request upstream')});assert.equal(cooling.updated,false);
  const robotLimit=await sync({...options,fetcher:async()=>new Response('unavailable',{status:503})});assert.equal(robotLimit.interrupted,true);assert.equal(robotLimit.updated,false);
  const previous={version:1,records:{opengameart:[]},updatedAt:{opengameart:'2026-10-01T00:00:00Z'},continuation:{opengameart:{retryAt:paused.retryAt}}};
  const result=await refreshCatalog({previous,providerIds:['opengameart'],now,logger,fetcher:()=>assert.fail('persisted cooldown'),openGameArtOptions:options});assert.equal(result.failures,1);assert.equal(result.catalog.updatedAt.opengameart,previous.updatedAt.opengameart);assert.equal(result.catalog.continuation.opengameart.retryAt,paused.retryAt);
  const merged=mergeCatalogs(previous,result.catalog);assert.equal(merged.continuation.opengameart.retryAt,paused.retryAt);
});

test('robots exclusions and unavailable policies stop before artwork downloads',async t=>{
  const outputDir=await directory(t);
  for(const robots of ['User-agent: *\nDisallow: /','User-agent: *\nDisallow: /sites/default/files/','User-agent: *\nCrawl-delay: 61','<html>Blocked</html>'])await assert.rejects(sync({outputDir,workIds:['painted'],fetcher:catalog(new Map(),robots)}));
  await assert.rejects(sync({outputDir,workIds:['invalid']}),/配置/);await assert.rejects(sync({outputDir,intervalMs:-1}),/配置/);
  await assert.rejects(sync({outputDir,fetcher:async()=>{throw Error('offline');}}),/offline/);
});

test('cached CC0 originals generate local previews without remote requests and validate content hashes',async t=>{
  const outputDir=await directory(t),originalsDir=await directory(t),data=await jpg(),raw=await record(),[item]=oga.normalizeRecords([raw]);
  await fs.writeFile(path.join(originalsDir,raw.revision+'.jpg'),data);
  const options={items:[item],outputDir,originalsDir,logger,now,fetcher:()=>assert.fail('CC0 original is already local')};
  const built=await buildPreviews(options);assert.equal(built.created,1);assert.equal(built.failures,0);assert.match(previews.previewFor(item,built.manifest),/^\.\/previews\/opengameart-[a-f0-9]{64}-v1\.webp$/);
  assert.equal(previews.filenameFor({...item,id:'forged'}),null);
  assert.equal((await buildPreviews({...options,previous:built.manifest})).reused,1);
  await fs.writeFile(path.join(originalsDir,raw.revision+'.jpg'),await jpg('#ffffff'));
  const mismatch=await buildPreviews(options);assert.equal(mismatch.failures,1);assert.equal(previews.previewFor(item,mismatch.manifest),null);
  await fs.unlink(path.join(originalsDir,raw.revision+'.jpg'));assert.equal((await buildPreviews(options)).failures,1);
});
