const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const sharp=require('sharp'),{zipSync}=require('fflate');
const blender=require('../source/wallpapers/blender.js');
const feeds=require('../source/wallpapers/feeds.js'),previews=require('../source/wallpapers/previews.js');
const {readZipImages}=require('../scripts/read-wallpaper-zip.cjs');
const {robotsDelay,discoverAsset,projectLicensed,parseAsset,inspectImage,collectBlender}=require('../scripts/collect-blender.cjs');
const {readImage,buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const {refreshCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs');
const now=new Date('2026-10-02T08:00:00Z'),logger={log(){},warn(){}},member='010_0020_A.jpg';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const image=(format='jpeg',width=1800,height=900,color='#568794')=>sharp({create:{width,height,channels:3,background:color}}).toFormat(format).toBuffer();
const fileFor=key=>{const prefix=key==='spring'?'9d':'74',hash=prefix+(key==='spring'?'b':'a').repeat(30);return blender.origin+'/download-source/files/'+prefix+'/'+hash+'/'+hash+'.zip';};
async function directory(t){const result=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-blender-test-'));t.after(()=>fs.rm(result,{recursive:true,force:true}));return result;}
function gallery(key,options={}){
  const work=blender.works[key];return '<title>Press - '+work.projectName+' - Blender Studio</title>'+(options.empty?'':'<a class="cards-item-content file-modal-link" title="'+work.title+'" data-asset-id="'+work.assetID+'" data-url="'+new URL(blender.assetURL(key)).pathname+new URL(blender.assetURL(key)).search+'">Frames</a>');
}
function licensePage(key){return '<div class="flat-page-content"><p>The work is licensed under <a href="'+blender.licenseUrl+'">Creative Commons Attribution 4.0 license</a>. This includes all the data we publish on this website.</p><p>In short, this means you can freely reuse and distribute this content, also commercially, as long you include proper attribution.</p><p>'+blender.works[key].attribution+'</p></div>';}
function assetPage(key,{license=blender.licenseUrl,contributor=blender.works[key].contributor,free=true,locked=false,download=fileFor(key),title=blender.works[key].title}={}){
  const work=blender.works[key];return '<div id="asset-'+work.assetID+'" data-asset-id="'+work.assetID+'" class="js-modal-inner-wrapper"><div class="modal-body">'+(locked?'<img class="content-locked-img">':'')+'<div class="profile-card"><strong class="profile-name">'+contributor+'</strong></div><ul class="list-inline"><li>'+(free?'Free':'Subscriber')+'</li></ul><div class="btns-toolbar"><a href="'+new URL(download).pathname+'" title="Download (2 MB)" download="shot_frames.zip">Download</a><div class="dropdown-menu"><a href="'+license+'" class="dropdown-item">License <span>CC-BY</span></a></div></div><div class="markdown-text"><h3>'+title+'</h3><p>Final frames.</p></div><div class="comments"><div class="comment-body"><div class="markdown-text">Comment text</div></div></div></div></div>';
}
function resources(key,bytes,options={}){
  return new Map([[blender.origin+'/robots.txt',''],[blender.origin+blender.works[key].licenseSource,licensePage(key)],[blender.pageFor(key),gallery(key)],[blender.assetURL(key),assetPage(key,options)],[fileFor(key),bytes]]);
}
function fetcher(map,calls=[]){return async(url,options)=>{
  calls.push(url);assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);
  const result=map.get(url);if(result instanceof Error)throw result;if(result instanceof Response)return result;
  return result===undefined?new Response('Missing',{status:404}):new Response(result);
};}
const sync=options=>collectBlender({logger,now,wait:async()=>{},...options});
async function record(key='wing-it'){
  const raw=parseAsset(assetPage(key),key),data=await image(key==='spring'?'png':'jpeg');raw.archiveRevision=digest(Buffer.from('archive'));
  return inspectImage(data,raw,key==='spring'?'frames/1807.png':member);
}

test('only the producer project and the exact free asset toolbar grant the selected release license',()=>{
  assert.ok(projectLicensed(licensePage('wing-it'),'wing-it'));assert.ok(projectLicensed(licensePage('spring'),'spring'));
  for(const html of ['',licensePage('wing-it').replace(blender.licenseUrl,'https://example.test/license'),licensePage('wing-it').replace('all the data','some data'),licensePage('wing-it').replace('</div>','<p>redistribution is prohibited</p></div>'),licensePage('wing-it').replace('flat-page-content','comment-body')])assert.equal(projectLicensed(html,'wing-it'),false);
  assert.equal(projectLicensed(licensePage('wing-it'),'unknown'),false);
  assert.equal(discoverAsset(gallery('wing-it'),'wing-it'),blender.assetURL('wing-it'));assert.equal(discoverAsset(gallery('spring',{empty:true}),'spring'),null);
  for(const html of ['',gallery('wing-it').replace('Press - Wing It!','Press - Another Film'),gallery('wing-it').replace('site_context=gallery','site_context=unknown'),gallery('wing-it').replace('</a>','</a>'+gallery('wing-it').replace(/<title>.*?<\/title>/,''))])assert.throws(()=>discoverAsset(html,'wing-it'));
  assert.throws(()=>discoverAsset('', '__proto__'),/未知/);
  const raw=parseAsset(assetPage('spring'),'spring');assert.equal(raw.contributor,'Francesco Siddi');assert.equal(raw.license,'CC BY 4.0');assert.equal(raw.sourceFile,fileFor('spring'));
  for(const options of [{license:'https://creativecommons.org/licenses/by-nc/4.0/'},{contributor:'Unverified user'},{free:false},{locked:true}])assert.equal(parseAsset(assetPage('wing-it',options),'wing-it'),null);
  for(const html of ['',assetPage('wing-it').replace('data-asset-id="7037"','data-asset-id="1"'),assetPage('wing-it').replace('class="dropdown-item"','class="other"'),assetPage('wing-it',{title:'Different asset'}),assetPage('wing-it').replace('download="shot_frames.zip"','download="movie.mp4"'),assetPage('wing-it').replace('/download-source/files/74/','/private/files/74/')])assert.throws(()=>parseAsset(html,'wing-it'));
  assert.throws(()=>parseAsset('', '__proto__'),/未知/);
  const unbound=assetPage('wing-it',{license:'https://example.test'})+'<a class="dropdown-item" href="'+blender.licenseUrl+'">License CC-BY</a>';assert.equal(parseAsset(unbound,'wing-it'),null);
});

test('normalized frames bind the project, release, member, contributor and native content digest',async()=>{
  const raw=await record(),[item]=blender.normalizeRecords([raw,raw]);assert.equal(item.id,'blender-7037-010_0020_a');assert.equal(item.download,item.image);assert.match(item.download,/^\.\/originals\/blender\/[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(feeds.normalizeFeed([raw],'blender'),[item]);assert.ok(item.tags.includes('原创动画'));assert.ok(!item.categories.includes('anime'));assert.match(item.copyrightNotice,/Beau Gerbrands/);
  assert.equal(item.title,'Wing It! · 焊接火花');assert.deepEqual(item.categories,['illustration']);assert.equal(blender.normalizeRecords([{...raw,member:'999_9999_Z.jpg'}])[0].title,'Wing It! · 电影画面 999_9999_Z');
  const spring=blender.normalizeRecords([await record('spring')])[0];assert.ok(spring.categories.includes('fantasy'));assert.match(spring.copyrightNotice,/cloud\.blender\.org\/spring/);
  for(const changes of [{work:'__proto__'},{assetID:889},{artist:'Other'},{contributor:'Other'},{license:'CC0'},{licenseUrl:blender.origin},{licenseSource:blender.origin},{pageUrl:blender.origin},{sourceFile:'https://example.test/archive.zip'},{member:'../010_0020_A.jpg'},{member:'poster.jpg'},{archiveRevision:'bad'},{revision:'bad'},{extension:'png'},{width:1599},{height:799},{width:300000},{bytes:0},{bytes:33*1024*1024}])assert.deepEqual(blender.normalizeRecords([{...raw,...changes}]),[]);
  assert.deepEqual(blender.normalizeRecords(null),[]);assert.deepEqual(blender.normalizeRecords([null]),[]);
  for(const url of [null,'http://studio.blender.org'+new URL(fileFor('wing-it')).pathname,fileFor('wing-it')+'?token=1',fileFor('wing-it')+'#file',fileFor('wing-it').replace('/74/','/ff/'),fileFor('wing-it').replace(/a\.zip$/,'b.zip'),'https://studio.blender.org@evil.test'+new URL(fileFor('wing-it')).pathname])assert.equal(blender.fileURL(url),null);
  assert.equal(blender.assetURL('__proto__'),null);assert.equal(blender.pageFor('unknown'),null);assert.equal(blender.originalPath({revision:'../file',extension:'jpg'}),null);assert.equal(blender.originalPath({revision:'a'.repeat(64),extension:'svg'}),null);
});

test('robots rules allow empty policies, honor specific agents, wildcard exclusions and permitted subpaths',()=>{
  assert.equal(robotsDelay('', ['/projects/']),0);assert.equal(robotsDelay('User-agent: Other\nDisallow: /', ['/projects/']),0);
  assert.equal(robotsDelay('User-agent: *\nDisallow: /\nUser-agent: RabbitWallpaperStation\nAllow: /projects/\nCrawl-delay: 1.5', ['/projects/wing-it/']),1500);
  assert.equal(robotsDelay('User-agent: *\nDisallow: /projects/\nAllow: /projects/api/\nSitemap: https://studio.blender.org/sitemap.xml', ['/projects/api/assets/7037/']),0);
  assert.equal(robotsDelay('User-agent: *\nDisallow: /projects/\nAllow: /projects/', ['/projects/wing-it/']),0);
  for(const policy of ['<html>Blocked</html>','Disallow: /','User-agent:\nAllow: /','User-agent: *\nDisallow: /','User-agent: *\nDisallow: /*?site_context=*','User-agent: *\nDisallow: /projects/api/assets/7037/$','User-agent: *\nCrawl-delay: 61','User-agent: *\nCrawl-delay: invalid','User-agent: *\nCrawl-delay:'])assert.throws(()=>robotsDelay(policy,['/projects/api/assets/7037/?site_context=gallery','/projects/api/assets/7037/']));
  assert.equal(robotsDelay('User-agent: *\nUser-agent: Other\nCrawl-delay: 0\nAllow: / # comment', ['/projects/']),0);
});

test('archive extraction includes final frames, excludes posters and metadata, and bounds expansion before decoding',()=>{
  const archive=zipSync({[member]:Buffer.from('native'),'__MACOSX/._frame.jpg':Buffer.from('ignored'),'poster.jpg':Buffer.from('ignored')});
  assert.deepEqual(readZipImages(archive,blender.works['wing-it'].member),[{member,data:Buffer.from('native')}]);
  for(const bytes of [null,Buffer.alloc(0),Buffer.alloc(33*1024*1024),Buffer.from('invalid zip')])assert.throws(()=>readZipImages(bytes,blender.works.spring.member));
  assert.throws(()=>readZipImages(archive,null));
  for(const name of ['../010_0020_A.jpg','/010_0020_A.jpg','folder\\010_0020_A.jpg','./010_0020_A.jpg'])assert.throws(()=>readZipImages(zipSync({[name]:Buffer.from('image')}),/./),/路径/);
  assert.throws(()=>readZipImages(zipSync(Object.fromEntries(Array.from({length:251},(_,index)=>['file'+index,Buffer.alloc(0)]))),/./),/文件数/);
  const oversized=zipSync({file:Buffer.from('x')});const central=Buffer.from(oversized).indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));oversized[central+24]=1;oversized[central+27]=3;assert.throws(()=>readZipImages(oversized,/./),/大小/);
});

test('native inspection decodes full images and rejects small, transparent, rotated or mislabeled files',async()=>{
  const raw=parseAsset(assetPage('wing-it'),'wing-it');raw.archiveRevision=digest(Buffer.from('archive'));
  const data=await image(),record=await inspectImage(data,raw,member);assert.equal(record.revision,digest(data));assert.equal(record.width,1800);assert.equal(record.height,900);
  assert.equal(await inspectImage(data,null,member),null);assert.equal(await inspectImage(data,raw,'poster.jpg'),null);
  for(const data of [await image('jpeg',1280,720),await image('png'),await sharp(await image()).withMetadata({orientation:6}).toBuffer()])assert.equal(await inspectImage(data,raw,member),null);
  const spring=parseAsset(assetPage('spring'),'spring');spring.archiveRevision=raw.archiveRevision;
  const transparent=await sharp({create:{width:1800,height:900,channels:4,background:{r:1,g:2,b:3,alpha:0.5}}}).png().toBuffer();assert.equal(await inspectImage(transparent,spring,'frames/1807.png'),null);
  await assert.rejects(inspectImage(Buffer.from('corrupt'),raw,member));assert.equal(await inspectImage(await image(),{...raw,license:'CC0'},member),null);
});

test('automatic sync preserves native bytes, uses the source delay and updates members within each licensed release',async t=>{
  const outputDir=await directory(t),data=await image(),zip=zipSync({[member]:data,'poster.jpg':data}),map=resources('wing-it',zip),calls=[],delays=[];
  map.set(blender.origin+'/robots.txt','User-agent: *\nCrawl-delay: 2');
  const first=await sync({outputDir,workIds:['wing-it'],fetcher:fetcher(map,calls),wait:async delay=>delays.push(delay)});
  assert.equal(first.records.length,1);assert.equal(first.updated,true);assert.equal(calls.length,5);assert.deepEqual(delays,[2000,2000,2000,2000]);
  const saved=first.records[0],file=path.join(outputDir,saved.revision+'.jpg');assert.deepEqual(await fs.readFile(file),data);assert.equal(saved.archiveRevision,digest(zip));
  await fs.writeFile(path.join(outputDir,'user-note.txt'),'preserve');await fs.writeFile(path.join(outputDir,'0'.repeat(64)+'.png'),'obsolete');
  const secondData=await image('jpeg',1800,900,'#abcdef');map.set(fileFor('wing-it'),zipSync({'020_0040_A.jpg':secondData}));
  const second=await sync({outputDir,workIds:['wing-it'],fetcher:fetcher(map),old:blender.normalizeRecords(first.records)});assert.equal(second.records.length,1);assert.equal(second.records[0].member,'020_0040_A.jpg');
  await assert.rejects(fs.readFile(file),{code:'ENOENT'});await assert.rejects(fs.readFile(path.join(outputDir,'0'.repeat(64)+'.png')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(outputDir,'user-note.txt'),'utf8'),'preserve');
});

test('partial failures retain the failed project while confirmed locked, unlicensed or removed assets retire records',async t=>{
  const outputDir=await directory(t),wingData=await image(),springData=await image('png'),wing=resources('wing-it',zipSync({[member]:wingData})),spring=resources('spring',zipSync({'frames/1807.png':springData}));
  const map=new Map([...wing,...spring]);
  const initial=await sync({outputDir,fetcher:fetcher(map)});assert.equal(initial.records.length,2);const old=blender.normalizeRecords(initial.records);
  map.set(blender.assetURL('spring'),Error('offline'));const partial=await sync({outputDir,fetcher:fetcher(map),old});assert.deepEqual(partial.records.find(raw=>raw.work==='spring'),initial.records.find(raw=>raw.work==='spring'));
  for(const options of [{locked:true},{free:false},{license:'https://creativecommons.org/licenses/by-nc/4.0/'}]){
    map.set(blender.assetURL('wing-it'),assetPage('wing-it',options));assert.equal((await sync({outputDir,workIds:['wing-it'],fetcher:fetcher(map),old})).records.filter(raw=>raw.work==='wing-it').length,0);
  }
  map.set(blender.pageFor('wing-it'),gallery('wing-it',{empty:true}));assert.equal((await sync({outputDir,workIds:['wing-it'],fetcher:fetcher(map),old})).records.filter(raw=>raw.work==='wing-it').length,0);
  map.set(blender.origin+blender.works['wing-it'].licenseSource,'unrecognized');await assert.rejects(sync({outputDir,workIds:['wing-it'],fetcher:fetcher(map),old}),/均无法/);
});

test('rate limits stop requests and persist through refresh, cooldown and seed merging',async t=>{
  const outputDir=await directory(t),raw=await record(),old=blender.normalizeRecords([raw]),zip=zipSync({[member]:await image()}),map=resources('wing-it',zip),calls=[];
  map.set(blender.assetURL('wing-it'),new Response('Slow down',{status:429,headers:{'Retry-After':'120'}}));
  const paused=await sync({outputDir,workIds:['wing-it'],fetcher:fetcher(map,calls),old});assert.equal(paused.interrupted,true);assert.equal(paused.updated,false);assert.deepEqual(paused.records,[raw]);assert.equal(paused.retryAt,'2026-10-02T08:02:00.000Z');assert.equal(calls.length,4);
  const previous={version:1,records:{blender:[raw]},updatedAt:{blender:'2026-10-01T00:00:00Z'},continuation:{blender:{retryAt:paused.retryAt}}};
  const result=await refreshCatalog({previous,providerIds:['blender'],now,logger,fetcher:()=>assert.fail('source is cooling'),blenderOptions:{outputDir,workIds:['wing-it'],wait:async()=>{}}});assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.blender,[raw]);assert.equal(result.catalog.updatedAt.blender,previous.updatedAt.blender);assert.equal(mergeCatalogs(previous,result.catalog).continuation.blender.retryAt,paused.retryAt);
  assert.deepEqual((await refreshCatalog({previous,providerIds:[],logger,now})).catalog.continuation.blender,previous.continuation.blender);
  const seeded={...previous,updatedAt:{blender:'2026-10-02T09:00:00Z'},continuation:{blender:null}};assert.equal(mergeCatalogs(seeded,result.catalog).continuation.blender,null);
});

test('failed policy, source and archive reads preserve previous catalog metadata and reject invalid sync settings',async t=>{
  const outputDir=await directory(t),raw=await record(),previous={version:1,records:{blender:[raw]},updatedAt:{blender:'2026-10-01T00:00:00Z'},continuation:{blender:null}},zip=zipSync({[member]:await image()}),map=resources('wing-it',zip);
  for(const [url,response] of [[blender.origin+'/robots.txt','<html>blocked</html>'],[blender.assetURL('wing-it'),'<html>changed structure</html>'],[fileFor('wing-it'),Buffer.from('bad zip')]]){
    const failing=new Map(map);failing.set(url,response);const result=await refreshCatalog({previous,providerIds:['blender'],now,logger,fetcher:fetcher(failing),blenderOptions:{outputDir,workIds:['wing-it'],wait:async()=>{}}});assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.blender,[raw]);assert.equal(result.catalog.updatedAt.blender,previous.updatedAt.blender);
  }
  for(const options of [{intervalMs:-1},{intervalMs:60001},{workIds:[]},{workIds:null},{workIds:['__proto__']},{workIds:['spring','spring']}])await assert.rejects(sync({outputDir,fetcher:()=>assert.fail('invalid config'),...options}),/配置/);
  await assert.rejects(readImage(async()=>new Response(''),'https://example.test/robots.txt'),/为空/);assert.deepEqual(await readImage(async()=>new Response(''),'https://example.test/robots.txt',{allowEmpty:true}),Buffer.alloc(0));
});

test('local originals generate complete WebP previews, retain single-image downloads and reject cache tampering',async t=>{
  const outputDir=await directory(t),blenderOriginalsDir=await directory(t),data=await image(),raw=await record(),[item]=blender.normalizeRecords([raw]);await fs.writeFile(path.join(blenderOriginalsDir,raw.revision+'.jpg'),data);
  const options={items:[item],outputDir,blenderOriginalsDir,logger,now,fetcher:()=>assert.fail('original already cached')};
  const built=await buildPreviews(options);assert.equal(built.created,1);assert.equal(built.failures,0);assert.deepEqual(previews.imageCandidates(item,built.manifest),[previews.previewFor(item,built.manifest),item.download]);
  const preview=await sharp(await fs.readFile(path.join(outputDir,previews.filenameFor(item)))).metadata();assert.equal(preview.format,'webp');assert.equal(preview.width,1280);assert.equal(preview.height,640);assert.ok(!item.download.endsWith('.zip'));
  assert.equal((await buildPreviews({...options,previous:built.manifest})).reused,1);
  await fs.writeFile(path.join(blenderOriginalsDir,raw.revision+'.jpg'),await image('jpeg',1800,900,'#000000'));assert.equal((await buildPreviews(options)).failures,1);
  await fs.unlink(path.join(blenderOriginalsDir,raw.revision+'.jpg'));assert.equal((await buildPreviews(options)).failures,1);
});
