const {test}=require('node:test');
const assert=require('node:assert/strict');
const feeds=require('../source/wallpapers/feeds.js');
const core=require('../source/wallpapers/core.js');
const collector=require('../scripts/refresh-wallpaper-feeds.cjs');
const refreshCatalog=options=>collector.refreshCatalog({...options,providerIds:['pepper','met']});
const now=new Date('2026-10-01T12:00:00Z');
const filename='2023-04-26_The-Healer_by-David-Revoy.jpg';
const download='https://www.peppercarrot.com/0_sources/0ther/wallpapers/hi-res/'+filename;
const image='https://www.peppercarrot.com/cache/Healer_900x400px.jpg';
const html='<a href="'+download+'"><img class="" src="'+image+'" alt="Healer"></a>';
const pepper=()=>({...feeds.parsePepperIndex(html)[0],width:3840,height:2160});
const met=()=>({objectID:874,title:'<b>Landscape</b>',artistDisplayName:'Artist\nFrench',isPublicDomain:true,objectName:'Painting',width:2829,height:2250,primaryImage:'https://images.metmuseum.org/CRDImages/ep/original/DP136056.jpg',primaryImageSmall:'https://images.metmuseum.org/CRDImages/ep/web-large/DP136056.jpg',objectURL:'https://www.metmuseum.org/art/collection/search/874'});
const previous=()=>({version:1,updatedAt:{pepper:'2026-09-30T12:00:00Z',met:'2026-09-30T12:00:00Z'},records:{pepper:[pepper()],met:[met()]}});
const fresh=async url=>({ok:true,text:async()=>html,json:async()=>url.includes('/objects/')?met():{objectIDs:[874]}});
const logger={log(){},warn(){}};
const jpeg=Uint8Array.from([255,216,255,224,0,4,0,0,255,192,0,8,8,8,112,15,0,0]);

test('Pepper directory parser accepts only author wallpapers on official HTTPS hosts',()=>{
  assert.equal(feeds.parsePepperIndex(html+html+'<a href="https://evil.example/image.jpg"><img src="'+image+'"></a>').length,1);
  assert.deepEqual(feeds.parsePepperIndex(null),[]);
  for(const bad of ['http://www.peppercarrot.com','https://www.peppercarrot.com:444','https://www.peppercarrot.com@evil.example','javascript:bad','https://www.peppercarrot.com/other'])assert.deepEqual(feeds.parsePepperIndex(html.replace('https://www.peppercarrot.com',bad)),[]);
  assert.deepEqual(feeds.parsePepperIndex(html.replace('by-David-Revoy.jpg','by-Somebody.jpg')),[]);
  assert.deepEqual(feeds.parsePepperIndex(html.replace('Healer_900x400px.jpg','Healer_900x400px.jpg?tracking=1')),[]);
});
test('feed records preserve native size, author, license and official original URLs',()=>{
  for(const [provider,record] of [['pepper',pepper()],['met',met()]]){
    const items=feeds.normalizeFeed([record,record],provider),item=items[0];assert.equal(items.length,1);assert.deepEqual(feeds.normalizeFeed([item.feedRecord],provider),[item]);
    assert.equal(item.provider,provider);assert.ok(item.download.startsWith('https://'));assert.equal(core.filterWallpapers([item],{provider}).length,1);assert.equal(core.filterWallpapers([item],{provider:'commons'}).length,0);
  }
  const [item]=feeds.normalizeFeed([met()],'met');assert.equal(item.title,'Landscape');assert.equal(item.artist,'Artist French');assert.equal(item.license,'CC0');assert.match(item.download,/\/original\//);
  const unnamed=met();unnamed.title=null;unnamed.artistDisplayName='';assert.equal(feeds.normalizeFeed([unnamed],'met')[0].artist,'作者未注明');
});
test('small, copyrighted, unsupported and malformed records cannot enter the catalog',()=>{
  assert.deepEqual(feeds.normalizeFeed(null,'pepper'),[]);assert.deepEqual(feeds.normalizeFeed([pepper()],'unknown'),[]);
  const pepperMutations=[r=>r.artist='',r=>r.license='Copyrighted',r=>r.licenseUrl='https://evil.example',r=>r.pageUrl='https://evil.example',r=>r.filename=null,r=>r.image='javascript:alert(1)',r=>r.download=download.replace('The-Healer','Another'),r=>r.height=100,r=>r.width=NaN,r=>{r.width=1200;r.height=1000;}];
  for(const mutate of pepperMutations){const raw=pepper();mutate(raw);assert.deepEqual(feeds.normalizeFeed([raw],'pepper'),[]);}
  const mutations=[r=>r.objectID=-1,r=>r.objectID='874',r=>r.isPublicDomain=false,r=>r.primaryImage='../evil',r=>r.primaryImageSmall=null,r=>r.objectName='Sculpture',r=>r.objectURL='https://evil.example/874',r=>r.objectURL='https://www.metmuseum.org/art/collection/search/99'];
  for(const mutate of mutations){const raw=met();mutate(raw);assert.deepEqual(feeds.normalizeFeed([raw],'met'),[]);}
  assert.deepEqual(feeds.normalizeFeed([null],'met'),[]);assert.deepEqual(feeds.normalizeFeed([null],'pepper'),[]);
  assert.deepEqual(feeds.normalizeCatalog({version:99}),[]);assert.equal(feeds.normalizeCatalog(previous()).length,2);assert.deepEqual(feeds.normalizeCatalog({version:1}),[]);
});
test('a shared image remains in every category while appearing only once in the gallery',()=>{
  const image={id:'commons-1',source:'commons',title:'Shared landscape',categories:['nature'],tags:['风景']};
  const city={...image,title:'Updated title',categories:['city'],tags:['城市','风景']};
  const unique=feeds.normalizeFeed([pepper()],'pepper')[0];
  const items=feeds.mergeItems([image,unique,city,null,{}, {id:4},{id:''}]);
  assert.equal(items.length,2);assert.equal(items[0].title,'Updated title');assert.deepEqual(items[0].categories,['nature','city']);assert.deepEqual(items[0].tags,['风景','城市']);
  for(const category of ['nature','city'])assert.equal(core.filterWallpapers(items,{category})[0].id,image.id);
  assert.deepEqual(image.categories,['nature']);assert.deepEqual(city.tags,['城市','风景']);
  assert.deepEqual(feeds.mergeItems(null),[]);
  assert.deepEqual(feeds.mergeItems([{id:'one'},{id:'one',categories:['city']}])[0].categories,['city']);
});
test('JPEG headers support progressive frames, split data and malformed segments',()=>{
  assert.deepEqual(collector.jpegDimensions(jpeg),{width:3840,height:2160});assert.equal(collector.jpegDimensions(jpeg.subarray(0,12)),null);
  for(const bytes of [[],[0,0,0,0],[255,216,0,0,0,0],[255,216,255,218,0,0],[255,216,255,224,0,1],[255,216,255,192,0,3,1],[255,216,255,255,255,217,0,0],[255,216,255,208,255,217,0,0]])assert.equal(collector.jpegDimensions(Uint8Array.from(bytes)),null);
  const progressive=jpeg.slice();progressive[9]=194;assert.deepEqual(collector.jpegDimensions(progressive),{width:3840,height:2160});
});
test('dimension reader stops after metadata and cancels its stream',async()=>{
  let canceled=false,reads=0;
  const fetcher=async(url,options)=>{assert.ok(options.signal);return {ok:true,body:new ReadableStream({pull(controller){reads++;controller.enqueue(reads===1?jpeg.subarray(0,8):jpeg.subarray(8));},cancel(){canceled=true;}})}};
  assert.deepEqual(await collector.readDimensions(fetcher,download),{width:3840,height:2160});assert.equal(canceled,true);
  await assert.rejects(collector.readDimensions(async()=>({ok:false,status:503}),download),/HTTP 503/);
  for(const data of [new Uint8Array(0),new Uint8Array(262144)]){
    let stopped=false;await assert.rejects(collector.readDimensions(async()=>({ok:true,body:new ReadableStream({start(c){if(data.length)c.enqueue(data);else c.close();},cancel(){stopped=true;}})}),download),/JPEG/);
    if(data.length)assert.equal(stopped,true);
  }
});
test('refresh reuses known dimensions and queries only public-domain landscape works',async()=>{
  let measured=0;
  const fetcher=fresh;
  const result=await refreshCatalog({now,previous:previous(),fetcher,logger,dimensions:async()=>{measured++;return {width:3840,height:2160};}});
  assert.equal(measured,0);assert.equal(result.failures,0);assert.equal(feeds.normalizeCatalog(result.catalog).length,2);assert.equal(result.catalog.updatedAt.pepper,now.toISOString());
  const url=new URL(collector.metURL(now));assert.match(url.pathname,/v1.1\/search/);assert.equal(url.searchParams.get('q'),'landscape');assert.equal(url.searchParams.get('hasImages'),'true');assert.ok(Number(url.searchParams.get('offset'))<=160);
  await refreshCatalog({fetcher,logger,dimensions:async()=>{measured++;return {width:3840,height:2160};}});assert.equal(measured,2);
});
test('failed responses preserve validated records and their last successful timestamp',async()=>{
  for(const fetcher of [async()=>{throw Error('offline');},async()=>({ok:false,status:429}),async()=>({ok:true,text:async()=>'',json:async()=>({data:[]})}),async()=>({ok:true,text:async()=>{throw Error('HTML');},json:async()=>{throw Error('JSON');}})]){
    const result=await refreshCatalog({now,previous:previous(),fetcher,logger});assert.equal(result.failures,2);assert.equal(feeds.normalizeCatalog(result.catalog).length,2);assert.equal(result.catalog.updatedAt.pepper,'2026-09-30T12:00:00Z');
  }
  const result=await refreshCatalog({previous:{version:99},fetcher:async()=>{throw Error('offline');},logger});assert.equal(feeds.normalizeCatalog(result.catalog).length,0);assert.equal(result.catalog.updatedAt.met,null);
  const partial=await refreshCatalog({previous:{version:1,records:{met:[met()]}},fetcher:fresh,logger,dimensions:async()=>{throw Error('bad JPEG');}});assert.equal(partial.failures,1);assert.equal(partial.catalog.records.met.length,1);
});
test('Met ingestion ignores invalid IDs, errors, private works, mismatched identities and unsafe originals',async()=>{
  const fetcher=async url=>({ok:true,text:async()=>html,json:async()=>{
    if(!url.includes('/objects/'))return {objectIDs:['bad',-1,1,2,3,4,5,6,7]};
    const id=Number(url.split('/').pop());if(id===1)throw Error('broken detail');
    return {...met(),objectID:id===2?999:id,isPublicDomain:id!==3,objectName:id===4?'Sculpture':'Painting',primaryImage:id===5?null:id===6?'https://evil.example/123.jpg':met().primaryImage,objectURL:'https://www.metmuseum.org/art/collection/search/'+id};
  }});
  const result=await refreshCatalog({fetcher,logger,dimensions:async()=>({width:3000,height:2000})});assert.equal(result.catalog.records.met.length,1);assert.equal(result.catalog.records.met[0].objectID,7);
});
test('bundled catalog has fully validated official sources with actual image sizes',()=>{
  const catalog=require('../source/wallpapers/data/official-feeds.json');
  for(const provider of Object.keys(feeds.providers)){assert.ok(catalog.records[provider].length>0);assert.equal(feeds.normalizeFeed(catalog.records[provider],provider).length,catalog.records[provider].length);}
});
