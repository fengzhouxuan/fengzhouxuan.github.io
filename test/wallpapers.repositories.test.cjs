const {test}=require('node:test');
const assert=require('node:assert/strict');
const repositories=require('../source/wallpapers/repositories.js');
const feeds=require('../source/wallpapers/feeds.js');
const collector=require('../scripts/refresh-wallpaper-feeds.cjs');
const paths={librepixels:'wallpapers/[anime,nature]_librepixels_beautifulSkyAnime.jpg',folium:'Mobile/Nature/ForestPath.png',midjourney:'assets/pixel_art_cyberpunk_city_4d14a0.png'};
const record=provider=>({path:paths[provider],revision:'a'.repeat(40),width:2688,height:1536,license:repositories.sources[provider].license,licenseUrl:repositories.sources[provider].licenseUrl});
const logger={log(){},warn(){}};
const now=new Date('2026-10-01T12:00:00Z');
const agundurWork=(path='sunset-dreamer-4k.png',license='CC BY 4.0')=>({path,title:'Sunset Dreamer',description:'A red-haired anime traveler watches shooting stars over a lakeside town.',revision:'c'.repeat(40),width:3840,height:2160,license,licenseUrl:repositories.sources.agundur.licenses[license]});
const agundurMarkdown=works=>'# Wallpapers\n\nBuilt by somebody else. These wallpapers are built by [Agundur](https://www.agundur.de).\n\n## Wallpapers\n\n'+works.map(work=>'### '+work.title+'\n\n'+work.description+'\n\n- File: `'+work.path+'`\n- Resolution: 3840×2160\n- License: ['+(work.license==='CC BY-SA 4.0'?'CC BY-SA':work.license)+']('+work.licenseUrl+')\n').join('\n')+'\n## Usage\nAll other files remain reserved.\n';
function agundurFetcher(works,files=works){
  return async url=>({ok:true,json:async()=>url.includes('/contents/README.md')?{encoding:'base64',content:Buffer.from(agundurMarkdown(works)).toString('base64')}:{truncated:false,tree:files.map(work=>({type:'blob',path:work.path,sha:work.revision}))}});
}
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

test('Agundur normalizes individual image licenses, author titles and anime scene categories',()=>{
  const raw=agundurWork(),[item]=repositories.normalizeRepository([raw],'agundur');
  assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'agundur'),[item]);
  assert.equal(item.title,'Sunset Dreamer');assert.equal(item.artist,'Agundur');assert.equal(item.license,'CC BY 4.0');
  assert.ok(item.categories.includes('anime'));assert.ok(item.categories.includes('space'));assert.ok(item.categories.includes('city'));
  assert.ok(item.tags.includes('创作方式未注明'));assert.ok(!item.tags.includes('AI 插画'));assert.match(item.copyrightNotice,/等比例/);
  assert.deepEqual(repositories.categoriesFor('der-pfad-des-pinguins-4k.png','agundur','A samurai woman.'),['illustration','anime']);
  const shared=agundurWork('cyborg-tiger-kde-plasma-4k.png','CC BY-SA 4.0');
  assert.equal(repositories.normalizeRepository([shared],'agundur')[0].license,'CC BY-SA 4.0');
  for(const mutation of [r=>r.license='MIT',r=>r.licenseUrl='https://evil.example',r=>r.title='',r=>r.title='a'.repeat(101),r=>r.description='a'.repeat(3001),r=>r.path='previews/sunset-dreamer-4k.png']){const bad={...raw};mutation(bad);assert.deepEqual(repositories.normalizeRepository([bad],'agundur'),[]);}
  for(const path of ['new-file.png','Sunset-4k.png','../scene-4k.png','previews/scene-4k.png'])assert.equal(repositories.validPath(path,'agundur'),false);
});

test('Agundur declarations bind each exact file to its own license and reject ambiguous or changed structure',()=>{
  const first=agundurWork(),second={...agundurWork('cyborg-tiger-kde-plasma-4k.png','CC BY-SA 4.0'),title:'Cyborg Tiger'},markdown=agundurMarkdown([first,second]);
  assert.deepEqual(repositories.parseAgundurDeclaration(markdown),[first,second].map(({path,title,description,license,licenseUrl})=>({path,title,description,license,licenseUrl})));
  assert.equal(repositories.parseAgundurDeclaration(null),null);assert.equal(repositories.parseAgundurDeclaration('x'.repeat(100001)),null);
  assert.equal(repositories.parseAgundurDeclaration(markdown.replace('built by [Agundur]','built by [Other]')),null);
  assert.equal(repositories.parseAgundurDeclaration(markdown.replace('## Wallpapers','## Files')),null);
  assert.equal(repositories.parseAgundurDeclaration(agundurMarkdown([])),null);
  assert.equal(repositories.parseAgundurDeclaration(agundurMarkdown([first,first])),null);
  assert.equal(repositories.parseAgundurDeclaration(markdown.replace('- File: `sunset-dreamer-4k.png`','- File: `a-4k.png`\n- File: `b-4k.png`')),null);
  for(const change of [s=>s.replace('- License: [CC BY 4.0]','- License: [MIT]'),s=>s.replace('https://creativecommons.org/licenses/by/4.0/','https://evil.example'),s=>s.replace('- License: [CC BY 4.0]','Other: [CC BY 4.0]'),s=>s.replace('sunset-dreamer-4k.png','previews/sunset-dreamer-4k.png'),s=>s.replace('### Sunset Dreamer','### '+'a'.repeat(101))])assert.equal(repositories.parseAgundurDeclaration(change(markdown)).length,1);
});

test('Agundur synchronization only collects individually licensed originals, retaining unchanged dimensions',async()=>{
  const first=agundurWork(),second={...agundurWork('cyborg-tiger-kde-plasma-4k.png','CC BY-SA 4.0'),revision:'d'.repeat(40)},unlicensed={...agundurWork('unlicensed-4k.png'),revision:'e'.repeat(40)};
  const files=await collector.repositoryFiles('agundur',agundurFetcher([first,second],[first,second,unlicensed,{path:'previews/preview.jpg',revision:'f'.repeat(40)}]));
  assert.equal(files.length,2);assert.equal(files[1].license,'CC BY-SA 4.0');
  let measured=0;const options={providerIds:['agundur'],logger,now,dimensions:async()=>{measured++;return {width:3840,height:2160};}};
  const initial=await collector.refreshCatalog({...options,fetcher:agundurFetcher([first,second])});assert.equal(initial.failures,0);assert.equal(measured,2);
  const updated=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:agundurFetcher([{...first,title:'New Title'}])});
  assert.equal(measured,2);assert.equal(updated.catalog.records.agundur.length,1);assert.equal(updated.catalog.records.agundur[0].title,'New Title');
  const withdrawn=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:agundurFetcher([{...first,license:'All rights reserved',licenseUrl:'https://example.com/'}])});assert.equal(withdrawn.failures,0);assert.deepEqual(withdrawn.catalog.records.agundur,[]);
  const offline=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:async()=>{throw Error('offline');}});assert.equal(offline.failures,1);assert.deepEqual(offline.catalog.records.agundur,initial.catalog.records.agundur);
  const malformed=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:async()=>({ok:true,json:async()=>({encoding:'base64',content:Buffer.from('All rights reserved').toString('base64')})})});assert.equal(malformed.failures,1);assert.deepEqual(malformed.catalog.records.agundur,initial.catalog.records.agundur);
});
