const {test}=require('node:test');
const assert=require('node:assert/strict');
const ayomi=require('../source/wallpapers/ayomi.js');
const feeds=require('../source/wallpapers/feeds.js');
const core=require('../source/wallpapers/core.js');
const {collectAyomi:syncAyomi}=require('../scripts/collect-ayomi.cjs');
const {refreshCatalog:syncCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs');
const collectAyomi=async options=>(await syncAyomi({intervalMs:0,...options})).records;
const {retryTime,cooldownUntil}=require('../scripts/wallpaper-request-policy.cjs');
const refreshCatalog=options=>syncCatalog({...options,ayomiOptions:{intervalMs:0}});
const origin='https://oc.nekosia.cat',creator=origin+'/#creator',logger={log(){},warn(){}};
const folder=origin+'/gallery/snowy-park',copyrightNotice='© 2025-2026 Nekosia API. Default license: CC BY-NC-ND 4.0. Additional licenses available.';
const author={name:'AyomiCat','@id':creator,url:origin+'/'};

function image(id='one',parent=folder){
  const url=origin+'/images/gallery/'+parent.slice((origin+'/gallery/').length)+'/girl-'+id+'.png';
  return {'@type':'ImageObject','@id':url,url,contentUrl:url,name:'Catgirl at the Snowy Park',description:'Original character with a winter coat',caption:'Girl with cat ears under falling snow',keywords:'catgirl, winter',encodingFormat:'image/png',creditText:'AyomiCat',creator:{'@id':creator},license:ayomi.source.licenseUrl.slice(0,-1),copyrightNotice,dateModified:'2026-04-18T02:41:35.875Z'};
}
function page(url,{images=[],children=[],total,number=1,pages,schemaMutate=()=>{},statsMutate=x=>x,articlesMutate=x=>x,footerLicense=ayomi.source.licenseUrl.slice(0,-1),thumbs=true}={}){
  const root=new URL(url).pathname==='/gallery',count=root?children.length:images.length;
  total??=root?count+images.length:count;pages??=Math.max(1,Math.ceil(total/20));
  const schema={'@type':'ImageGallery',author:{...author},...(root?{mainEntity:{'@type':'ItemList',numberOfItems:count,itemListElement:children.map(url=>({item:{'@type':'CollectionPage',url}}))}}:{numberOfItems:count,image:images})};schemaMutate(schema);
  const stats=statsMutate('Total: '+total+' '+(root?'items':'artworks')+' Showing: '+(total?(number-1)*20+1:0)+'-'+Math.min(total,number*20)+' Page: '+number+' of '+pages);
  let articles=children.map(url=>'<article class="category-item"><a href="'+url+'">Category</a></article>').join('');
  articles+=images.map(item=>'<article class="gallery-item" data-image="'+item.url+'"><img src="'+(thumbs?item.url.replace('/images/gallery/','/images/thumbs/')+'.webp':item.url)+'"></article>').join('');
  return '<script type="application/ld+json">'+JSON.stringify(schema)+'</script><div id="gallery-stats"><span>'+stats+'</span></div>'+articlesMutate(articles)+'<footer><p>All artworks are licensed under <a href="'+footerLicense+'">CC BY-NC-ND 4.0</a>.</p></footer>';
}
const leaf=options=>page(folder,{images:[image()],...options});
const record=()=>({...ayomi.parseGallery(leaf(),folder+'?page=1').records[0],width:1024,height:1536,imageWidth:640,imageHeight:960});
const old=records=>ayomi.normalizeRecords(records);
const dimensions=async(_,url)=>url.includes('/thumbs/')?{width:640,height:960}:{width:1024,height:1536};
function fetchPages(map){
  return async(url,options)=>{
    assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);
    const body=map.get(url);if(body instanceof Error)throw body;if(body===undefined)return {ok:false,status:404};
    return {ok:true,text:async()=>body};
  };
}
function catalogPages(images=[image()]){
  return new Map([[ayomi.source.gallery+'?page=1',page(ayomi.source.gallery,{children:[folder]})],[folder+'?page=1',page(folder,{images})]]);
}

test('gallery URLs remain inside the author site with bounded valid page numbers',()=>{
  assert.equal(ayomi.galleryURL('/gallery/snowy-park?page=2'),folder+'?page=2');
  for(const url of [null,'https://evil.example/gallery',origin+':444/gallery',origin.replace('https:','http:')+'/gallery',folder+'#image',folder+'?token=x',folder+'?page=0',folder+'?page=51',folder+'?page=1&page=2',origin+'/images/gallery/x.png',folder+'/../invalid.file'])assert.equal(ayomi.galleryURL(url),null);
});

test('author schema, visible artwork, default sharing license and per-image credit remain bound',()=>{
  const parsed=ayomi.parseGallery(leaf(),folder),[raw]=parsed.records;
  assert.equal(parsed.total,1);assert.equal(raw.artist,'AyomiCat');assert.equal(raw.license,'CC BY-NC-ND 4.0');assert.equal(raw.copyrightNotice,copyrightNotice);
  assert.equal(raw.download,image().contentUrl);assert.match(raw.image,/\/images\/thumbs\/snowy-park\/girl-one\.png\.webp$/);
  assert.equal(ayomi.parseGallery(leaf({thumbs:false}),folder).records[0].image,raw.download);
  for(const mutate of [r=>r.license='https://creativecommons.org/licenses/by/4.0/',r=>r.license=null,r=>r.creditText='Someone else',r=>r.creator['@id']='https://evil.example/artist',r=>r.contentUrl='https://evil.example/image.png',r=>r['@id']='other',r=>r.encodingFormat='image/svg+xml',r=>r.encodingFormat='image/jpeg',r=>r.name='',r=>r.copyrightNotice='',r=>r.dateModified='today',r=>r.description='Swimsuit collection',r=>r.description='x'.repeat(510)+' nude',r=>r.url=r.contentUrl=r['@id']=origin+'/images/gallery/another/girl-one.png']){
    const raw=image();mutate(raw);assert.deepEqual(ayomi.parseGallery(page(folder,{images:[raw]}),folder).records,[]);
  }
  assert.equal(ayomi.parseGallery(page(folder,{images:[image(),image()]}),folder).records.length,1);
  const mixed=ayomi.parseGallery(page(ayomi.source.gallery,{children:[folder],images:[image('unbound-root')]}),ayomi.source.gallery);assert.equal(mixed.total,2);assert.equal(mixed.children.length,1);assert.deepEqual(mixed.records,[]);
  const unbound=ayomi.parseGallery(page(ayomi.source.gallery,{images:[image('unbound-root')],schemaMutate:s=>delete s.mainEntity}),ayomi.source.gallery);assert.equal(unbound.total,1);assert.deepEqual(unbound.records,[]);
});

test('malformed author, license, pagination or child bindings fail before images are accepted',()=>{
  assert.throws(()=>ayomi.parseGallery(leaf(),'https://evil.example/gallery'));
  assert.throws(()=>ayomi.parseGallery('',folder));
  const cases=[{schemaMutate:s=>s.author.name='Other'},{schemaMutate:s=>s.author['@id']='other'},{schemaMutate:s=>s.author.url=origin+'/other'},{footerLicense:'https://creativecommons.org/licenses/by/4.0/'},{statsMutate:()=>''},{statsMutate:s=>s.replace('Total: 1','Total: 2')},{statsMutate:s=>s.replace('Page: 1','Page: 2')},{schemaMutate:s=>s.numberOfItems=2},{schemaMutate:s=>s.image=null},{children:[origin+'/gallery']},{children:['https://evil.example/gallery/a']},{children:[folder+'/child',folder+'/child']}];
  for(const options of cases)assert.throws(()=>ayomi.parseGallery(leaf(options),folder));
  const root=ayomi.source.gallery;assert.throws(()=>ayomi.parseGallery(page(root,{children:[folder],schemaMutate:s=>s.mainEntity.itemListElement[0].item.url=root+'/wrong'}),root));
  assert.throws(()=>ayomi.parseGallery(page(root,{children:[folder],schemaMutate:s=>s.mainEntity.numberOfItems=0}),root));
  assert.throws(()=>ayomi.parseGallery(leaf().replace('"@type":"ImageGallery"','BROKEN JSON'),folder));
});

test('normalized illustrations preserve licensed native pixels, author previews and copyright notice',()=>{
  const raw=record(),[item]=ayomi.normalizeRecords([raw,raw]);assert.equal(item.width,1024);assert.equal(item.height,1536);assert.ok(item.tags.includes('AI 插画'));assert.ok(item.tags.includes('竖屏'));
  assert.equal(item.copyrightNotice,copyrightNotice);assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'ayomi'),[item]);
  assert.equal(item.fallbackImage,item.download);
  assert.equal(core.filterWallpapers([item],{category:'anime',provider:'ayomi',orientation:'portrait'}).length,1);
  assert.deepEqual(ayomi.normalizeRecords(null),[]);assert.deepEqual(ayomi.normalizeRecords([null]),[]);
  const mutations=[r=>r.artist='Other',r=>r.license='CC0',r=>r.licenseUrl=ayomi.source.gallery,r=>r.width=NaN,r=>r.height=30001,r=>r.height=1535,r=>r.width=1023,r=>r.imageWidth=0,r=>r.imageHeight=1537,r=>r.imageWidth=960,r=>r.download+='?tracking=1',r=>r.pageUrl=origin+'/gallery/other',r=>r.image='javascript:bad',r=>r.image=origin+'/images/thumbs/other/girl-one.png.webp',r=>r.image+='?tracking=1',r=>r.revision=null];
  for(const mutate of mutations){const raw=record();mutate(raw);assert.deepEqual(ayomi.normalizeRecords([raw]),[]);}
  assert.deepEqual(ayomi.normalizeRecords([{...raw,image:raw.download}]),[]);
  const [full]=ayomi.normalizeRecords([{...raw,image:raw.download,imageWidth:1024,imageHeight:1536}]);assert.equal(full.image,full.download);
  assert.equal(full.fallbackImage,undefined);
  for(const title of ['Pikachu-themed anime girl','Kanade from Beast Tamer','Pokemon character','Arona with a halo','Blue Archive school character'])assert.deepEqual(ayomi.normalizeRecords([{...raw,title}]),[]);
  assert.deepEqual(ayomi.normalizeRecords([{...raw,pageUrl:origin+'/gallery/arona_blue-archive',download:raw.download.replace('/snowy-park/','/arona_blue-archive/'),image:raw.image.replace('/snowy-park/','/arona_blue-archive/')}]),[]);
});

test('license hints expose attribution, noncommercial and no-derivative restrictions',()=>{
  assert.equal(feeds.licenseHint('CC BY-NC-ND 4.0'),'署名 · 非商业 · 不可改作');
  assert.equal(feeds.licenseHint('CC BY-NC-SA 4.0'),'署名 · 非商业 · 相同方式共享');
  assert.equal(feeds.licenseHint('CC BY 4.0'),'署名');assert.equal(feeds.licenseHint('CC BY-SA 3.0'),'署名 · 相同方式共享');
  for(const license of ['CC0','Public domain'])assert.equal(feeds.licenseHint(license),'可自由使用');
  for(const license of [undefined,'Unknown'])assert.equal(feeds.licenseHint(license),'查看使用许可');
});

test('explicit text overlays stay out of fresh galleries and cached wallpaper records without excluding ordinary scene text',()=>{
  for(const title of ['Catgirl Sits In Car With Sad Expression and Text Overlay','Catgirl with TEXT-OVERLAY','Catgirl with text_overlay']){
    const raw=image();raw.name=title;assert.deepEqual(ayomi.parseGallery(page(folder,{images:[raw]}),folder).records,[]);
    assert.deepEqual(ayomi.normalizeRecords([{...record(),title}]),[]);
  }
  const captioned=image();captioned.caption='A large text overlay across the bottom';assert.deepEqual(ayomi.parseGallery(page(folder,{images:[captioned]}),folder).records,[]);
  assert.deepEqual(ayomi.normalizeRecords([{...record(),context:'x'.repeat(510)+' text overlay'}]),[]);
  const title='Catgirl reading a textbook beside a bookshelf',raw=image();raw.name=title;raw.description='Letters on a shirt and book cover in a cozy room';
  assert.equal(ayomi.parseGallery(page(folder,{images:[raw]}),folder).records.length,1);
  assert.equal(ayomi.normalizeRecords([{...record(),title,context:raw.description}]).length,1);
});

test('collector reads paginated categories and nested galleries without parallel requests',async()=>{
  const root=ayomi.source.gallery,folders=Array.from({length:21},(_,i)=>root+'/folder-'+i),nested=folders[0]+'/child',pages=new Map();
  pages.set(root+'?page=1',page(root,{children:folders.slice(0,20),total:21}));pages.set(root+'?page=2',page(root,{children:folders.slice(20),total:21,number:2}));
  for(const parent of folders)pages.set(parent+'?page=1',page(parent,{images:[image('one',parent)],children:parent===folders[0]?[nested]:[]}));
  pages.set(nested+'?page=1',page(nested,{images:[image('nested',nested)]}));
  let active=0,peak=0,measured=0;
  const records=await collectAyomi({fetcher:fetchPages(pages),logger,dimensions:async(f,url)=>{active++;peak=Math.max(peak,active);measured++;await new Promise(r=>setImmediate(r));active--;return dimensions(f,url);}});
  assert.equal(records.length,22);assert.equal(peak,1);assert.equal(measured,44);assert.ok(records.some(x=>x.pageUrl.startsWith(nested)));
});

test('changed or incomplete root pagination refuses to replace the catalog',async()=>{
  const root=ayomi.source.gallery,children=Array.from({length:20},(_,i)=>root+'/folder-'+i);
  for(const second of [Error('offline'),page(root,{children:[root+'/last'],total:22,number:2}),page(root,{children:[children[0]],total:21,number:2})]){
    const pages=new Map([[root+'?page=1',page(root,{children,total:21})],[root+'?page=2',second]]);
    await assert.rejects(collectAyomi({fetcher:fetchPages(pages),logger,dimensions}));
  }
  await assert.rejects(collectAyomi({fetcher:fetchPages(catalogPages()),logger}),/缺少/);
  await assert.rejects(collectAyomi({fetcher:fetchPages(new Map()),logger,dimensions}),/HTTP 404/);
});

test('unchanged images reuse sizes while author and license fields are verified again',async()=>{
  const raw=record();let measured=0;
  const records=await collectAyomi({fetcher:fetchPages(catalogPages()),old:old([raw]),logger,dimensions:async()=>{measured++;assert.fail('unchanged image uses verified native size');}});
  assert.equal(measured,0);assert.deepEqual(records,[raw]);
  const withdrawn=image();withdrawn.license='https://creativecommons.org/licenses/by-nc/4.0/';
  assert.deepEqual(await collectAyomi({fetcher:fetchPages(catalogPages([withdrawn])),old:old([raw]),logger,dimensions}),[]);
});

test('temporary gallery failures retain that subtree while healthy folders update',async()=>{
  const raw=record(),healthy=ayomi.source.gallery+'/new-park',pages=catalogPages();
  pages.set(ayomi.source.gallery+'?page=1',page(ayomi.source.gallery,{children:[folder,healthy]}));pages.set(folder+'?page=1',Error('offline'));pages.set(healthy+'?page=1',page(healthy,{images:[image('new',healthy)]}));
  const records=await collectAyomi({fetcher:fetchPages(pages),old:old([raw]),logger,dimensions});assert.equal(records.length,2);assert.ok(records.some(x=>x.download===raw.download));
  await assert.rejects(collectAyomi({fetcher:fetchPages(catalogPages().set(folder+'?page=1',Error('offline'))),old:old([raw]),logger,dimensions}),/所有画廊分类/);
});

test('cropped or unavailable thumbnails fall back to an unmodified original image',async()=>{
  for(const preview of [{width:640,height:640},null,{width:2048,height:3072}]){
    const records=await collectAyomi({fetcher:fetchPages(catalogPages()),logger,dimensions:async(f,url)=>{if(url.includes('/thumbs/')){if(!preview)throw Error('offline');return preview;}return dimensions(f,url);}});
    assert.equal(records[0].image,records[0].download);assert.equal(records[0].imageWidth,1024);assert.equal(records[0].imageHeight,1536);
  }
});

test('changed image failures retain verified originals; successfully invalid pixels remove old images',async()=>{
  const changed=image();changed.dateModified='2026-04-19T02:41:35.875Z';
  const preserved=await collectAyomi({fetcher:fetchPages(catalogPages([changed])),old:old([record()]),logger,dimensions:async()=>{throw Error('offline');}});assert.deepEqual(preserved,[record()]);
  await assert.rejects(collectAyomi({fetcher:fetchPages(catalogPages()),logger,dimensions:async()=>{throw Error('offline');}}),/所有画廊分类/);
  assert.deepEqual(await collectAyomi({fetcher:fetchPages(catalogPages([changed])),old:old([record()]),logger,dimensions:async()=>({width:512,height:768})}),[]);
  assert.deepEqual(await collectAyomi({fetcher:fetchPages(catalogPages([])),old:old([record()]),logger,dimensions}),[]);
});

test('bounded requests save verified images and resume without repeating their headers',async()=>{
  const map=catalogPages([image('one'),image('two')]),requested=[],waited=[];
  const fetcher=async(url,options)=>{requested.push(url);return url.includes('/images/')?{ok:true,status:200}:fetchPages(map)(url,options);};
  const reader=async(fetcher,url)=>{await fetcher(url,{});return dimensions(fetcher,url);};
  const first=await syncAyomi({fetcher,dimensions:reader,logger,maxRequests:4,intervalMs:1500,wait:async ms=>waited.push(ms)});
  assert.equal(first.records.length,1);assert.deepEqual(first.continuation,{queue:[folder]});assert.equal(first.complete,false);assert.equal(requested.length,4);assert.deepEqual(waited,[1500,1500,1500]);
  requested.length=0;
  const next=await syncAyomi({fetcher,dimensions:reader,old:old(first.records),continuation:first.continuation,logger,intervalMs:0});
  assert.equal(next.records.length,2);assert.equal(next.continuation,null);assert.equal(next.complete,true);assert.equal(requested.length,3);assert.ok(requested.every(url=>!url.includes('girl-one')));
});

test('collection budgets preserve unvisited images and resume nested directories',async()=>{
  const other=ayomi.source.gallery+'/other-park',nested=folder+'/child',map=catalogPages();
  map.set(ayomi.source.gallery+'?page=1',page(ayomi.source.gallery,{children:[folder,other]}));
  map.set(folder+'?page=1',page(folder,{images:[image()],children:[nested]}));map.set(other+'?page=1',page(other,{images:[image('other',other)]}));map.set(nested+'?page=1',page(nested,{images:[image('child',nested)]}));
  const original={...record(),...ayomi.parseGallery(map.get(other+'?page=1'),other+'?page=1').records[0]};
  const first=await syncAyomi({fetcher:fetchPages(map),dimensions,old:old([original]),maxCollections:1,logger,intervalMs:0});
  assert.equal(first.records.length,2);assert.deepEqual(first.continuation.queue,[other,nested]);
  const next=await syncAyomi({fetcher:fetchPages(map),dimensions,old:old(first.records),continuation:first.continuation,logger,intervalMs:0});
  assert.equal(next.records.length,3);assert.equal(next.continuation,null);
});

test('HTTP 429 halts all requests and honors numeric and date Retry-After across runs',async()=>{
  const now=new Date('2026-10-02T00:00:00Z'),other=ayomi.source.gallery+'/other-park';
  for(const retryAfter of ['120','Fri, 02 Oct 2026 00:02:00 GMT',null,'invalid']){
    let requests=0,canceled=0;
    const fetcher=async()=>{requests++;return {ok:false,status:429,headers:{get:()=>retryAfter},body:{cancel:async()=>canceled++}};};
    const paused=await syncAyomi({fetcher,dimensions,old:old([record()]),continuation:{queue:[folder,other]},now,logger,intervalMs:0});
    const expected=retryAfter===null||retryAfter==='invalid'?'2026-10-02T01:00:00.000Z':'2026-10-02T00:02:00.000Z';
    assert.equal(requests,1);assert.equal(canceled,1);assert.deepEqual(paused.records,[record()]);assert.equal(paused.continuation.retryAt,expected);assert.equal(paused.interrupted,true);assert.equal(paused.updated,false);
    const cooled=await syncAyomi({fetcher,dimensions,old:old(paused.records),continuation:paused.continuation,now,logger,intervalMs:0});assert.equal(requests,1);assert.deepEqual(cooled.continuation,paused.continuation);
    const map=catalogPages();map.set(ayomi.source.gallery+'?page=1',page(ayomi.source.gallery,{children:[folder,other]}));map.set(other+'?page=1',page(other));
    const resumed=await syncAyomi({fetcher:fetchPages(map),dimensions,old:old(paused.records),continuation:paused.continuation,now:new Date(expected),logger,intervalMs:0});assert.equal(resumed.complete,true);assert.equal(resumed.records.length,1);
  }
});

test('image-cache and directory cooldowns share the latest valid time without network requests',async()=>{
  const now=new Date('2026-10-02T00:00:00Z'),later='2026-10-02T04:00:00.000Z';
  assert.equal(cooldownUntil(now,'invalid',null,'2026-10-01T00:00:00Z'),undefined);
  assert.equal(cooldownUntil(now,'2026-10-02T02:00:00Z',later),later);assert.equal(retryTime('99999999999999999999999',now),'2026-10-02T01:00:00.000Z');
  const result=await syncAyomi({old:old([record()]),continuation:{queue:[folder],retryAt:'2026-10-02T02:00:00Z'},retryAt:later,now,logger,dimensions,fetcher:()=>assert.fail('image-cache cooldown also prevents directory fetching')});
  assert.deepEqual(result.records,[record()]);assert.equal(result.continuation.retryAt,later);assert.equal(result.updated,false);
});

test('rate limiting during image headers preserves progress and never masks throttling as a thumbnail fallback',async()=>{
  const map=catalogPages([image('one'),image('two')]),requested=[];
  const fetcher=async(url,options)=>{requested.push(url);if(url.includes('/thumbs/')&&url.includes('girl-two'))return {ok:false,status:429};if(url.includes('/images/'))return {ok:true};return fetchPages(map)(url,options);};
  const reader=async(fetcher,url)=>{await fetcher(url,{});return dimensions(fetcher,url);};
  const result=await syncAyomi({fetcher,dimensions:reader,logger,intervalMs:0,now:new Date('2026-10-02T00:00:00Z')});
  assert.equal(result.records.length,1);assert.equal(result.interrupted,true);assert.deepEqual(result.continuation.queue,[folder]);assert.equal(requested.length,6);assert.match(result.records[0].download,/girl-one/);
  const root=await syncAyomi({fetcher:async()=>({ok:false,status:429}),dimensions,old:old([record()]),logger,intervalMs:0});assert.deepEqual(root.records,[record()]);assert.deepEqual(root.continuation.queue,[]);
});

test('invalid continuation cannot request other origins or unbounded queues',async()=>{
  const map=catalogPages(),requested=[];
  for(const state of [{queue:['https://evil.example/gallery/a']},{queue:[folder+'?page=2']},{queue:[ayomi.source.gallery]},{queue:[folder,folder]},{queue:[folder],retryAt:'tomorrow'},{queue:Array(601).fill(folder)},{queue:'bad'}]){
    const result=await syncAyomi({fetcher:async(url,opts)=>{requested.push(url);return fetchPages(map)(url,opts);},dimensions,continuation:state,logger,intervalMs:0});assert.equal(result.complete,true);
  }
  assert.ok(requested.every(url=>url.startsWith(origin+'/gallery')));
  for(const opts of [{maxRequests:0},{maxRequests:301},{maxCollections:0},{maxCollections:101},{intervalMs:-1},{intervalMs:60001}])await assert.rejects(syncAyomi({...opts,dimensions,logger}),/预算/);
});

test('catalog refresh and cache merge retain the continuation belonging to the selected provider version',async()=>{
  const now=new Date('2026-10-02T00:00:00Z'),queue=[folder],previous={version:1,records:{ayomi:[record()]},updatedAt:{ayomi:'2026-10-01T00:00:00Z'},continuation:{ayomi:{queue}}};
  const paused=await refreshCatalog({previous,now,providerIds:['ayomi'],fetcher:async()=>({ok:false,status:429}),dimensions,logger});assert.equal(paused.failures,1);assert.equal(paused.catalog.updatedAt.ayomi,previous.updatedAt.ayomi);assert.deepEqual(paused.catalog.continuation.ayomi.queue,queue);
  const failed=await refreshCatalog({previous,now,providerIds:['ayomi'],fetcher:async()=>{throw Error('offline');},dimensions,logger});assert.deepEqual(failed.catalog.continuation.ayomi,previous.continuation.ayomi);
  const newer={...previous,updatedAt:{ayomi:'2026-10-03T00:00:00Z'},continuation:{ayomi:{queue:[],retryAt:'2026-10-04T00:00:00Z'}}};
  assert.deepEqual(mergeCatalogs(newer,previous).continuation.ayomi,newer.continuation.ayomi);assert.deepEqual(mergeCatalogs(previous,newer).continuation.ayomi,newer.continuation.ayomi);
  assert.equal(mergeCatalogs(null,null).continuation.ayomi,null);
});

test('catalog refresh preserves timestamps on source outages and clears verified empty galleries',async()=>{
  const previous={version:1,records:{ayomi:[record()]},updatedAt:{ayomi:'2026-09-30T00:00:00Z'}};
  const failed=await refreshCatalog({previous,providerIds:['ayomi'],fetcher:async()=>{throw Error('offline');},logger,dimensions});assert.equal(failed.failures,1);assert.equal(failed.catalog.records.ayomi.length,1);assert.equal(failed.catalog.updatedAt.ayomi,previous.updatedAt.ayomi);
  const fresh=await refreshCatalog({previous,providerIds:['ayomi'],fetcher:fetchPages(catalogPages()),logger,dimensions});assert.equal(fresh.failures,0);assert.equal(fresh.catalog.records.ayomi.length,1);
  const empty=await refreshCatalog({previous,providerIds:['ayomi'],fetcher:fetchPages(new Map([[ayomi.source.gallery+'?page=1',page(ayomi.source.gallery)]])),logger,dimensions});assert.equal(empty.failures,0);assert.deepEqual(empty.catalog.records.ayomi,[]);
});
