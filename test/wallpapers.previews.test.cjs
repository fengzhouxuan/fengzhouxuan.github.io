const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const sharp=require('sharp');
const repositories=require('../source/wallpapers/repositories.js');
const ayomi=require('../source/wallpapers/ayomi.js');
const feeds=require('../source/wallpapers/feeds.js');
const morevna=require('../source/wallpapers/morevna.js');
const previews=require('../source/wallpapers/previews.js');
const {readImage,encodePreview,copyAuthorPreview,buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const now=new Date('2026-10-02T00:00:00Z'),logger={log(){},warn(){}};
const revision=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
function item(bytes,provider='folium',filename='Abstract/test.png',width=2000,height=1000){
  const source=repositories.sources[provider];
  return repositories.normalizeRepository([{path:filename,revision:revision(bytes),width,height,license:source.license,licenseUrl:source.licenseUrl}],provider)[0];
}
const png=()=>sharp({create:{width:2000,height:1000,channels:3,background:'#658cad'}}).png().toBuffer();
function authorItem(id='one',original=false){
  const download='https://oc.nekosia.cat/images/gallery/snowy-park/girl-'+id+'.png';
  return ayomi.normalizeRecords([{artist:ayomi.source.artist,title:'Catgirl at the snowy park',context:'Original winter illustration',copyrightNotice:'© AyomiCat · CC BY-NC-ND 4.0',download,image:original?download:download.replace('/images/gallery/','/images/thumbs/')+'.webp',pageUrl:'https://oc.nekosia.cat/gallery/snowy-park',revision:'2026-04-18T02:41:35.875Z',license:ayomi.source.license,licenseUrl:ayomi.source.licenseUrl,width:1024,height:1536,imageWidth:original?1024:640,imageHeight:original?1536:960}])[0];
}
const authorBytes=()=>sharp({create:{width:640,height:960,channels:3,background:'#ab8acd'}}).webp({quality:90}).toBuffer();
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-preview-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function pepperItem(kind='wallpaper'){
  const filename='2023-04-26_The-Healer_by-David-Revoy.jpg',directory='https://www.peppercarrot.com/0_sources/0ther/'+(kind==='artwork'?'artworks':'wallpapers')+'/';
  return feeds.normalizeFeed([{filename,download:directory+'hi-res/'+filename,image:kind==='artwork'?directory+'low-res/'+filename:'https://www.peppercarrot.com/cache/Healer_900x400px.jpg',artist:'David Revoy',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',pageUrl:kind==='artwork'?'https://www.peppercarrot.com/en/viewer/artworks__'+filename.slice(0,-4)+'.html':feeds.pepperPage,width:2000,height:1250,...(kind==='artwork'?{kind,title:'The Healer'}:{})}],'pepper')[0];
}
function morevnaItem(){
  const upload='https://morevnaproject.org/wp-content/uploads/2025/10/';
  return morevna.normalizeRecords([{workID:1,mediaID:1001,kind:'background',title:'Sunset',artist:'Artist',artistUrls:['https://morevnaproject.org/artist/original-artist/'],pageUrl:'https://morevnaproject.org/artwork/work-1/',download:upload+'work-1.jpg',image:upload+'work-1-1024x640.jpg',width:2000,height:1250,mediaWidth:1600,mediaHeight:1000,imageWidth:1024,imageHeight:640,revision:'2025-10-01T00:00:00',license:morevna.source.license,licenseUrl:morevna.source.licenseUrl,licenseSource:morevna.source.gallery}])[0];
}

test('Pepper and Morevna previews bind licensed source files, uncropped ratios and bounded metadata',()=>{
  for(const image of [pepperItem(),pepperItem('artwork'),morevnaItem()]){
    const entry={revision:previews.revisionFor(image),url:image.provider==='pepper'?image.download:image.image,width:1024,height:640,bytes:1000,digest:'a'.repeat(64),checkedAt:now.toISOString()},manifest={version:1,images:{[image.id]:entry}};
    assert.ok(previews.filenameFor(image).startsWith(image.provider+'/'));assert.equal(previews.previewFor(image,manifest),'./previews/'+previews.filenameFor(image));
    for(const changes of [{revision:'wrong'},{url:'https://evil.example/file.jpg'},{digest:undefined},{digest:'unsafe'},{width:900,height:400},{width:1281},{height:0},{bytes:previews.maxBytes+1},...(image.provider==='pepper'?[{checkedAt:undefined},{checkedAt:'invalid'}]:[{width:1280,height:800}])])assert.equal(previews.previewFor(image,{version:1,images:{[image.id]:{...entry,...changes}}}),null);
    for(const invalid of [null,{...image,id:'forged'},{...image,feedRecord:{...image.feedRecord,license:'MIT'}},{...image,feedRecord:{...image.feedRecord,download:'https://evil.example/file.jpg'}}]){assert.equal(previews.filenameFor(invalid),null);assert.equal(previews.revisionFor(invalid),null);assert.equal(previews.previewFor(invalid,manifest),null);}
    assert.equal(previews.revisionFor(image),image.provider==='pepper'?JSON.stringify([image.download,image.width,image.height]):image.feedRecord.revision);
    assert.deepEqual(previews.imageCandidates(image,manifest),[previews.previewFor(image,manifest),image.provider==='pepper'?image.download:image.image]);
  }
  const pepper=pepperItem(),manga=morevnaItem();
  assert.deepEqual(previews.imageCandidates(pepper,null),[pepper.download]);assert.deepEqual(previews.imageCandidates({...pepper,id:'forged'}),[]);
  assert.equal(previews.filenameFor({...manga,feedRecord:{...manga.feedRecord,revision:'2025-99-01T00:00:00'}}),null);
  assert.equal(previews.filenameFor(manga),'morevna/2025/10/work-1.jpg.1759276800000-v1.webp');
  assert.equal(previews.revisionFor(authorItem()),authorItem().revision);
  const longName='2023-04-26_'+ 'a'.repeat(220)+'_by-David-Revoy.jpg';
  assert.equal(previews.filenameFor({...pepper,id:'pepper-'+longName.slice(0,-4),feedRecord:{...pepper.feedRecord,filename:longName,download:pepper.download.replace(pepper.feedRecord.filename,longName)}}),null);
  const longOriginal='a'.repeat(220)+'.jpg';
  assert.equal(previews.filenameFor({...manga,feedRecord:{...manga.feedRecord,download:manga.download.replace('work-1.jpg',longOriginal),image:manga.image.replace('work-1-',longOriginal.slice(0,-4)+'-')}}),null);
});

test('Pepper uses native JPEGs rather than cropped thumbnails and preserves the full frame',async t=>{
  const outputDir=await directory(t),image=pepperItem(),pixels=Buffer.alloc(2000*1250*3);
  for(let y=0;y<1250;y++)for(let x=0;x<2000;x++){const offset=(y*2000+x)*3;pixels[offset]=y<100?255:0;pixels[offset+2]=y>=1150?255:0;}
  const bytes=await sharp(pixels,{raw:{width:2000,height:1250,channels:3}}).jpeg().toBuffer();
  const first=await buildPreviews({items:[image,{...image,id:'forged'}, {...image,feedRecord:{...image.feedRecord,license:'All rights reserved'}}],outputDir,now,logger,fetcher:async url=>{assert.equal(url,image.download);return new Response(bytes);}});
  assert.equal(first.created,1);assert.equal(first.failures,0);const entry=first.manifest.images[image.id];assert.equal(entry.width,1280);assert.equal(entry.height,800);assert.equal(entry.url,image.download);assert.equal(entry.checkedAt,now.toISOString());
  const data=await fs.readFile(path.join(outputDir,previews.filenameFor(image)));assert.equal(entry.digest,crypto.createHash('sha256').update(data).digest('hex'));
  const top=await sharp(data).extract({left:0,top:0,width:1,height:1}).raw().toBuffer(),bottom=await sharp(data).extract({left:1279,top:799,width:1,height:1}).raw().toBuffer();assert.ok(top[0]>200&&top[2]<30);assert.ok(bottom[2]>200&&bottom[0]<30);
  assert.deepEqual(previews.imageCandidates(image,first.manifest),[previews.previewFor(image,first.manifest),image.download]);assert.equal(image.license,'CC BY 4.0');
});

test('Pepper rejects changed native dimensions, non-JPEG files and rotated metadata',async t=>{
  const outputDir=await directory(t),image=pepperItem(),create=()=>sharp({create:{width:2000,height:1250,channels:3,background:'#465ca2'}});
  for(const bytes of [await create().png().toBuffer(),await create().resize(1600,1000).jpeg().toBuffer(),await create().withMetadata({orientation:6}).jpeg().toBuffer()]){
    const result=await buildPreviews({items:[image],outputDir,now,logger,fetcher:async()=>new Response(bytes)});assert.equal(result.created,0);assert.equal(result.failures,1);assert.deepEqual(result.manifest.images,{});
  }
});

test('Pepper rechecks unchanged source URLs weekly and retains verified files during failure or a zero budget',async t=>{
  const outputDir=await directory(t),image=pepperItem(),bytes=await sharp({create:{width:2000,height:1250,channels:3,background:'#235c91'}}).jpeg().toBuffer(),options={items:[image],outputDir,now,logger,fetcher:async()=>new Response(bytes)};
  const first=await buildPreviews(options),file=path.join(outputDir,previews.filenameFor(image)),data=await fs.readFile(file);
  const before=await buildPreviews({...options,previous:first.manifest,now:new Date(now.getTime()+previews.recheckAfterMs-1),fetcher:()=>assert.fail('weekly validation is not due')});assert.equal(before.reused,1);assert.equal(before.created,0);
  const due=new Date(now.getTime()+previews.recheckAfterMs);
  const paused=await buildPreviews({...options,previous:first.manifest,now:due,maxNew:0,fetcher:()=>assert.fail('budget is zero')});assert.equal(paused.reused,1);assert.equal(paused.deferred,1);assert.deepEqual(paused.manifest.images,first.manifest.images);
  const failed=await buildPreviews({...options,previous:paused.manifest,now:due,fetcher:async()=>new Response('busy',{status:503})});assert.equal(failed.failures,1);assert.equal(failed.reused,1);assert.deepEqual(await fs.readFile(file),data);assert.ok(previews.previewFor(image,failed.manifest));assert.equal(failed.manifest.images[image.id].checkedAt,now.toISOString());
  const changed=await sharp(bytes).modulate({brightness:0.8}).jpeg().toBuffer();
  const refreshed=await buildPreviews({...options,previous:failed.manifest,now:due,fetcher:async()=>new Response(changed)});assert.equal(refreshed.created,1);assert.equal(refreshed.reused,0);assert.equal(refreshed.manifest.images[image.id].checkedAt,due.toISOString());assert.notEqual(refreshed.manifest.images[image.id].digest,first.manifest.images[image.id].digest);
  const future={...refreshed.manifest,images:{[image.id]:{...refreshed.manifest.images[image.id],checkedAt:new Date(due.getTime()+1000).toISOString()}}};
  assert.equal((await buildPreviews({...options,previous:future,now:due})).created,1);
});

test('Morevna caches and verifies the author thumbnail before encoding, while retaining native download and credits',async t=>{
  const outputDir=await directory(t),image=morevnaItem(),bytes=await sharp({create:{width:1024,height:640,channels:3,background:'#845bb2'}}).jpeg().toBuffer();
  assert.deepEqual((await copyAuthorPreview(bytes,image)).data,bytes);
  const options={items:[image],outputDir,now,logger,fetcher:async url=>{assert.equal(url,image.image);return new Response(bytes);}};
  const first=await buildPreviews(options),entry=first.manifest.images[image.id],file=path.join(outputDir,previews.filenameFor(image)),data=await fs.readFile(file);
  assert.equal(first.created,1);assert.equal(entry.width,1024);assert.equal(entry.height,640);assert.equal((await sharp(data).metadata()).format,'webp');assert.equal(entry.digest,crypto.createHash('sha256').update(data).digest('hex'));
  assert.ok(previews.previewFor(image,first.manifest));assert.equal(image.download,image.feedRecord.download);assert.equal(image.artist,'Artist');assert.equal(image.license,'CC BY 4.0');
  const cached=await buildPreviews({...options,previous:first.manifest,fetcher:()=>assert.fail('same WordPress revision is cached')});assert.equal(cached.reused,1);
  const bad=Buffer.from(data);bad[bad.length-1]^=1;await fs.writeFile(file,bad);assert.equal((await buildPreviews({...options,previous:first.manifest})).created,1);
  for(const input of [await sharp(bytes).resize(512,320).jpeg().toBuffer(),await sharp(bytes).png().toBuffer()])await assert.rejects(copyAuthorPreview(input,image),/格式或尺寸/);
  const failed=await buildPreviews({...options,previous:null,fetcher:async()=>new Response(await sharp(bytes).resize(512,320).jpeg().toBuffer())});assert.equal(failed.failures,1);assert.equal(failed.created,0);
});

test('changed revisions and removed works clean only managed Pepper and Morevna previews',async t=>{
  const outputDir=await directory(t),pepper=pepperItem('artwork'),manga=morevnaItem(),native=await sharp({create:{width:2000,height:1250,channels:3,background:'#7435aa'}}).jpeg().toBuffer(),thumbnail=await sharp(native).resize(1024,640).jpeg().toBuffer();
  const options={items:[pepper,manga],outputDir,now,logger,fetcher:async url=>new Response(url===pepper.download?native:thumbnail)};
  const first=await buildPreviews(options);assert.equal(first.created,2);
  const updated=feeds.normalizeFeed([{...manga.feedRecord,revision:'2025-10-02T00:00:00'}],'morevna')[0];assert.notEqual(previews.filenameFor(updated),previews.filenameFor(manga));assert.equal(previews.previewFor(updated,first.manifest),null);
  const second=await buildPreviews({...options,items:[pepper,updated],previous:first.manifest});assert.equal(second.created,1);assert.equal(second.reused,1);await assert.rejects(fs.readFile(path.join(outputDir,previews.filenameFor(manga))),/ENOENT/);
  for(const provider of ['pepper','morevna'])await fs.writeFile(path.join(outputDir,provider,'keep-user-file.webp'),'untouched');
  const empty=await buildPreviews({...options,items:[],previous:second.manifest});assert.deepEqual(empty.manifest.images,{});
  for(const image of [pepper,updated])await assert.rejects(fs.readFile(path.join(outputDir,previews.filenameFor(image))),/ENOENT/);
  for(const provider of ['pepper','morevna'])assert.equal(await fs.readFile(path.join(outputDir,provider,'keep-user-file.webp'),'utf8'),'untouched');
});

test('preview URLs require a licensed repository item and matching bounded metadata',async()=>{
  const image=item(await png()),entry={revision:image.feedRecord.revision,width:1280,height:640,bytes:50000};
  const manifest={version:1,images:{[image.id]:entry}};
  assert.equal(previews.previewFor(image,manifest),'./previews/folium-'+entry.revision+'-v1.webp');
  assert.equal(previews.filenameFor(image),'folium-'+entry.revision+'-v1.webp');
  for(const mutate of [record=>record.revision='b'.repeat(40),record=>record.width=0,record=>record.height=1281,record=>record.bytes=Infinity,record=>record.bytes=0,record=>record.bytes=previews.maxBytes+1]){
    const invalid={...entry};mutate(invalid);assert.equal(previews.previewFor(image,{version:1,images:{[image.id]:invalid}}),null);
  }
  for(const unknown of [null,{}, {...image,id:'forged'}, {...image,feedRecord:{...image.feedRecord,license:'All rights reserved'}}]){
    assert.equal(previews.filenameFor(unknown),null);assert.equal(previews.previewFor(unknown,manifest),null);
  }
  assert.equal(previews.previewFor(image,{...manifest,version:99}),null);assert.equal(previews.previewFor(image,null),null);
  assert.deepEqual(previews.imageCandidates(image,manifest),[previews.previewFor(image,manifest),image.image,image.fallbackImage]);
  assert.deepEqual(previews.imageCandidates({...image,fallbackImage:image.image},null),[image.image]);assert.deepEqual(previews.imageCandidates(null),[]);
  assert.equal(image.download,image.image);
});

test('author preview URLs bind the exact licensed file, revision, dimensions and digest',()=>{
  const image=authorItem(),entry={revision:image.revision,url:image.image,width:640,height:960,bytes:1000,digest:'a'.repeat(64)},manifest={version:1,images:{[image.id]:entry}};
  assert.match(previews.filenameFor(image),/^ayomi\/snowy-park\/girl-one\.png\.\d+\.webp$/);assert.equal(previews.previewFor(image,manifest),'./previews/'+previews.filenameFor(image));
  for(const changes of [{url:image.download},{revision:'2026-04-19T02:41:35.875Z'},{width:641},{height:961},{bytes:previews.authorMaxBytes+1},{digest:'../unsafe'},{digest:undefined}])assert.equal(previews.previewFor(image,{version:1,images:{[image.id]:{...entry,...changes}}}),null);
  assert.equal(previews.filenameFor({...image,id:'forged'}),null);assert.equal(previews.filenameFor({...image,feedRecord:{...image.feedRecord,license:'MIT'}}),null);
});

test('noncommercial no-derivative previews preserve every source byte without reencoding',async()=>{
  const image=authorItem(),bytes=await authorBytes(),copied=await copyAuthorPreview(bytes,image);
  assert.deepEqual(copied.data,bytes);assert.equal(copied.width,640);assert.equal(copied.height,960);assert.equal(copied.digest,crypto.createHash('sha256').update(bytes).digest('hex'));
  const original=authorItem('original',true),pngBytes=await sharp({create:{width:1024,height:1536,channels:3,background:'#3a654b'}}).png().toBuffer();
  assert.deepEqual((await copyAuthorPreview(pngBytes,original)).data,pngBytes);assert.match(previews.filenameFor(original),/\.png\.\d+\.png$/);
  for(const invalid of [null,{...image,id:'forged'}, {...image,feedRecord:{...image.feedRecord,license:'MIT'}}])await assert.rejects(copyAuthorPreview(bytes,invalid),/许可无效/);
  await assert.rejects(copyAuthorPreview(Buffer.alloc(previews.authorMaxBytes+1),image),/许可无效/);
  await assert.rejects(copyAuthorPreview(pngBytes,image),/格式或尺寸/);
  await assert.rejects(copyAuthorPreview(await sharp(bytes).resize(320,480).webp().toBuffer(),image),/格式或尺寸/);
});

test('author copies cache by byte digest and repair changed bytes without touching unrelated files',async t=>{
  const outputDir=await directory(t),image=authorItem(),bytes=await authorBytes(),options={items:[image],fetcher:async url=>{assert.equal(url,image.image);return new Response(bytes);},outputDir,now,logger,wait:async()=>{}};
  const first=await buildPreviews(options),file=path.join(outputDir,previews.filenameFor(image));assert.equal(first.created,1);assert.deepEqual(await fs.readFile(file),bytes);
  const cached=await buildPreviews({...options,previous:first.manifest,fetcher:()=>assert.fail('unchanged author bytes are cached')});assert.equal(cached.reused,1);
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;await fs.writeFile(file,changed);
  const repaired=await buildPreviews({...options,previous:first.manifest});assert.equal(repaired.created,1);assert.deepEqual(await fs.readFile(file),bytes);
  const unrelated=path.join(outputDir,'ayomi','keep-user-file.txt');await fs.writeFile(unrelated,'untouched');
  await buildPreviews({...options,items:[],previous:repaired.manifest});await assert.rejects(fs.readFile(file),/ENOENT/);assert.equal(await fs.readFile(unrelated,'utf8'),'untouched');
});

test('author copying is sequential, paced and bounded alongside generated repository previews',async t=>{
  const outputDir=await directory(t),bytes=await authorBytes(),repoBytes=await png(),authors=[authorItem('one'),authorItem('two')],repo=item(repoBytes),waits=[];
  let active=0,peak=0;
  const fetcher=async url=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return new Response(url===repo.image?repoBytes:bytes);};
  const options={items:[repo,...authors],fetcher,outputDir,now,logger,wait:async ms=>waits.push(ms),maxNew:1};
  const first=await buildPreviews(options);assert.equal(first.created,1);assert.equal(first.deferred,2);assert.equal(peak,1);
  const next=await buildPreviews({...options,previous:first.manifest,maxNew:3});assert.equal(next.created,2);assert.equal(next.reused,1);assert.equal(next.deferred,0);assert.ok(next.manifest.images[repo.id]);
  const all=await buildPreviews({...options,previous:null,maxNew:2});assert.equal(all.created,2);assert.ok(all.manifest.images[repo.id]);assert.equal(Object.keys(all.manifest.images).filter(id=>id.startsWith('ayomi-')).length,1);assert.deepEqual(waits,[]);
});

test('cold caches reserve preview capacity for each source and resume without starving the image library',async t=>{
  const outputDir=await directory(t),authorData=await authorBytes(),repoData=await Promise.all(['#658cad','#668cad','#678cad'].map(background=>sharp({create:{width:2000,height:1000,channels:3,background}}).png().toBuffer())),authors=Array.from({length:15},(_,i)=>authorItem('cold-'+i));
  const repos=['folium','librepixels','midjourney'].flatMap(provider=>Array.from({length:3},(_,i)=>item(repoData[i],provider,provider==='folium'?'Abstract/cold-'+i+'.png':provider==='librepixels'?'wallpapers/[nature]_librepixels_cold-'+i+'.png':'assets/anime_cold_'+i+'.png')));
  assert.equal(repos.filter(Boolean).length,9);
  const urls=new Map(repos.map((item,index)=>[item.image,repoData[index%3]]));let calls=0;
  const options={items:[...authors,...repos],outputDir,now,logger,maxNew:4,wait:async()=>{},fetcher:async url=>{calls++;return new Response(urls.get(url)||authorData);}};
  const first=await buildPreviews(options);assert.equal(first.created,4);assert.equal(calls,4);assert.equal(first.deferred,authors.length+repos.length-4);
  for(const provider of ['ayomi','folium','librepixels','midjourney'])assert.equal(options.items.filter(item=>item.provider===provider&&first.manifest.images[item.id]).length,1);
  const next=await buildPreviews({...options,previous:first.manifest});assert.equal(next.created,4);assert.equal(next.reused,4);
  for(const provider of ['ayomi','folium','librepixels','midjourney'])assert.equal(options.items.filter(item=>item.provider===provider&&next.manifest.images[item.id]).length,2);
  const isolated=await buildPreviews({...options,items:authors,previous:null,maxNew:8});assert.equal(isolated.created,8);assert.equal(isolated.deferred,7);
  const small=await buildPreviews({...options,items:[...authors,repos[0]],previous:null,maxNew:8});assert.equal(small.created,8);assert.ok(small.manifest.images[repos[0].id]);
});

test('damaged WebP pixels are rebuilt even when the cached header and byte count match',async t=>{
  const outputDir=await directory(t),bytes=await png(),image=item(bytes);let requested=0;
  const options={items:[image],outputDir,now,logger,fetcher:async()=>{requested++;return new Response(bytes);}};
  const first=await buildPreviews(options),file=path.join(outputDir,previews.filenameFor(image)),saved=await fs.readFile(file),damaged=Buffer.from(saved);damaged.fill(0,40);
  assert.equal(damaged.length,saved.length);const metadata=await sharp(damaged).metadata();assert.equal(metadata.width,first.manifest.images[image.id].width);assert.equal(metadata.height,first.manifest.images[image.id].height);
  await assert.rejects(sharp(damaged,{failOn:'warning'}).stats());await fs.writeFile(file,damaged);
  const repaired=await buildPreviews({...options,previous:first.manifest});assert.equal(repaired.created,1);assert.equal(repaired.reused,0);assert.equal(repaired.failures,0);assert.equal(requested,2);assert.deepEqual(await fs.readFile(file),saved);
});

test('an empty or lost cache restores more than the daily budget, then returns to incremental work',async t=>{
  const outputDir=await directory(t),bytes=await authorBytes(),repoBytes=await png();
  const authors=Array.from({length:125},(_,index)=>authorItem('bootstrap-'+index)),repo=item(repoBytes),waits=[];
  const options={items:[repo,...authors],outputDir,now,logger,bootstrap:true,wait:async ms=>waits.push(ms),fetcher:async url=>new Response(url===repo.image?repoBytes:bytes)};
  const first=await buildPreviews(options);assert.equal(first.created,126);assert.equal(first.failures,0);assert.equal(first.deferred,0);assert.equal(waits.length,124);assert.ok(waits.every(ms=>ms===1500));
  await fs.rm(outputDir,{recursive:true});
  const lost=await buildPreviews({...options,previous:first.manifest});assert.equal(lost.created,126);assert.equal(lost.reused,0);assert.equal(lost.deferred,0);
  const added=Array.from({length:125},(_,index)=>authorItem('new-'+index));
  const daily=await buildPreviews({...options,previous:lost.manifest,items:[...options.items,...added]});assert.equal(daily.created,120);assert.equal(daily.reused,126);assert.equal(daily.deferred,5);
  const paused=await buildPreviews({...options,previous:null,maxNew:0,fetcher:()=>assert.fail('zero budget cannot fetch')});assert.equal(paused.created,0);assert.equal(paused.deferred,126);
});

test('initial restoration honors author cooldowns and keeps other sources usable',async t=>{
  const outputDir=await directory(t),bytes=await png(),repo=item(bytes),author=authorItem();let requested=0;
  const result=await buildPreviews({items:[author,repo],outputDir,now,logger,bootstrap:true,sourceRetryAt:'2026-10-02T04:00:00Z',fetcher:async url=>{requested++;assert.equal(url,repo.image);return new Response(bytes);}});
  assert.equal(result.created,1);assert.equal(requested,1);assert.equal(result.deferred,1);assert.equal(result.manifest.authorRetryAt,'2026-10-02T04:00:00.000Z');
});

test('copying stops on HTTP 429 and persists the cooldown while other sources still build',async t=>{
  const outputDir=await directory(t),bytes=await authorBytes(),repoBytes=await png(),authors=[authorItem('one'),authorItem('two'),authorItem('three')],repo=item(repoBytes),calls=[],waits=[];
  let count=0;
  const options={items:[repo,...authors],outputDir,now,logger,wait:async ms=>waits.push(ms),fetcher:async url=>{calls.push(url);if(url===repo.image)return new Response(repoBytes);if(++count===2)return new Response('rate limited',{status:429,headers:{'retry-after':'120'}});return new Response(bytes);}};
  const first=await buildPreviews(options);assert.equal(first.created,2);assert.equal(first.failures,1);assert.equal(first.deferred,1);assert.equal(count,2);assert.equal(first.manifest.authorRetryAt,'2026-10-02T00:02:00.000Z');assert.deepEqual(waits,[1500]);
  const paused=await buildPreviews({...options,previous:first.manifest,fetcher:()=>assert.fail('cooldown cannot request source images')});assert.equal(paused.reused,2);assert.equal(paused.deferred,2);assert.equal(paused.manifest.authorRetryAt,first.manifest.authorRetryAt);
  const resumed=await buildPreviews({...options,previous:paused.manifest,now:new Date(first.manifest.authorRetryAt),fetcher:async()=>new Response(bytes)});assert.equal(resumed.created,2);assert.equal(resumed.failures,0);assert.equal(resumed.manifest.authorRetryAt,undefined);assert.equal(resumed.deferred,0);
});

test('a directory cooldown also pauses uncached author images while repository files can build',async t=>{
  const outputDir=await directory(t),bytes=await png(),repo=item(bytes),author=authorItem();let requested=0;
  const result=await buildPreviews({items:[author,repo],outputDir,now,logger,sourceRetryAt:'2026-10-02T04:00:00Z',previous:{authorRetryAt:'2026-10-02T02:00:00Z'},fetcher:async url=>{requested++;assert.equal(url,repo.image);return new Response(bytes);}});
  assert.equal(result.created,1);assert.equal(requested,1);assert.equal(result.deferred,1);assert.equal(result.manifest.authorRetryAt,'2026-10-02T04:00:00.000Z');
});

test('downloads are bounded, errors cancel streams, and a hanging body is aborted',async()=>{
  const bytes=Buffer.from('image bytes');
  assert.deepEqual(await readImage(async()=>new Response(bytes),'https://example.test'),bytes);
  await assert.rejects(readImage(async()=>new Response(bytes,{status:429}),'https://example.test'),/HTTP 429/);
  await assert.rejects(readImage(async()=>new Response(bytes,{headers:{'content-length':'1000'}}),'https://example.test',{maxBytes:10}),/大小限制/);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(bytes);},cancel(){cancelled=true;}});
  await assert.rejects(readImage(async()=>new Response(stream),'https://example.test',{maxBytes:2}),/大小限制/);assert.equal(cancelled,true);
  await assert.rejects(readImage(async()=>new Response(new Uint8Array()),'https://example.test'),/内容为空/);
  let signal;
  await assert.rejects(readImage(async(url,options)=>{signal=options.signal;return new Response(new ReadableStream({start(){}}));},'https://example.test',{timeout:5}),/超时/);
  assert.equal(signal.aborted,true);
});

test('real encoding preserves landscape, portrait and transparent compositions without cropping or enlargement',async()=>{
  for(const [width,height] of [[2000,1000],[1000,2000],[300,150]]){
    const input=await sharp({create:{width,height,channels:4,background:{r:20,g:80,b:160,alpha:0.5}}}).png().toBuffer();
    const encoded=await encodePreview(input),metadata=await sharp(encoded.data).metadata();
    assert.equal(metadata.format,'webp');assert.equal(metadata.hasAlpha,true);assert.equal(encoded.width/encoded.height,width/height);
    assert.equal(Math.max(encoded.width,encoded.height),Math.min(1280,Math.max(width,height)));assert.ok(encoded.data.length<input.length);
  }
  const pixels=Buffer.alloc(2000*1000*3);
  for(let x=0;x<2000;x++)for(let y=0;y<1000;y++){const offset=(y*2000+x)*3;pixels[offset]=x<1000?255:0;pixels[offset+2]=x>=1000?255:0;}
  const framed=await encodePreview(await sharp(pixels,{raw:{width:2000,height:1000,channels:3}}).png().toBuffer());
  const left=await sharp(framed.data).extract({left:0,top:0,width:1,height:1}).raw().toBuffer(),right=await sharp(framed.data).extract({left:framed.width-1,top:framed.height-1,width:1,height:1}).raw().toBuffer();
  assert.ok(left[0]>200&&left[2]<30);assert.ok(right[2]>200&&right[0]<30);
  await assert.rejects(encodePreview(Buffer.from('not an image')));
  await assert.rejects(encodePreview(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000"/>')),/格式不支持/);
});

test('only approved files are fetched; successful previews are atomic and reused without network',async t=>{
  const outputDir=await directory(t),bytes=await png(),image=item(bytes);let requested=0;
  const fetcher=async(url)=>{requested++;assert.equal(url,image.image);return new Response(bytes);};
  const result=await buildPreviews({items:[image,image,null,{...image,id:'forged'}, {...image,feedRecord:{...image.feedRecord,license:'MIT'}}],fetcher,outputDir,now,logger});
  assert.equal(result.created,1);assert.equal(result.failures,0);assert.equal(requested,1);assert.equal(Object.keys(result.manifest.images).length,1);
  const files=await fs.readdir(outputDir);assert.deepEqual(files,[previews.filenameFor(image)]);
  const metadata=await sharp(await fs.readFile(path.join(outputDir,files[0]))).metadata();assert.equal(metadata.width,1280);assert.equal(metadata.height,640);
  const cached=await buildPreviews({items:[image],previous:result.manifest,fetcher:()=>{throw Error('must not fetch');},outputDir,now,logger});
  assert.equal(cached.reused,1);assert.equal(cached.created,0);assert.deepEqual(cached.manifest.images,result.manifest.images);
});

test('wrong revisions and transient failures use the alternate CDN or leave the original usable',async t=>{
  const outputDir=await directory(t),bytes=await png(),image=item(bytes),calls=[];
  const result=await buildPreviews({items:[image],outputDir,now,logger,fetcher:async url=>{calls.push(url);return new Response(url===image.image?Buffer.from('stale image'):bytes);}});
  assert.deepEqual(calls,[image.image,image.fallbackImage]);assert.equal(result.created,1);
  const unavailable=await buildPreviews({items:[image],outputDir,now,logger,fetcher:async()=>new Response('unavailable',{status:503})});
  assert.equal(unavailable.failures,1);assert.equal(previews.previewFor(image,unavailable.manifest),null);assert.equal(previews.imageCandidates(image,unavailable.manifest)[0],image.image);
  const mismatched=await buildPreviews({items:[image],outputDir,now,logger,fetcher:async()=>new Response(Buffer.from('stale image'))});
  assert.equal(mismatched.failures,1);assert.deepEqual(await fs.readdir(outputDir),[]);
});

test('missing or corrupt cache files are rebuilt, and stale managed files are removed',async t=>{
  const outputDir=await directory(t),bytes=await png(),image=item(bytes),options={items:[image],outputDir,now,logger,fetcher:async()=>new Response(bytes)};
  const first=await buildPreviews(options);
  await fs.writeFile(path.join(outputDir,previews.filenameFor(image)),Buffer.from('corrupt'));
  const repaired=await buildPreviews({...options,previous:first.manifest});assert.equal(repaired.created,1);assert.equal(repaired.reused,0);
  await fs.unlink(path.join(outputDir,previews.filenameFor(image)));
  assert.equal((await buildPreviews({...options,previous:first.manifest})).created,1);
  await fs.writeFile(path.join(outputDir,'keep-user-file.txt'),'untouched');
  const empty=await buildPreviews({...options,items:[],previous:first.manifest});assert.deepEqual(empty.manifest.images,{});assert.deepEqual(await fs.readdir(outputDir),['keep-user-file.txt']);
});

test('a bounded run resumes automatically from cached previews and rejects invalid budgets',async t=>{
  const outputDir=await directory(t),bytes=await png();
  const other=await sharp({create:{width:2000,height:1000,channels:3,background:'#ffdd77'}}).png().toBuffer();
  const images=[item(bytes),item(other,'folium','Abstract/other.png')],fetcher=async url=>new Response(url===images[0].image?bytes:other);
  const options={items:images,fetcher,outputDir,now,logger,maxNew:1};
  const first=await buildPreviews(options);assert.equal(first.created,1);assert.equal(first.deferred,1);
  const second=await buildPreviews({...options,previous:first.manifest});assert.equal(second.created,1);assert.equal(second.reused,1);assert.equal(second.deferred,0);
  for(const maxNew of [-1,1001,0.5])await assert.rejects(buildPreviews({...options,maxNew}),/预算无效/);
  const paused=await buildPreviews({...options,maxNew:0,previous:second.manifest});assert.equal(paused.reused,2);assert.equal(paused.created,0);
  assert.equal((await buildPreviews({...options,items:null,maxNew:0})).created,0);
});

test('Agundur previews retain the individual share-alike license and clean only managed files',async t=>{
  const outputDir=await directory(t),bytes=await sharp({create:{width:3840,height:2160,channels:3,background:'#6047ad'}}).png().toBuffer();
  const [image]=repositories.normalizeRepository([{path:'cyborg-tiger-kde-plasma-4k.png',title:'Cyborg Tiger',description:'A cybernetic tiger in a neon cyberpunk city.',revision:revision(bytes),width:3840,height:2160,license:'CC BY-SA 4.0',licenseUrl:repositories.sources.agundur.licenses['CC BY-SA 4.0']}],'agundur');
  const first=await buildPreviews({items:[image],outputDir,fetcher:async url=>{assert.equal(url,image.download);return new Response(bytes);},logger,now});
  assert.equal(first.created,1);assert.equal(first.manifest.images[image.id].width,1280);assert.equal(first.manifest.images[image.id].height,720);assert.equal(image.license,'CC BY-SA 4.0');
  const filename=previews.filenameFor(image);assert.match(filename,/^agundur-[a-f0-9]{40}-v1\.webp$/);assert.equal(previews.previewFor(image,first.manifest),'./previews/'+filename);
  const keep=path.join(outputDir,'agundur-personal.webp');await fs.writeFile(keep,'keep');
  const cached=await buildPreviews({items:[image],previous:first.manifest,outputDir,fetcher:()=>assert.fail('cached preview should not fetch'),logger,now});assert.equal(cached.reused,1);
  await buildPreviews({items:[],previous:cached.manifest,outputDir,logger,now});await assert.rejects(fs.readFile(path.join(outputDir,filename)),/ENOENT/);assert.equal(await fs.readFile(keep,'utf8'),'keep');
});
