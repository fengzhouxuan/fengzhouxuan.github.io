const {test}=require('node:test');
const assert=require('node:assert/strict');
const repositories=require('../source/wallpapers/repositories.js');
const feeds=require('../source/wallpapers/feeds.js');
const collector=require('../scripts/refresh-wallpaper-feeds.cjs');
const paths={librepixels:'wallpapers/[anime,nature]_librepixels_beautifulSkyAnime.jpg',folium:'Mobile/Nature/ForestPath.png',midjourney:'assets/pixel_art_cyberpunk_city_4d14a0.png'};
const record=provider=>({path:paths[provider],revision:'a'.repeat(40),width:2688,height:1536,license:repositories.sources[provider].license,licenseUrl:repositories.sources[provider].licenseUrl});
const logger={log(){},warn(){}};
const now=new Date('2026-10-01T12:00:00Z');
function fetcherFor(provider,files=[record(provider)]){
  return async url=>({ok:true,json:async()=>{
    if(url.includes('/contents/'))return {encoding:'base64',content:Buffer.from(provider==='folium'?'The wallpapers uploaded to this repo are released under CC:BY 4.0 licence':'CC0 1.0 Universal').toString('base64')};
    const entries=files.map(file=>({type:'blob',path:file.path,sha:file.revision,id:file.revision}));
    return provider==='librepixels'?entries:{tree:entries,truncated:false};
  },text:async()=>'All wallpapers are free to use under CC0 1.0 Universal'});
}

test('repository paths, authors and licenses are bound to their approved sources',()=>{
  for(const provider of Object.keys(paths)){
    const raw=record(provider),[item]=repositories.normalizeRepository([raw,raw],provider);
    assert.equal(repositories.normalizeRepository([raw,raw],provider).length,1);
    assert.deepEqual(feeds.normalizeFeed([item.feedRecord],provider),[item]);
    assert.equal(item.artist,repositories.sources[provider].artist);
    assert.equal(item.license,repositories.sources[provider].license);
    assert.deepEqual(repositories.urlsFor(raw.path,provider),{image:item.image,download:item.download,pageUrl:item.pageUrl,...(item.fallbackImage?{fallbackImage:item.fallbackImage}:{})});
    assert.ok(item.pageUrl.startsWith('https://'+repositories.sources[provider].host+'.com/'+repositories.sources[provider].repo+'/'));
    for(const mutate of [r=>r.revision='bad',r=>r.license='MIT',r=>r.licenseUrl='https://evil.example',r=>r.width=1024,r=>r.height=0,r=>r.height=Infinity,r=>r.width=30001,r=>r.path='../'+r.path]){
      const bad=record(provider);mutate(bad);assert.deepEqual(repositories.normalizeRepository([bad],provider),[]);
    }
  }
  assert.deepEqual(repositories.normalizeRepository([null],'folium'),[]);
  assert.equal(repositories.normalizeRepository([record('folium'),{...record('folium'),path:'Nature/copy.png'}],'folium').length,1);
  assert.deepEqual(repositories.normalizeRepository(null,'folium'),[]);
  assert.deepEqual(repositories.normalizeRepository([],'unknown'),[]);
  assert.equal(repositories.urlsFor(paths.folium,'unknown'),null);
  assert.equal(repositories.urlsFor('../bad.png','folium'),null);
  for(const path of ['Nature//bad.png','Nature/./bad.png','Nature/bad\\name.png','Nature/bad.png?x=1','Nature/evil#name.png','Nature/bad\u0000.png','Other/file.png','Nature/file.svg','Nature/nude.png'])assert.equal(repositories.validPath(path,'folium'),false);
  assert.equal(repositories.validPath('assets/nested/file.png','midjourney'),false);
  for(const path of ['wallpapers/[anime]_librepixels_luffy.jpg','wallpapers/[anime]_librepixels_mariobros.webp','wallpapers/[anime]_someone_else_samurai.jpg'])assert.equal(repositories.validPath(path,'librepixels'),false);
});

test('categories derive from source tags and content, with readable titles',()=>{
  assert.deepEqual(repositories.categoriesFor(paths.librepixels,'librepixels'),['anime','illustration','nature']);
  assert.deepEqual(repositories.categoriesFor(paths.folium,'folium'),['nature']);
  assert.deepEqual(repositories.categoriesFor('Abstract/GrayShapes.png','folium'),['abstract']);
  assert.deepEqual(repositories.categoriesFor(paths.midjourney,'midjourney'),['illustration','pixel','cyberpunk','city']);
  assert.deepEqual(repositories.categoriesFor('assets/anime_car_123abc.png','midjourney'),['illustration','anime','cars']);
  assert.deepEqual(repositories.categoriesFor('wallpapers/[unknown]_librepixels_a.jpg','librepixels'),['illustration']);
  assert.equal(repositories.normalizeRepository([record('folium')],'folium')[0].title,'Forest Path');
});

test('source rotation keeps every image once and gives the first screen variety',()=>{
  const items=['pepper','met','folium'].flatMap(provider=>Array.from({length:8},(_,index)=>({id:provider+index,provider})));
  const result=feeds.mixSources(items,'2026-10-01');
  assert.deepEqual(new Set(result.map(item=>item.id)),new Set(items.map(item=>item.id)));
  assert.equal(new Set(result.slice(0,3).map(item=>item.provider)).size,3);
  assert.deepEqual(result,feeds.mixSources(items,'2026-10-01'));
  assert.notDeepEqual(result,feeds.mixSources(items,'2026-10-02'));
  assert.deepEqual(feeds.mixSources([]),[]);
  assert.equal(feeds.mixSources([{source:'commons',collection:'anime'},{source:'commons',collection:'city'},{source:'original'}]).length,3);
});

test('PNG and all common WebP headers expose native dimensions without downloading the image',()=>{
  const png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);png.write('IHDR',12);png.writeUInt32BE(3840,16);png.writeUInt32BE(2160,20);
  assert.deepEqual(collector.imageDimensions(png),{width:3840,height:2160});assert.equal(collector.imageDimensions(png.subarray(0,23)),null);
  const webp=()=>{const bytes=Buffer.alloc(30);bytes.write('RIFF');bytes.write('WEBP',8);return bytes;};
  const extended=webp();extended.write('VP8X',12);extended.writeUIntLE(2687,24,3);extended.writeUIntLE(1535,27,3);
  assert.deepEqual(collector.imageDimensions(extended),{width:2688,height:1536});
  const lossy=webp();lossy.write('VP8 ',12);lossy.set([157,1,42],23);lossy.writeUInt16LE(2688,26);lossy.writeUInt16LE(1536,28);
  assert.deepEqual(collector.imageDimensions(lossy),{width:2688,height:1536});
  const lossless=webp();lossless.write('VP8L',12);lossless[20]=47;lossless.writeUInt32LE(2687+(1535<<14),21);
  assert.deepEqual(collector.imageDimensions(lossless),{width:2688,height:1536});assert.equal(collector.imageDimensions(webp()),null);
});

test('repository collection validates licenses, reuses unchanged dimensions and removes missing files',async()=>{
  for(const provider of Object.keys(paths)){
    const old=record(provider),fresh={...old,revision:'b'.repeat(40)};
    let measured=0;
    const previous={version:1,records:{[provider]:[old]},updatedAt:{[provider]:'2026-09-30T12:00:00Z'}};
    const options={providerIds:[provider],previous,now,logger,dimensions:async()=>{measured++;return {width:2688,height:1536};}};
    const unchanged=await collector.refreshCatalog({...options,fetcher:fetcherFor(provider)});
    assert.equal(measured,0);assert.equal(unchanged.failures,0);assert.equal(unchanged.catalog.records[provider].length,1);
    const changed=await collector.refreshCatalog({...options,fetcher:fetcherFor(provider,[fresh])});
    assert.equal(measured,1);assert.equal(changed.catalog.records[provider][0].revision,fresh.revision);
    const replacement={...fresh,path:provider==='librepixels'?'wallpapers/[nature]_librepixels_new.jpg':provider==='folium'?'Nature/new.png':'assets/new.png'};
    const replaced=await collector.refreshCatalog({...options,fetcher:fetcherFor(provider,[replacement])});
    assert.equal(replaced.catalog.records[provider].length,1);assert.equal(replaced.catalog.records[provider][0].path,replacement.path);
    const failed=await collector.refreshCatalog({...options,fetcher:fetcherFor(provider,[fresh]),dimensions:async()=>{throw Error('offline');}});
    assert.equal(failed.failures,1);assert.equal(failed.catalog.updatedAt[provider],previous.updatedAt[provider]);assert.deepEqual(failed.catalog.records[provider],[old]);
    const empty=await collector.refreshCatalog({...options,fetcher:fetcherFor(provider,[])});assert.equal(empty.failures,0);assert.deepEqual(empty.catalog.records[provider],[]);
  }
  await assert.rejects(collector.refreshCatalog({providerIds:['unknown']}),/不存在/);
});

test('changed licenses, incomplete trees and unexpected API data fail without deleting the previous catalog',async()=>{
  for(const provider of Object.keys(paths)){
    for(const mode of ['license','tree','offline']){
      const base=fetcherFor(provider);
      const broken=async url=>{
        if(mode==='offline')throw Error('offline');
        if(mode==='license')return {ok:true,text:async()=>'All rights reserved',json:async()=>({encoding:'base64',content:Buffer.from('All rights reserved').toString('base64')})};
        if(url.includes('/tree'))return {ok:true,json:async()=>provider==='librepixels'?{}:{tree:[],truncated:true}};
        return base(url);
      };
      const previous={version:1,records:{[provider]:[record(provider)]}};
      const result=await collector.refreshCatalog({providerIds:[provider],previous,fetcher:broken,logger});
      assert.equal(result.failures,1);assert.deepEqual(result.catalog.records[provider],[record(provider)]);
    }
  }
  await assert.rejects(collector.repositoryFiles('folium',async()=>({ok:true,json:async()=>({})})),/核对/);
});
test('a failed primary image CDN retries the same licensed file through its alternate CDN',async()=>{
  const attempts=[];
  const result=await collector.refreshCatalog({providerIds:['folium'],fetcher:fetcherFor('folium'),logger,dimensions:async(fetcher,url)=>{
    attempts.push(url);if(new URL(url).hostname==='cdn.jsdelivr.net')throw Error('CDN unavailable');return {width:3840,height:2160};
  }});
  assert.equal(result.failures,0);assert.equal(result.catalog.records.folium.length,1);assert.equal(attempts.length,2);
  assert.equal(new URL(attempts[1]).hostname,'fastly.jsdelivr.net');assert.equal(new URL(attempts[0]).pathname,new URL(attempts[1]).pathname);
});

test('GitLab pagination reads complete directories and refuses endless listings',async()=>{
  let pages=0;
  const fetcher=async url=>({ok:true,text:async()=>'All wallpapers are free to use under CC0 1.0',json:async()=>{pages++;return pages===1?Array.from({length:100},(_,index)=>({type:index?'tree':'blob',path:paths.librepixels,id:'a'.repeat(40)})):[];}});
  assert.equal((await collector.repositoryFiles('librepixels',fetcher)).length,1);assert.equal(pages,2);
  await assert.rejects(collector.repositoryFiles('librepixels',async()=>({ok:true,text:async()=>'All wallpapers are free to use under CC0 1.0',json:async()=>Array.from({length:100},()=>({type:'tree'}))})),/完整/);
});

test('museum pagination accumulates unique approved works across successful refreshes',async()=>{
  const met=id=>({objectID:id,title:'Landscape '+id,artistDisplayName:'Artist',isPublicDomain:true,objectName:'Painting',width:3000,height:2000,primaryImage:'https://images.metmuseum.org/CRDImages/ep/original/'+id+'.jpg',primaryImageSmall:'https://images.metmuseum.org/CRDImages/ep/web-large/'+id+'.jpg',objectURL:'https://www.metmuseum.org/art/collection/search/'+id});
  const previous={version:1,records:{met:[met(1)]}};
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/objects/')?met(2):{objectIDs:[2]}});
  const options={providerIds:['met'],previous,fetcher,logger,dimensions:async()=>({width:3000,height:2000})};
  const first=await collector.refreshCatalog(options);assert.deepEqual(first.catalog.records.met.map(item=>item.objectID),[1,2]);
  const second=await collector.refreshCatalog({...options,previous:first.catalog});assert.equal(second.catalog.records.met.length,2);
});
