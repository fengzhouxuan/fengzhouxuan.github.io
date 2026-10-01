const {test}=require('node:test');
const assert=require('node:assert/strict');
const feeds=require('../source/wallpapers/feeds.js');
const core=require('../source/wallpapers/core.js');
const {collectPepper,refreshCatalog}=require('../scripts/refresh-wallpaper-feeds.cjs');
const now=new Date('2026-10-02T00:00:00Z'),logger={log(){},warn(){}};
const licenseUrl='https://creativecommons.org/licenses/by/4.0/';
function candidate(name='Enchanted-Pages',date='2025-03-26'){
  const filename=date+'_'+name+'_by-David-Revoy.jpg';
  return {filename,pageUrl:'https://www.peppercarrot.com/en/viewer/artworks__'+filename.slice(0,-4)+'.html'};
}
function gallery(items){return items.map(item=>'<a href="'+item.pageUrl+'"><img src="https://www.peppercarrot.com/cache/'+item.filename+'"></a>').join('\n');}
function viewer(item,{artist='David Revoy',license='CC-BY 4.0',title='Light &amp; magic'}={}){
  return '<a href="https://www.peppercarrot.com/0_sources/0ther/artworks/hi-res/'+item.filename+'"><img title="Artwork" src="https://www.peppercarrot.com/0_sources/0ther/artworks/low-res/'+item.filename+'"></a><div class="ViewFooterInfo"><a href="'+item.pageUrl+'">"'+title+'"</a> by '+artist+'\n− <a href="'+licenseUrl+'deed.en">'+license+'</a></div>';
}
function artwork(item=candidate()){
  return {...feeds.parsePepperArtwork(viewer(item),item),width:2500,height:1587};
}
function wallpaper(name='Other-Wallpaper',date='2023-04-26'){
  const item=candidate(name,date);
  return {filename:item.filename,image:'https://www.peppercarrot.com/cache/'+item.filename,download:'https://www.peppercarrot.com/0_sources/0ther/wallpapers/hi-res/'+item.filename,artist:'David Revoy',license:'CC BY 4.0',licenseUrl,pageUrl:feeds.pepperPage,width:3840,height:2160};
}
function wallpaperIndex(records){return records.map(item=>'<a href="'+item.download+'"><img src="'+item.image+'"></a>').join('\n');}
const response=html=>({ok:true,text:async()=>html});
function snapshot(records){return {version:1,updatedAt:{pepper:'previous'},records:{pepper:records}};}

test('artwork keys conservatively remove duplicate titles across wallpaper versions',()=>{
  assert.equal(feeds.pepperWorkKey(candidate('first_cover-','2015-01-20').filename),feeds.pepperWorkKey(candidate('First-cover','2016-12-04').filename));
  for(const filename of [null,'','../image.jpg',candidate().filename.replace('David-Revoy','Somebody'),candidate('x'.repeat(501)).filename])assert.equal(feeds.pepperWorkKey(filename),null);
});

test('gallery discovery only follows author file pages in the official artwork gallery',()=>{
  const item=candidate(),html=gallery([item,item]);
  assert.deepEqual(feeds.parsePepperGallery(html),[item]);assert.deepEqual(feeds.parsePepperGallery(null),[]);
  for(const url of [item.pageUrl.replace('https:','http:'),item.pageUrl.replace('www.peppercarrot.com','www.peppercarrot.com:444'),item.pageUrl.replace('www.peppercarrot.com','evil.example'),item.pageUrl+'?tracking=1',item.pageUrl.replace('artworks__','fan-art__'),item.pageUrl.replace('David-Revoy','Somebody')])assert.deepEqual(feeds.parsePepperGallery(gallery([{...item,pageUrl:url}])),[]);
  assert.deepEqual(feeds.parsePepperGallery('<a href="'+item.pageUrl+'">Download</a>'),[]);
});

test('each artwork needs its own matching author, license, preview and original declarations',()=>{
  const item=candidate(),html=viewer(item),raw=feeds.parsePepperArtwork(html,item);
  assert.equal(raw.title,'Light & magic');assert.equal(raw.license,'CC BY 4.0');assert.equal(raw.kind,'artwork');
  assert.ok(raw.image.includes('/artworks/low-res/'));assert.ok(raw.download.includes('/artworks/hi-res/'));assert.equal(raw.pageUrl,item.pageUrl);
  for(const invalid of [viewer(item,{artist:'Somebody'}),viewer(item,{license:'All rights reserved'}),viewer(item,{license:'CC-BY-SA 4.0'}),html.replace('ViewFooterInfo','SiteFooter'),html.replace(licenseUrl+'deed.en',licenseUrl+'?tracking=1'),html.replace('/artworks/low-res/','/artworks/unknown/'),html.replace('/artworks/hi-res/','/fan-art/hi-res/'),html.replace('title="Artwork" src="https:','title="Artwork" src="http:'),html.replace('href="'+item.pageUrl+'"','href="https://evil.example/"')])assert.equal(feeds.parsePepperArtwork(invalid,item),null);
  assert.equal(feeds.parsePepperArtwork('<a href="'+licenseUrl+'">CC-BY 4.0</a>',item),null);
  assert.equal(feeds.parsePepperArtwork(html,{...item,pageUrl:item.pageUrl+'#source'}),null);assert.equal(feeds.parsePepperArtwork(html,null),null);assert.equal(feeds.parsePepperArtwork(null,item),null);
});

test('normalized artworks preserve native size and credits while duplicate wallpapers appear once',()=>{
  const item=candidate(),raw=artwork(item),normalized=feeds.normalizeFeed([raw],'pepper')[0];
  assert.equal(normalized.title,'Light & magic');assert.deepEqual(normalized.categories,['anime','illustration']);assert.equal(normalized.width,2500);assert.equal(normalized.height,1587);
  assert.equal(normalized.download,raw.download);assert.equal(normalized.licenseUrl,licenseUrl);assert.deepEqual(feeds.normalizeFeed([normalized.feedRecord],'pepper'),[normalized]);
  assert.equal(core.filterWallpapers([normalized],{category:'anime'}).length,1);
  for(const mutate of [r=>r.kind='fanart',r=>r.kind=null,r=>r.artist='Someone',r=>r.pageUrl=feeds.pepperPage,r=>r.image=r.image+'?tracking=1',r=>r.download=r.download.replace('/hi-res/','/hi-res/subdirectory/'),r=>r.height=799,r=>r.width=NaN,r=>r.license='CC0']){
    const invalid={...raw};mutate(invalid);assert.deepEqual(feeds.normalizeFeed([invalid],'pepper'),[]);
  }
  const duplicate=artwork(candidate('same_title','2015-01-20')),wall=wallpaper('Same-title','2016-12-04'),input=[duplicate,raw,wall];
  const mixed=feeds.normalizeFeed(input,'pepper');assert.equal(mixed.length,2);assert.equal(mixed[0].feedRecord.kind,undefined);assert.equal(input[0],duplicate);
  assert.equal(feeds.normalizeFeed([{...wall,license:'Copyrighted'},duplicate],'pepper').length,1);
  assert.equal(feeds.normalizeFeed([{...wall,height:10},duplicate],'pepper').length,1);
});

test('collection verifies every new detail page and image size with bounded concurrency',async()=>{
  const wall=wallpaper(),good=candidate('New-Painting'),small=candidate('Small-Painting'),privateWork=candidate('Private-Painting'),offline=candidate('Unavailable-Painting');
  const duplicate=candidate('Other-Wallpaper','2015-01-01'),requests=[],measured=[];let active=0,maximum=0;
  const result=await refreshCatalog({previous:snapshot([wall]),providerIds:['pepper'],now,logger,fetcher:async(url,options)=>{
    requests.push(url);assert.ok(options.signal);assert.match(options.headers['User-Agent'],/RabbitWallpaperStation/);
    if(url===feeds.pepperPage)return response(wallpaperIndex([wall]));
    if(url===feeds.pepperArtworkPage)return response(gallery([duplicate,good,small,privateWork,offline]));
    active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;
    if(url===offline.pageUrl)throw Error('offline');
    if(url===privateWork.pageUrl)return response(viewer(privateWork,{license:'Copyrighted'}));
    return response(viewer(url===good.pageUrl?good:small));
  },dimensions:async(fetcher,url)=>{measured.push(url);return url.includes('Small-Painting')?{width:1200,height:1000}:{width:2500,height:1587};}});
  assert.equal(result.failures,0);assert.equal(result.catalog.records.pepper.length,2);assert.equal(result.catalog.records.pepper[1].filename,good.filename);
  assert.equal(requests.includes(duplicate.pageUrl),false);assert.equal(measured.length,2);assert.ok(maximum>=2&&maximum<=3);
});

test('cached sizes are reused but licenses are rechecked; missing and withdrawn works are removed',async()=>{
  const wall=wallpaper(),offline=candidate('Cached-Offline'),withdrawn=candidate('Withdrawn'),good=candidate('Cached-Good'),removed=candidate('Removed');
  const previous=snapshot([wall,...[offline,withdrawn,good,removed].map(item=>artwork(item))]);let measured=0;
  const result=await refreshCatalog({previous,providerIds:['pepper'],now,logger,fetcher:async url=>{
    if(url===feeds.pepperPage)return response(wallpaperIndex([wall]));
    if(url===feeds.pepperArtworkPage)return response(gallery([offline,withdrawn,good]));
    if(url===offline.pageUrl)throw Error('offline');
    return response(url===withdrawn.pageUrl?viewer(withdrawn,{license:'Copyrighted'}):viewer(good,{title:'Updated title'}));
  },dimensions:async()=>{measured++;throw Error('must reuse size');}});
  assert.equal(measured,0);assert.deepEqual(result.catalog.records.pepper.map(item=>item.filename),[wall.filename,offline.filename,good.filename]);
  assert.equal(result.catalog.records.pepper[2].title,'Updated title');
});

test('a failed gallery retains its previous records while the other gallery keeps updating',async()=>{
  const oldWall=wallpaper('Old-Wallpaper'),oldArt=artwork(candidate('Old-Artwork')),newWall=wallpaper('New-Wallpaper'),newArt=candidate('New-Artwork');
  const previous=snapshot([oldWall,oldArt]);
  const galleryFailed=await refreshCatalog({previous,providerIds:['pepper'],now,logger,fetcher:async url=>{
    if(url===feeds.pepperPage)return response(wallpaperIndex([newWall]));throw Error('offline');
  },dimensions:async()=>({width:2500,height:1587})});
  assert.equal(galleryFailed.failures,0);assert.deepEqual(galleryFailed.catalog.records.pepper.map(item=>item.filename),[newWall.filename,oldArt.filename]);
  const wallsFailed=await refreshCatalog({previous,providerIds:['pepper'],now,logger,fetcher:async url=>{
    if(url===feeds.pepperPage)throw Error('offline');
    if(url===feeds.pepperArtworkPage)return response(gallery([newArt]));return response(viewer(newArt));
  },dimensions:async()=>({width:2500,height:1587})});
  assert.equal(wallsFailed.failures,0);assert.deepEqual(wallsFailed.catalog.records.pepper.map(item=>item.filename),[oldWall.filename,newArt.filename]);
  const malformed=await refreshCatalog({previous,providerIds:['pepper'],now,logger,fetcher:async url=>response(url===feeds.pepperPage?wallpaperIndex([oldWall]):'not a gallery')});
  assert.deepEqual(malformed.catalog.records.pepper.map(item=>item.filename),[oldWall.filename,oldArt.filename]);
});

test('a verified license withdrawal does not resurrect the old artwork through an empty-result fallback',async()=>{
  const item=candidate();
  const result=await refreshCatalog({previous:snapshot([artwork(item)]),providerIds:['pepper'],now,logger,fetcher:async url=>{
    if(url===feeds.pepperPage)return response('');if(url===feeds.pepperArtworkPage)return response(gallery([item]));return response(viewer(item,{license:'Copyrighted'}));
  }});
  assert.equal(result.failures,0);assert.deepEqual(result.catalog.records.pepper,[]);
});

test('complete upstream failure preserves the last successful timestamp and rejects malformed old records',async()=>{
  const wall=wallpaper(),previous=snapshot([wall,artwork()]);
  const result=await refreshCatalog({previous,providerIds:['pepper'],now,logger,fetcher:async()=>{throw Error('offline');}});
  assert.equal(result.failures,1);assert.equal(result.catalog.updatedAt.pepper,'previous');assert.equal(result.catalog.records.pepper.length,2);
  await assert.rejects(collectPepper({old:[null,{feedRecord:{...wall,license:'Copyrighted'}}],logger,fetcher:async()=>{throw Error('offline');}}),/均无法更新/);
  await assert.rejects(collectPepper({old:null,logger,fetcher:async()=>response('')}),/均无法更新/);
});
