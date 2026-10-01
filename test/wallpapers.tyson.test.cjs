const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const tyson=require('../source/wallpapers/tyson.js');
const feeds=require('../source/wallpapers/feeds.js');
const previews=require('../source/wallpapers/previews.js');
const {articleLicensed,primaryWork,collectTyson}=require('../scripts/collect-tyson.cjs');
const {refreshCatalog}=require('../scripts/refresh-wallpaper-feeds.cjs');
const {buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const logger={log(){},warn(){}},modified='Fri, 21 Aug 2026 09:42:20 GMT',now=new Date('2026-10-02T00:00:00Z');
const terms=new Map([['gallery-electric',52],['gallery-spirits',51],['gallery-mascots',53]]);
const declaration='<footer><p>Copyright © Tyson Tan (钛山)</p><p>Content on this website (including external copies) is dual-licensed under the <a href="https://license.coscl.org.cn/MulanOWLBYSAv1">MulanOWL BY-SA</a> and the <a href="'+tyson.source.licenseUrl+'">Creative Commons License Attribution-ShareAlike (CC BY-SA)</a>, unless stated otherwise.</p></footer>';
function post(id=1){return {id,status:'publish',type:'post',author:3,categories:[53],modified_gmt:'2026-04-30T03:07:45',link:tyson.origin+'/gallery/gallery-mascots/kiki-'+id+'/',title:{rendered:'Kiki &amp; Waves'},content:{protected:false,rendered:'<figure class="wp-block-image"><img class="wp-image-'+(id+100)+'" src="'+tyson.origin+'/wp-content/uploads/kiki-'+id+'-1024x512.jpg"><figcaption>Kiki &amp; Waves | <a href="'+tyson.origin+'/wp-content/uploads/kiki-'+id+'_full.png">Download Fullsize</a>, <a href="'+tyson.origin+'/wp-content/uploads/kiki-'+id+'.zip">Source file</a></figcaption></figure>'}};}
function page(p,license=declaration){return '<link rel="canonical" href="'+p.link+'">'+p.content.rendered+license;}
function record(p=post()){
  const raw=primaryWork(p,terms,3),revision=crypto.createHash('sha256').update(JSON.stringify([raw.download,raw.image,raw.postModified,modified,modified])).digest('hex');
  return {...raw,width:4000,height:2000,imageWidth:1024,imageHeight:512,modified,previewModified:modified,revision};
}
function fetcherFor(posts,{changed,license,respond,offline,headStatus=200}={}){
  return async(url,options)=>{
    assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);
    if(url.includes('/categories?'))return {ok:true,json:async()=>[...terms].map(([slug,id])=>({id,slug,taxonomy:'category'}))};
    if(url.includes('/users?'))return {ok:true,json:async()=>[{id:3,name:tyson.artist,link:tyson.origin+'/author/tysontan/'}]};
    if(url.includes('/posts?')){const page=Number(new URL(url).searchParams.get('page')),response={ok:true,status:200,json:async()=>posts.slice((page-1)*100,page*100),headers:new Headers({'x-wp-totalpages':String(Math.ceil(posts.length/100)),'x-wp-total':String(posts.length)})};return respond?respond(response,page):response;}
    if(options.method==='HEAD')return {ok:headStatus===200,status:headStatus,headers:new Headers({'last-modified':changed||modified,'content-type':url.endsWith('.png')?'image/png':'image/jpeg'})};
    const p=posts.find(p=>p.link===url);if(p===offline)throw Error('offline');assert.ok(p);return {ok:true,status:200,text:async()=>page(p,license)};
  };
}
const dimensions=async(fetcher,url)=>url.endsWith('.png')?{width:4000,height:2000}:{width:1024,height:512};
const options={logger,dimensions,intervalMs:0};

test('Tyson needs the artist-specific website-wide image grant and its exact license URL',()=>{
  assert.equal(articleLicensed(declaration),true);
  for(const html of [null,'<footer>CC BY-SA 4.0</footer>',declaration.replace('Tyson Tan','Other'),declaration.replace('/by-sa/4.0/','/by/4.0/'),declaration.replace('Content on this website','Website theme'),declaration.replace(', unless stated otherwise.',''),declaration.replaceAll('footer','main')])assert.equal(articleLicensed(html),false);
});

test('Tyson primary art binds the first figure, fullsize file, artist and original project instead of later examples',()=>{
  const raw=primaryWork(post(),terms,3);assert.equal(raw.title,'Kiki & Waves');assert.equal(raw.mediaID,101);assert.equal(raw.download,tyson.origin+'/wp-content/uploads/kiki-1_full.png');
  const later=post();later.content.rendered='<figure class="wp-block-image"><img src="https://example.com/logo.jpg"></figure>'+later.content.rendered;assert.equal(primaryWork(later,terms,3),null);
  for(const change of [p=>p.status='draft',p=>p.type='page',p=>p.author=4,p=>p.categories=[50],p=>p.categories='53',p=>p.content.protected=true,p=>p.id=0,p=>p.link=p.link.replace('gallery-mascots','gallery-others'),p=>p.title.rendered='Milla fan art',p=>p.content.rendered='',p=>p.content.rendered=p.content.rendered.replace('wp-image-101','wp-image-x'),p=>p.content.rendered=p.content.rendered.replace('Kiki &amp; Waves |','Draft |'),p=>p.content.rendered=p.content.rendered.replace('kiki-1_full.png','kiki-1.zip'),p=>p.content.rendered+='<p>License: MIT</p>',p=>p.content.rendered+='<p>Creative Commons Zero (Public Domain) license</p>',p=>p.modified_gmt='today']){const p=post();change(p);assert.equal(primaryWork(p,terms,3),null);}
  assert.equal(primaryWork(null,terms,3),null);assert.equal(primaryWork(post(),null,3),null);assert.equal(primaryWork(post(),terms,null),null);
});

test('Tyson normalized metadata preserves original size, share-alike credits, projects and filter categories',()=>{
  const raw=record(),[item]=tyson.normalizeRecords([raw,raw,null]);assert.equal(item.artist,tyson.artist);assert.equal(item.width,4000);assert.equal(item.license,'CC BY-SA 4.0');assert.match(item.copyrightNotice,/Tyson Tan.*WebP/);assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'tyson'),[item]);
  assert.deepEqual(tyson.categoriesFor('gallery-electric','Traveler under the Aurora in the City'),['anime','illustration','space','city']);assert.deepEqual(tyson.categoriesFor('gallery-spirits','Forest Hill'),['anime','illustration','fantasy','nature']);assert.deepEqual(tyson.normalizeRecords(null),[]);
  const portrait={...raw,width:2000,height:4000,imageWidth:512,imageHeight:1024};assert.ok(tyson.normalizeRecords([portrait])[0].tags.includes('竖屏'));
  for(const change of [r=>r.workID=0,r=>r.mediaID='2',r=>r.project='gallery-others',r=>r.artist='Other',r=>r.license='CC0',r=>r.licenseUrl=tyson.origin,r=>r.title='',r=>r.title='a'.repeat(151),r=>r.title='Sketch',r=>r.pageUrl=r.pageUrl.replace('gallery-mascots','gallery-electric'),r=>r.licenseSource=tyson.origin,r=>r.download='https://example.com/art.png',r=>r.width=1599,r=>r.height=799,r=>r.width=30001,r=>r.imageWidth=4001,r=>r.imageHeight=0,r=>r.imageHeight=1024,r=>r.revision='bad',r=>r.postModified='bad',r=>r.modified=null,r=>r.previewModified='bad']){const bad={...raw};change(bad);assert.deepEqual(tyson.normalizeRecords([bad]),[]);}
  for(const url of [null,'../art.png','http://tysontan.com/wp-content/uploads/image.png',tyson.origin+':444/wp-content/uploads/image.png',tyson.origin+'/wp-content/uploads/a.svg',tyson.origin+'/wp-content/uploads/2026/13/a.jpg',raw.image+'?x=1',raw.image+'#x'])assert.equal(tyson.imageURL(url),null);
  assert.equal(tyson.imageURL(tyson.origin+'/wp-content/uploads/2026/02/original.jpg'),tyson.origin+'/wp-content/uploads/2026/02/original.jpg');
});

test('Tyson fully reads its original project catalog before measuring pictures and pacing requests',async()=>{
  const posts=Array.from({length:101},(_,i)=>post(i+1));let waits=0,calls=0;
  const records=await collectTyson({...options,intervalMs:500,wait:async ms=>{assert.equal(ms,500);waits++;},fetcher:async(...args)=>{calls++;return fetcherFor(posts)(...args);}});assert.equal(records.length,101);assert.equal(waits,calls-1);
  for(const respond of [r=>({...r,headers:new Headers()}),r=>({...r,json:async()=>({})}),r=>({...r,headers:new Headers({'x-wp-totalpages':'11','x-wp-total':'1001'})}),r=>({...r,headers:new Headers({'x-wp-totalpages':'1','x-wp-total':'101'})}),(r,page)=>page===2?{...r,json:async()=>[]}:r,(r,page)=>page===2?{...r,json:async()=>[posts[0]]}:r,(r,page)=>page===2?{...r,headers:new Headers({'x-wp-totalpages':'2','x-wp-total':'102'})}:r])await assert.rejects(collectTyson({...options,fetcher:fetcherFor(posts,{respond}),dimensions:()=>assert.fail('cannot measure incomplete catalog')}));
  await assert.rejects(collectTyson({...options,intervalMs:-1}),/配置/);await assert.rejects(collectTyson({}),/配置/);
});

test('Tyson reuses unchanged verified dimensions and rereads changed revisions',async()=>{
  const p=post(),old=tyson.normalizeRecords([record(p)]);let measured=0;
  assert.equal((await collectTyson({...options,old,fetcher:fetcherFor([p]),dimensions:()=>assert.fail('unchanged dimensions')}))[0].width,4000);
  const changed=await collectTyson({...options,old,fetcher:fetcherFor([p],{changed:'Sat, 22 Aug 2026 09:42:20 GMT'}),dimensions:async(...args)=>{measured++;return dimensions(...args);}});assert.equal(measured,2);assert.notEqual(changed[0].revision,old[0].revision);
  const failed=await collectTyson({...options,old,fetcher:fetcherFor([p],{changed:'Sat, 22 Aug 2026 09:42:20 GMT'}),dimensions:async()=>{throw Error('offline');}});assert.deepEqual(failed,[old[0].feedRecord]);
});

test('Tyson preserves temporary failures but removes departed or no longer licensed work',async()=>{
  const p=post(),old=tyson.normalizeRecords([record(p)]);
  assert.deepEqual(await collectTyson({...options,old,fetcher:fetcherFor([p],{offline:p})}),[old[0].feedRecord]);
  assert.deepEqual(await collectTyson({...options,old,fetcher:fetcherFor([p],{license:declaration.replace('/by-sa/4.0/','/by-nc/4.0/')})}),[]);
  assert.deepEqual(await collectTyson({...options,old,fetcher:fetcherFor([])}),[]);
  const unavailable=await collectTyson({...options,old:null,fetcher:fetcherFor([p],{offline:p})});assert.deepEqual(unavailable,[]);
  for(const url of ['categories','users'])await assert.rejects(collectTyson({...options,fetcher:async(target,args)=>target.includes('/'+url+'?')?{ok:true,json:async()=>[]}:fetcherFor([p])(target,args)}));
  const previous={version:1,updatedAt:{tyson:'previous'},records:{tyson:[old[0].feedRecord]}};
  const outage=await refreshCatalog({previous,now,logger,providerIds:['tyson'],fetcher:async()=>{throw Error('offline');}});assert.equal(outage.failures,1);assert.equal(outage.catalog.updatedAt.tyson,'previous');assert.deepEqual(outage.catalog.records.tyson,previous.records.tyson);
});

test('Tyson rejects mismatched public work pages and stops the source on rate-limited headers or dimension reads',async()=>{
  const p=post(),old=tyson.normalizeRecords([record(p)]);
  for(const mutate of [html=>html.replace('rel="canonical"','rel="alternate"'),html=>html.replaceAll('kiki-1_full.png','other.png')])assert.deepEqual(await collectTyson({...options,old,fetcher:async(url,args)=>url===p.link?{ok:true,text:async()=>mutate(page(p))}:fetcherFor([p])(url,args)}),[old[0].feedRecord]);
  assert.deepEqual(await collectTyson({...options,old,fetcher:async(url,args)=>args.method==='HEAD'?{ok:true,headers:new Headers()}:fetcherFor([p])(url,args)}),[old[0].feedRecord]);
  for(const status of [429,503]){let calls=0;await assert.rejects(collectTyson({...options,old,fetcher:async(...args)=>{calls++;return fetcherFor([p,post(2)],{headStatus:status})(...args);}}),/冷却/);assert.equal(calls,5);}
  await assert.rejects(collectTyson({...options,fetcher:async(url,args)=>args.headers.Range?{ok:false,status:429}:fetcherFor([p])(url,args),dimensions:async(fetcher,url)=>fetcher(url,{headers:{Range:'bytes=0-262143'}})}),/冷却/);
});

test('refreshing one source preserves other verified catalogs, timestamps and continuation without requesting them',async()=>{
  const seed=require('../source/wallpapers/data/official-feeds.json'),old=record(),previous={...seed,records:{...seed.records,tyson:[old]},updatedAt:{...seed.updatedAt,tyson:'previous'},continuation:{...seed.continuation,ayomi:{queue:['saved-directory']},opengameart:{retryAt:'2026-10-03T00:00:00Z'}}};
  const result=await refreshCatalog({previous,providerIds:['tyson'],now,logger,fetcher:async()=>{throw Error('offline');}});
  assert.equal(result.failures,1);assert.deepEqual(result.catalog.records,previous.records);assert.deepEqual(result.catalog.updatedAt,previous.updatedAt);assert.deepEqual(result.catalog.continuation,previous.continuation);
  const obsolete={...previous,records:{...previous.records,tyson:[old],pepper:[{unlicensed:true}]}};
  const validated=await refreshCatalog({previous:obsolete,providerIds:['tyson'],now,logger,fetcher:async()=>{throw Error('offline');}});assert.deepEqual(validated.catalog.records.pepper,[]);
});

test('Tyson caches genuine proportional WebP previews, checks digests and stops preview requests on limits',async t=>{
  const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-tyson-'));t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
  const bytes=await sharp({create:{width:1024,height:512,channels:3,background:'#448bda'}}).jpeg().toBuffer(),[item]=tyson.normalizeRecords([record()]);
  const first=await buildPreviews({items:[item],outputDir,now,logger,fetcher:async()=>new Response(bytes)});assert.equal(first.created,1);const entry=first.manifest.images[item.id],filename=previews.filenameFor(item),encoded=await fs.readFile(path.join(outputDir,filename));assert.equal((await sharp(encoded).metadata()).format,'webp');assert.equal(entry.digest,crypto.createHash('sha256').update(encoded).digest('hex'));assert.equal(previews.previewFor(item,first.manifest),'./previews/'+filename);
  assert.equal(previews.filenameFor({...item,feedRecord:{...item.feedRecord,license:'CC0'}}),null);
  const reused=await buildPreviews({items:[item],previous:first.manifest,outputDir,now,logger,fetcher:()=>assert.fail('cached preview')});assert.equal(reused.reused,1);
  const changed=Buffer.from(encoded);changed[changed.length-1]^=1;await fs.writeFile(path.join(outputDir,filename),changed);const repaired=await buildPreviews({items:[item],previous:first.manifest,outputDir,now,logger,fetcher:async()=>new Response(bytes)});assert.equal(repaired.created,1);
  await fs.writeFile(path.join(outputDir,'tyson-personal.jpg'),'keep');const items=tyson.normalizeRecords(Array.from({length:20},(_,i)=>record(post(i+1))));let fetched=0;
  const limited=await buildPreviews({items,outputDir,now,logger,fetcher:async()=>{fetched++;return new Response('',{status:429});}});assert.ok(fetched<=3);assert.equal(limited.deferred,items.length-fetched);assert.equal(limited.created,0);assert.equal(await fs.readFile(path.join(outputDir,'tyson-personal.jpg'),'utf8'),'keep');await assert.rejects(fs.readFile(path.join(outputDir,filename)),/ENOENT/);
});
