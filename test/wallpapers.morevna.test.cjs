const {test}=require('node:test');
const assert=require('node:assert/strict');
const morevna=require('../source/wallpapers/morevna.js');
const feeds=require('../source/wallpapers/feeds.js');
const core=require('../source/wallpapers/core.js');
const {collectMorevna,refreshCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs');
const logger={log(){},warn(){}},now=new Date('2026-10-02T00:00:00Z');
const declaration='<p>A collection of images made for Morevna anime and distributed freely under CC-BY 4.0 license</p>';
const upload='https://morevnaproject.org/wp-content/uploads/2025/10/';
const terms=Object.entries(morevna.categories).map(([slug,id])=>({id,slug,taxonomy:'artwork_category'}));

function work(id=1){
  return {id,status:'publish',type:'artwork',link:'https://morevnaproject.org/artwork/work-'+id+'/',title:{rendered:'<b>Sunset &amp; magic</b>'},content:{protected:false,rendered:'Original finished artwork'},modified_gmt:'2025-10-01T00:00:00',featured_media:id+1000,artwork_category:[365],artist:[100],_embedded:{
    'wp:term':[[{...terms[0]}],[{id:100,taxonomy:'artist',name:'<b>Artist</b>',link:'https://morevnaproject.org/artist/original-artist/'}]],
    'wp:featuredmedia':[{id:id+1000,media_type:'image',mime_type:'image/jpeg',source_url:upload+'work-'+id+'-scaled.jpg',media_details:{width:2560,height:1440,original_image:'work-'+id+'.jpg',sizes:{medium_large:{width:768,height:432,source_url:upload+'work-'+id+'-768x432.jpg'},large:{width:1024,height:576,source_url:upload+'work-'+id+'-1024x576.jpg'},cropped:{width:1280,height:1280,source_url:upload+'work-'+id+'-1280x1280.jpg'}}}}]
  }};
}
const media=raw=>raw._embedded['wp:featuredmedia'][0];
const record=()=>({...morevna.parseWork(work()),width:3840,height:2160});
const previous=records=>({version:1,updatedAt:{morevna:'2026-09-30T00:00:00Z'},records:{morevna:records}});
function fetcherFor(posts,{gallery=declaration,categories=terms,respond}={}){
  return async(url,options)=>{
    assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);
    if(url===morevna.source.gallery)return {ok:true,text:async()=>gallery};
    if(url.includes('/artwork_category?'))return {ok:true,json:async()=>categories};
    const query=new URL(url).searchParams,page=Number(query.get('page'));
    assert.equal(query.get('artwork_category'),'365,321');assert.equal(query.get('per_page'),'100');assert.equal(query.get('_embed'),'wp:featuredmedia,wp:term');
    const response={ok:true,json:async()=>posts.slice((page-1)*100,page*100),headers:new Headers({'X-WP-TotalPages':String(Math.ceil(posts.length/100)),'X-WP-Total':String(posts.length)})};
    return respond?respond(response,page):response;
  };
}

test('Morevna requires the official gallery collection license rather than a generic footer',()=>{
  assert.equal(morevna.source.license,'CC BY 4.0');assert.deepEqual(morevna.source.categories,['anime','illustration']);
  assert.equal(morevna.galleryLicensed(declaration),true);
  for(const html of [null,'','<p>Our website uses CC-BY 4.0 license</p>',declaration.replace('4.0','3.0'),declaration.replace('CC-BY','CC-BY-NC'),declaration.replace('Morevna anime','unrelated collection')])assert.equal(morevna.galleryLicensed(html),false);
});

test('Morevna records retain native dimensions, license provenance and author credits across restoration',()=>{
  const raw=record(),[item]=morevna.normalizeRecords([raw]);
  assert.equal(item.title,'Sunset & magic');assert.equal(item.artist,'Artist');assert.equal(item.width,3840);assert.equal(item.height,2160);
  assert.equal(item.download,upload+'work-1.jpg');assert.equal(item.image,upload+'work-1-1024x576.jpg');
  assert.equal(item.feedRecord.licenseSource,morevna.source.gallery);assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'morevna'),[item]);
  for(const category of ['anime','illustration'])assert.equal(core.filterWallpapers([item],{category,provider:'morevna',orientation:'landscape'}).length,1);
  assert.equal(morevna.normalizeRecords([raw,raw,{...raw,workID:2}]).length,1);assert.deepEqual(morevna.normalizeRecords(null),[]);
  const portrait={...raw,width:2160,height:3840,imageWidth:576,imageHeight:1024,mediaWidth:1440,mediaHeight:2560,image:upload+'work-1-576x1024.jpg',kind:'background',creditNote:'<b>Additional credit</b>'};
  const [vertical]=morevna.normalizeRecords([portrait]);assert.ok(vertical.tags.includes('竖屏'));assert.ok(vertical.tags.includes('场景'));assert.equal(vertical.artist,'Artist · Additional credit');
});

test('unsafe, unlicensed, undersized or unrelated Morevna image records are rejected',()=>{
  const mutations=[r=>r.workID=0,r=>r.mediaID='2',r=>r.kind='sketch',r=>r.license='CC0',r=>r.licenseUrl='https://evil.example/',r=>r.licenseSource=r.pageUrl,r=>r.title='',r=>r.artist=null,r=>r.title='NSFW collection',r=>r.width=NaN,r=>r.width=30001,r=>r.width=1000,r=>r.height=799,r=>r.imageWidth=-1,r=>r.imageHeight=800,r=>r.mediaWidth=0,r=>r.mediaHeight=800,r=>r.artistUrls=[],r=>r.artistUrls=null,r=>r.artistUrls=['https://evil.example/artist/'],r=>r.pageUrl='https://morevnaproject.org/blog/article/',r=>r.image=upload+'another-1024x576.jpg',r=>r.image=upload+'work-1-768x432.jpg',r=>r.image=r.download,r=>r.revision=null,r=>r.revision='today'];
  for(const mutate of mutations){const raw=record();mutate(raw);assert.deepEqual(morevna.normalizeRecords([raw]),[]);}
  for(const url of ['../image.jpg','javascript:alert(1)','http://morevnaproject.org/wp-content/uploads/2025/10/work-1.jpg','https://evil.example/wp-content/uploads/2025/10/work-1.jpg',upload.replace('.org','.org:444')+'work-1.jpg',upload+'work-1.jpg?tracking=1',upload+'work-1.jpg#fragment',upload.replace('/10/','/13/')+'work-1.jpg',upload+'work-1.svg'])assert.deepEqual(morevna.normalizeRecords([{...record(),download:url}]),[]);
  assert.deepEqual(morevna.normalizeRecords([null]),[]);
});

test('structured artwork parsing binds featured media, authors and selected official categories',()=>{
  assert.equal(morevna.parseWork(work()).title,'Sunset & magic');assert.equal(morevna.parseWork(null),null);
  const mutations=[r=>r.status='draft',r=>r.type='post',r=>r.content.protected=true,r=>r.featured_media=99,r=>media(r).media_type='video',r=>media(r).mime_type='image/svg+xml',r=>r._embedded['wp:term']=null,r=>r._embedded['wp:term'][0]={},r=>r.artwork_category=[],r=>r._embedded['wp:term'][0][0].slug='sketches',r=>r._embedded['wp:term'][0][0].id=99,r=>r.artist=[],r=>r.artist=[101],r=>r.artist=[100,100],r=>r._embedded['wp:term'][1][0].link='https://evil.example/artist/',r=>r._embedded['wp:term'][1][0].name='',r=>media(r).source_url='https://evil.example/image.jpg',r=>media(r).media_details.width=null,r=>r.content.rendered='All rights reserved',r=>r.content.rendered='This work uses CC BY-SA 4.0',r=>media(r).media_details.original_image='unrelated.jpg'];
  for(const mutate of mutations){const raw=work();mutate(raw);assert.equal(morevna.parseWork(raw),null);}
  const invalid=work();invalid.artist=['100'];invalid._embedded['wp:term'][1][0].id='100';assert.equal(morevna.parseWork(invalid),null);
  const background=work();background.artwork_category=[321];background._embedded['wp:term'][0]=[{...terms[1]}];assert.equal(morevna.parseWork(background).kind,'background');
  const collaboration=work();collaboration.artist.push(101);collaboration._embedded['wp:term'][1].push({id:101,taxonomy:'artist',name:'Second artist',link:'https://morevnaproject.org/artist/second-artist/'});assert.equal(morevna.parseWork(collaboration).artist,'Artist / Second artist');
});

test('preview selection keeps uncropped image variants and never guesses an original URL',()=>{
  const raw=work(),details=media(raw).media_details;
  details.sizes.large.source_url='https://evil.example/large.jpg';assert.equal(morevna.parseWork(raw).image,upload+'work-1-768x432.jpg');
  details.sizes={};assert.equal(morevna.parseWork(raw).image,upload+'work-1.jpg');
  delete details.original_image;assert.equal(morevna.parseWork(raw).download,upload+'work-1-scaled.jpg');
  const dotted=work();media(dotted).source_url=upload+'morevna-05.10.png';media(dotted).mime_type='image/png';delete media(dotted).media_details.original_image;delete media(dotted).media_details.sizes;assert.equal(morevna.parseWork(dotted).download,upload+'morevna-05.10.png');
  raw.content.rendered='Pepper&amp;Carrot character by David Revoy';assert.equal(morevna.parseWork(raw).creditNote,'Pepper&Carrot 角色：David Revoy');
});

test('collector completely traverses pagination and limits native image verification to three workers',async()=>{
  const posts=Array.from({length:101},(_,i)=>work(i+1));let active=0,peak=0,measured=0;
  const records=await collectMorevna({fetcher:fetcherFor(posts),logger,dimensions:async(_,url)=>{
    assert.match(url,/work-\d+\.jpg$/);active++;peak=Math.max(peak,active);measured++;
    await new Promise(resolve=>setImmediate(resolve));active--;return {width:3840,height:2160};
  }});
  assert.equal(records.length,101);assert.equal(measured,101);assert.equal(peak,3);assert.equal(records[0].width,3840);
});

test('collector refuses incomplete, inconsistent or excessive WordPress catalogs',async()=>{
  const posts=Array.from({length:101},(_,i)=>work(i+1));
  const cases=[
    {gallery:'<p>CC BY 4.0</p>'},{categories:[]},{categories:[{...terms[0],id:999},terms[1]]},
    {respond:r=>({...r,headers:new Headers()})},
    {respond:r=>({...r,headers:new Headers({'X-WP-TotalPages':'11','X-WP-Total':'1001'})})},
    {respond:r=>({...r,headers:new Headers({'X-WP-TotalPages':'1','X-WP-Total':'101'})})},
    {respond:(r,page)=>page===2?{...r,headers:new Headers({'X-WP-TotalPages':'2','X-WP-Total':'102'})}:r},
    {respond:(r,page)=>page===2?{...r,json:async()=>[]}:r},
    {respond:(r,page)=>page===2?{...r,json:async()=>[posts[0]]}:r},
    {respond:r=>({...r,json:async()=>({error:'changed'})})},
    {respond:r=>({...r,json:async()=>posts})},
    {respond:(r,page)=>page===2?{...r,json:async()=>[{id:0}]}:r},
    {respond:r=>({...r,ok:false,status:503})}
  ];
  for(const options of cases)await assert.rejects(collectMorevna({fetcher:fetcherFor(posts,options),logger,dimensions:async()=>{assert.fail('must not measure before the whole catalog is read');}}));
});

test('unchanged revisions reuse native dimensions but refresh titles and preview links',async()=>{
  const saved=record(),post=work();post.title.rendered='Updated title';media(post).media_details.sizes={};
  const records=await collectMorevna({fetcher:fetcherFor([post]),old:morevna.normalizeRecords([saved]),logger,dimensions:async()=>assert.fail('unchanged revision is cached')});
  assert.equal(records[0].title,'Updated title');assert.equal(records[0].image,records[0].download);assert.equal(records[0].imageWidth,3840);
  post.modified_gmt='2025-10-02T00:00:00';let measured=0;
  const fresh=await collectMorevna({fetcher:fetcherFor([post]),old:morevna.normalizeRecords([saved]),logger,dimensions:async()=>{measured++;return {width:4096,height:2304};}});
  assert.equal(measured,1);assert.equal(fresh[0].imageWidth,4096);
});

test('temporary image failures preserve known originals and skip unavailable new images',async()=>{
  const saved=record(),post=work();post.modified_gmt='2025-10-02T00:00:00';
  const records=await collectMorevna({fetcher:fetcherFor([post,work(2)]),old:morevna.normalizeRecords([saved]),logger,dimensions:async()=>{throw Error('offline');}});
  assert.deepEqual(records,[saved]);
  const changed=work();media(changed).source_url=upload+'changed-scaled.jpg';media(changed).media_details.original_image='changed.jpg';media(changed).media_details.sizes={};
  await assert.rejects(collectMorevna({fetcher:fetcherFor([changed]),old:morevna.normalizeRecords([saved]),logger,dimensions:async()=>{throw Error('offline');}}),/所有候选原图/);
});

test('successfully verified removal or invalid dimensions clear old records instead of reviving them',async()=>{
  const saved=record(),post=work();post.modified_gmt='2025-10-02T00:00:00';
  for(const size of [{width:1280,height:720},{width:3840,height:3840},{width:NaN,height:2160}])assert.deepEqual(await collectMorevna({fetcher:fetcherFor([post]),old:morevna.normalizeRecords([saved]),logger,dimensions:async()=>size}),[]);
  for(const posts of [[],[{...work(),artist:[]}],[{...work(),content:{rendered:'No redistribution'}}]]){
    const result=await refreshCatalog({previous:previous([saved]),fetcher:fetcherFor(posts),providerIds:['morevna'],logger,now});
    assert.equal(result.failures,0);assert.deepEqual(result.catalog.records.morevna,[]);assert.equal(result.catalog.updatedAt.morevna,now.toISOString());
  }
});

test('source outages preserve the validated catalog and last successful update time',async()=>{
  for(const fetcher of [async()=>{throw Error('offline');},fetcherFor([work()],{gallery:''}),fetcherFor([work()],{categories:null})]){
    const result=await refreshCatalog({previous:previous([record()]),providerIds:['morevna'],fetcher,logger,now});
    assert.equal(result.failures,1);assert.equal(result.catalog.records.morevna.length,1);assert.equal(result.catalog.updatedAt.morevna,'2026-09-30T00:00:00Z');
  }
  const result=await refreshCatalog({providerIds:['morevna'],fetcher:fetcherFor([work()]),dimensions:async()=>({width:3840,height:2160}),logger,now});
  assert.equal(result.failures,0);assert.equal(result.catalog.records.morevna.length,1);
});

test('an older Actions cache cannot erase a newly committed source when the upstream is unavailable',async()=>{
  const seed=previous([record()]),cache={version:1,updatedAt:{},records:{}};
  const merged=mergeCatalogs(seed,cache);assert.equal(merged.records.morevna.length,1);
  const result=await refreshCatalog({previous:merged,providerIds:['morevna'],fetcher:async()=>{throw Error('offline');},logger,now});
  assert.equal(result.catalog.records.morevna.length,1);assert.equal(result.catalog.updatedAt.morevna,seed.updatedAt.morevna);
  assert.deepEqual(cache.records,{});assert.equal(mergeCatalogs(null,null).records.morevna.length,0);
  assert.equal(mergeCatalogs({...seed,version:99},cache).records.morevna.length,0);
  assert.equal(mergeCatalogs(seed,{...previous([]),updatedAt:{morevna:'invalid'}}).records.morevna.length,1);
  assert.equal(mergeCatalogs(seed,{version:1,updatedAt:{morevna:'2026-10-01T00:00:00Z'},records:{}}).records.morevna.length,1);
});

test('newer cached catalog removals win over the committed seed and invalid rows are excluded',()=>{
  const seed=previous([record()]),cache={...previous([]),updatedAt:{morevna:'2026-10-01T00:00:00Z'}};
  assert.deepEqual(mergeCatalogs(seed,cache).records.morevna,[]);assert.equal(mergeCatalogs(seed,cache).updatedAt.morevna,cache.updatedAt.morevna);
  const older={...cache,updatedAt:{morevna:'2026-09-29T00:00:00Z'}};assert.equal(mergeCatalogs(seed,older).records.morevna.length,1);
  const invalid={...cache,records:{morevna:[{...record(),license:'All rights reserved'}]}};assert.deepEqual(mergeCatalogs(seed,invalid).records.morevna,[]);
  const undated={...seed,updatedAt:{}};assert.equal(mergeCatalogs(undated,previous([record()])).records.morevna.length,1);
});
