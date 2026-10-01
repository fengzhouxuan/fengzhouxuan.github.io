const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const sharp=require('sharp');
const repositories=require('../source/wallpapers/repositories.js');
const ayomi=require('../source/wallpapers/ayomi.js');
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
  const all=await buildPreviews({...options,previous:null,maxNew:2});assert.equal(all.created,2);assert.deepEqual(waits,[1500]);
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
