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
const {parse7zListing,read7zImages}=require('../scripts/read-wallpaper-7z.cjs');
const logger={log(){},warn(){}},now=new Date('2026-10-02T03:00:00Z');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const filename='40-game-backgrounds-1-painted-style/bg-01.JPG';
const jpg=(color='#53749a',width=1800,height=900)=>sharp({create:{width,height,channels:3,background:color}}).jpeg().toBuffer();
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-oga-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

function workPage(key,bytes,{license=oga.works[key].license||'CC0',licenseLink=oga.works[key].licenseUrl||oga.licenseUrl,artist,body='Author made these backgrounds',fileID=10,fileURL,mime,notice='Artwork by the author',empty=false}={}){
  const work=oga.works[key],file=fileURL||(key==='painted'?'40-game-backgrounds-1-painted-style.zip':key==='studies'?'Concept-Art-Studies_0.zip':key==='underwater'?'bg_13.png':key==='skyline'?'bg_silhouette2.png':key==='manga'?'manga_bg.7z':key==='ink'?'bamboo_3.png':key==='office'?'Belle Tutorial.zip':key==='sunny'?'sunny.png':key==='auditorium'?'audi_scaled_2.png':key==='vnstyle'?'visual novel style backgrounds.zip':'Starset_6.png');
  mime??=work.archive==='7z'?'application/x-7z-compressed':work.archive?'application/zip':'image/png';
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
  const complete=await jpg();await assert.rejects(inspectImage(complete.subarray(0,complete.length-100),raw,filename));
  const png=await sharp({create:{width:1800,height:900,channels:4,background:{r:10,g:20,b:30,alpha:1}}}).png().toBuffer();
  const [file]=parseWork(workPage('underwater',png),'underwater');assert.equal((await inspectImage(png,file,'bg_13.png')).extension,'png');
});

test('attribution licenses bind each new author release without broadening existing CC0 work grants',async()=>{
  const data=await sharp(await jpg()).png().toBuffer();
  for(const key of ['sunny','auditorium','vnstyle']){
    const work=oga.works[key],html=workPage(key,data,{license:work.license.replace('CC ','CC-')}),[raw]=parseWork(html,key);
    assert.equal(raw.license,work.license);assert.equal(raw.licenseUrl,work.licenseUrl);assert.equal(raw.artist,work.artist);
    assert.equal(parseWork(html.replace('https://creativecommons.org/','http://creativecommons.org/'),key).length,1);
    for(const options of [{license:'CC0'},{licenseLink:oga.licenseUrl},{artist:'Other'},{notice:'No redistribution allowed'}])assert.deepEqual(parseWork(workPage(key,data,options),key),[]);
    const unrelated=html.replace(work.licenseUrl,'https://example.test/license')+'<a href="'+work.licenseUrl+'">'+work.license+'</a>';assert.deepEqual(parseWork(unrelated,key),[]);
    const member=key==='vnstyle'?'outside.png':decodeURIComponent(new URL(raw.sourceFile).pathname.split('/').pop()),record=await inspectImage(data,raw,member),[item]=oga.normalizeRecords([record]);
    assert.equal(item.license,work.license);assert.equal(item.licenseUrl,work.licenseUrl);assert.ok(item.title.includes(key==='sunny'?'晴空与白云':key==='auditorium'?'礼堂舞台':'夜间后门'));
    for(const changes of [{license:'CC0'},{licenseUrl:oga.licenseUrl},{license:key==='sunny'?'CC BY 3.0':'CC BY 4.0'},{pageUrl:oga.origin+'/content/'+oga.works.painted.slug}])assert.deepEqual(oga.normalizeRecords([{...record,...changes}]),[]);
  }
  const old=await record();assert.deepEqual(oga.normalizeRecords([{...old,license:'CC BY 4.0',licenseUrl:oga.works.sunny.licenseUrl}]),[]);
  assert.ok(!oga.normalizeRecords([{...old}])[0].categories.includes('anime'));
});

test('hand-painted package extracts complete backgrounds and keeps native 4:3 dimensions and per-author licenses',async t=>{
  const outputDir=await directory(t),data=await sharp(await jpg('#53749a',4000,3000)).png().toBuffer(),archive=zipSync({'outside.png':data,'bar.png':data,'dressing room.png':data,'green room.png':data,'preview.png':data,'character.png':data});
  assert.deepEqual(archiveImages(archive,'vnstyle').map(image=>image.member),['outside.png','bar.png','dressing room.png','green room.png']);
  const first=await sync({outputDir,workIds:['vnstyle'],fetcher:catalog(resources('vnstyle',archive))});assert.equal(first.records.length,1);
  const saved=first.records[0];assert.equal(saved.license,'CC BY 3.0');assert.equal(saved.width,4000);assert.equal(saved.height,3000);assert.deepEqual(await fs.readFile(path.join(outputDir,saved.revision+'.png')),data);
  const original=await record(),old=oga.normalizeRecords([original,saved]);
  const withdrawn=await sync({outputDir,old,workIds:['vnstyle'],fetcher:catalog(resources('vnstyle',archive,{license:'All rights reserved'}))});assert.deepEqual(withdrawn.records,[original]);
  const pausedMap=resources('vnstyle',archive),[raw]=parseWork(pausedMap.get(oga.origin+'/content/'+oga.works.vnstyle.slug),'vnstyle');pausedMap.set(raw.sourceFile,new Response('limited',{status:429,headers:{'retry-after':'120'}}));
  const paused=await sync({outputDir,old,workIds:['vnstyle'],fetcher:catalog(pausedMap)});assert.equal(paused.interrupted,true);assert.deepEqual(paused.records,[original,saved]);
});

test('hand-painted hallway and rain releases bind native filenames to Chinese titles and CC BY 4.0',async()=>{
  const data=await sharp(await jpg('#dbc69b',2000,1124)).png().toBuffer();
  for(const [key,fileURL,title] of [['hallway','entrance_-_brightly_lit_0.png','白昼玄关'],['hallway','entrance_-_dark_night.png','夜间玄关'],['rainy','rainy_2.png','雨天云层']]){
    const [raw]=parseWork(workPage(key,data,{fileURL,license:'CC-BY 4.0'}),key),record=await inspectImage(data,raw,fileURL),[item]=oga.normalizeRecords([record]);
    assert.ok(item.title.endsWith(title));assert.equal(item.artist,'LisadiKaprio');assert.equal(item.license,'CC BY 4.0');assert.equal(item.width,2000);assert.equal(item.height,1124);assert.ok(item.categories.includes('anime'));
    assert.deepEqual(parseWork(workPage(key,data,{fileURL,license:'CC0'}),key),[]);
    assert.deepEqual(oga.normalizeRecords([{...record,member:'preview.png'}]),[]);
    assert.deepEqual(oga.normalizeRecords([{...record,sourceFile:oga.origin+'/sites/default/files/character.png'}]),[]);
  }
  assert.deepEqual(parseWork(workPage('hallway',data,{fileURL:'entrance_-_collage.png'}),'hallway'),[]);
});

test('hallway sync keeps both native scenes and preserves unrelated releases',async t=>{
  const outputDir=await directory(t),bright=await sharp(await jpg('#dbc69b',2000,1124)).png().toBuffer(),dark=await sharp(await jpg('#22345b',2000,1124)).png().toBuffer();
  const old=await record(),pageURL=oga.origin+'/content/'+oga.works.hallway.slug;
  const brightPage=workPage('hallway',bright,{fileURL:'entrance_-_brightly_lit_0.png',fileID:164376}),darkPage=workPage('hallway',dark,{fileURL:'entrance_-_dark_night.png',fileID:164377});
  const darkLink=darkPage.match(/<a href="[^"]+" type="image\/png[^>]+>File<\/a>/)[0],page=brightPage.replace('>File</a>','>File</a>'+darkLink);
  const map=new Map([[oga.origin+'/robots.txt','User-agent: *\nCrawl-delay: 10'],[pageURL,page],[oga.origin+'/sites/default/files/entrance_-_brightly_lit_0.png',bright],[oga.origin+'/sites/default/files/entrance_-_dark_night.png',dark]]);
  const first=await sync({outputDir,old:oga.normalizeRecords([old]),workIds:['hallway'],fetcher:catalog(map)});
  assert.equal(first.records.length,3);assert.deepEqual(first.records.find(record=>record.work==='painted'),old);
  const scenes=first.records.filter(record=>record.work==='hallway');assert.equal(scenes.length,2);assert.deepEqual(scenes.map(record=>record.title),['手绘走廊 · 白昼玄关','手绘走廊 · 夜间玄关']);
  for(const [i,record] of scenes.entries())assert.deepEqual(await fs.readFile(path.join(outputDir,record.revision+'.png')),i===0?bright:dark);
  map.set(pageURL,workPage('hallway',bright,{fileURL:'entrance_-_brightly_lit_0.png',fileID:164376}));
  const second=await sync({outputDir,old:oga.normalizeRecords(first.records),workIds:['hallway'],fetcher:catalog(map)});assert.equal(second.records.length,2);assert.ok(!second.records.some(record=>record.fileID===164377));
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

async function sevenArchive(files){
  const SevenZip=require('7z-wasm'),seven=await SevenZip({print(){},printErr(){},noInitialRun:true});
  seven.FS.mkdir('/input');seven.FS.chdir('/input');
  for(const [name,data] of Object.entries(files))seven.FS.writeFile(name,data);
  assert.equal(seven.callMain(['a','-t7z','-m0=LZMA2','-mx=1','/bundle.7z',...Object.keys(files)]),0);
  return Buffer.from(seven.FS.readFile('/bundle.7z'));
}

test('manga releases bind the CC0 author and 7z MIME type to individual PNG scenes',async()=>{
  const bytes=Buffer.alloc(10),[raw]=parseWork(workPage('manga',bytes),'manga');
  assert.equal(raw.artist,'Kutejnikov');assert.match(raw.sourceFile,/manga_bg\.7z$/);
  for(const options of [{mime:'application/zip'},{fileURL:'other.7z'},{artist:'Other'},{license:'All rights reserved'}])assert.deepEqual(parseWork(workPage('manga',bytes,options),'manga'),[]);
  assert.throws(()=>archiveImages(bytes,'manga'),/大小限制/);
  const data=await sharp({create:{width:1920,height:1080,channels:3,background:'#656565'}}).png().toBuffer();
  const checked=await inspectImage(data,raw,'manga_bg_01.png'),[item]=oga.normalizeRecords([checked]);
  assert.deepEqual(item.categories,['anime','illustration','city']);assert.equal(item.license,'CC0');assert.equal(item.width,1920);assert.equal(item.title,'黑白漫画场景 · 01');
  for(const member of ['manga_bg.jpg','ReadMe.txt','manga_bg_01.jpg','../manga_bg_01.png'])assert.deepEqual(oga.normalizeRecords([{...checked,member}]),[]);
});

test('ink scenes bind each native file to its author and localized title without counting them as anime',async t=>{
  const data=await sharp({create:{width:1920,height:1080,channels:3,background:'#87a778'}}).png().toBuffer(),outputDir=await directory(t);
  for(const [file,title] of [['bamboo_3.png','竹林'],['sakura_tree_0.png','樱花'],['temple_0.png','鸟居']]){
    const options={fileURL:file},[raw]=parseWork(workPage('ink',data,options),'ink'),checked=await inspectImage(data,raw,file),[item]=oga.normalizeRecords([checked]);
    assert.equal(item.title,'日式水墨 · '+title);assert.equal(item.artist,'Oyasumi');assert.equal(item.license,'CC0');assert.ok(item.categories.includes('minimal'));assert.ok(!item.categories.includes('anime'));
    const collected=await sync({outputDir,workIds:['ink'],fetcher:catalog(resources('ink',data,options))});assert.equal(collected.records.length,1);assert.deepEqual(await fs.readFile(path.join(outputDir,digest(data)+'.png')),data);
  }
  for(const options of [{artist:'Other'},{fileURL:'unrelated.png'},{license:'CC BY 4.0'},{mime:'application/zip'}])assert.deepEqual(parseWork(workPage('ink',data,options),'ink'),[]);
});

test('visual novel releases preserve the complete background and exclude character cutouts and project files',async t=>{
  const data=await sharp({create:{width:2484,height:1200,channels:3,background:'#62625f'}}).png().toBuffer(),member='VN_tutorial_assets_background.png',archive=zipSync({[member]:data,'VN_tutorial_assets_Dude..png':Buffer.from('cutout'),'VN_tutorial_assets_Girl..png':Buffer.from('cutout'),'VN_tutorial_assets.kra':Buffer.from('project')}),outputDir=await directory(t);
  assert.deepEqual(archiveImages(archive,'office'),[{member,data}]);
  const options={outputDir,workIds:['office']},first=await sync({...options,fetcher:catalog(resources('office',archive))});assert.equal(first.records.length,1);
  const [item]=oga.normalizeRecords(first.records);assert.equal(item.title,'视觉小说场景 · 办公室');assert.equal(item.width,2484);assert.equal(item.height,1200);assert.ok(item.categories.includes('anime'));assert.equal(item.artist,'DasBilligeAlien');assert.deepEqual(await fs.readFile(path.join(outputDir,digest(data)+'.png')),data);
  const removed=await sync({...options,old:oga.normalizeRecords(first.records),fetcher:catalog(resources('office',archive,{license:'All rights reserved'}))});assert.deepEqual(removed.records,[]);
  for(const options of [{artist:'Other'},{fileURL:'another.zip'},{mime:'image/png'}])assert.deepEqual(parseWork(workPage('office',archive,options),'office'),[]);
});

test('7z listing rejects unsafe paths, encryption, links, duplicates and oversized expansion before decoding',()=>{
  const entry=(name='manga_bg_01.png',size=20,extra='')=>'Path = '+name+'\nSize = '+size+'\nAttributes = A\nEncrypted = -'+extra;
  const listing=entries=>'Type = 7z\nMethod = LZMA2:16\n\n----------\n'+entries.join('\n\n');
  const valid=listing([entry(),entry('ReadMe.txt')]);assert.deepEqual(parse7zListing(valid,'manga'),[{member:'manga_bg_01.png',size:20}]);
  assert.deepEqual(parse7zListing(valid.replace('LZMA2:16','LZMA2:64m'),'manga'),[{member:'manga_bg_01.png',size:20}]);
  assert.deepEqual(parse7zListing(listing([]),'manga'),[]);
  for(const text of [null,'bad',valid.replace('Type = 7z','Type = zip'),valid.replace('LZMA2:16','LZMA2:27'),valid.replace('LZMA2:16','LZMA2:128m'),'x'.repeat(1024*1024+1)])assert.throws(()=>parse7zListing(text,'manga'));
  assert.throws(()=>parse7zListing(valid,'painted'),/目录/);
  for(const name of ['../escape.png','/absolute.png','folder\\x.png','folder/./x.png','C:/escape.png','folder//x.png','x'.repeat(241)])assert.throws(()=>parse7zListing(listing([entry(name)]),'manga'),/路径/);
  assert.throws(()=>parse7zListing(listing([entry(),entry('MANGA_BG_01.PNG')]),'manga'),/重复路径/);
  for(const text of [entry().replace('Encrypted = -','Encrypted = +'),entry()+'\nSymbolic Link = other.png',entry().replace('Attributes = A','Attributes = A_ lrwxrwxrwx')])assert.throws(()=>parse7zListing(listing([text]),'manga'),/加密文件或链接/);
  for(const text of [entry()+'\nSize = 20',entry()+'\ninvalid'])assert.throws(()=>parse7zListing(listing([text]),'manga'),/条目格式/);
  for(const size of ['bad',-1,32*1024*1024+1])assert.throws(()=>parse7zListing(listing([entry('manga_bg_01.png',size)]),'manga'),/文件大小/);
  assert.throws(()=>parse7zListing(listing([entry('manga_bg_01.png',0)]),'manga'),/普通文件/);
  assert.throws(()=>parse7zListing(listing([entry()+'\nFolder = +']),'manga'),/普通文件/);
  assert.throws(()=>parse7zListing(listing(Array.from({length:251},(_,i)=>entry('f'+i))),'manga'),/文件数/);
  assert.throws(()=>parse7zListing(listing(Array.from({length:5},(_,i)=>entry('f'+i,32*1024*1024))),'manga'),/展开大小/);
});

test('real 7z decoding preserves only native scene bytes and integrates with automatic author updates',async t=>{
  const outputDir=await directory(t),data=await sharp({create:{width:1920,height:1080,channels:3,background:'#696969'}}).png().toBuffer();
  const archive=await sevenArchive({'manga_bg_01.png':data,'manga_bg.jpg':await jpg(),'ReadMe.txt':Buffer.from('CC0')});
  const decoded=await read7zImages(archive,'manga');assert.equal(decoded.length,1);assert.equal(decoded[0].member,'manga_bg_01.png');assert.deepEqual(decoded[0].data,data);
  const options={outputDir,workIds:['manga'],fetcher:catalog(resources('manga',archive))};
  const first=await sync(options);assert.equal(first.records.length,1);assert.equal(first.records[0].revision,digest(data));assert.deepEqual(await fs.readFile(path.join(outputDir,digest(data)+'.png')),data);
  const next=await sevenArchive({'manga_bg_02.png':data,'manga_bg.jpg':await jpg()});
  const changed=await sync({...options,old:oga.normalizeRecords(first.records),fetcher:catalog(resources('manga',next))});assert.equal(changed.records.length,1);assert.equal(changed.records[0].member,'manga_bg_02.png');
  const corrupt=Buffer.from(archive);corrupt[corrupt.length-1]^=255;
  await assert.rejects(read7zImages(corrupt,'manga'),/7z|目录/);
  for(const [bytes,key] of [[Buffer.alloc(10),'manga'],[Buffer.alloc(33*1024*1024),'manga'],[archive,'painted']])await assert.rejects(read7zImages(bytes,key),/格式或大小/);
  for(const timeout of [0,60001])await assert.rejects(read7zImages(archive,'manga',{timeout}),/时限/);
  await assert.rejects(read7zImages(archive,'manga',{timeout:1}),/超时/);
});
