const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../source/wallpapers/core.js');
const now=new Date('2026-10-01T12:00:00Z');
const art={id:123,title:'Landscape',accession_number:'1915.534',creators:[{description:'An artist'}],share_license_status:'CC0',images:{web:{url:'https://openaccess-cdn.clevelandart.org/1915.534/1915.534_web.jpg'},print:{url:'https://openaccess-cdn.clevelandart.org/1915.534/1915.534_print.jpg',width:'3000',height:'2000'}}};
function memory(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};}
const cacheKey='rabbit-wallpapers-art-v2';

test('day boundary uses Beijing time, regardless of host timezone',()=>{
  assert.equal(core.dayKey(new Date('2026-10-01T15:59:59Z')),'2026-10-01');
  assert.equal(core.dayKey(new Date('2026-10-01T16:00:00Z')),'2026-10-02');
  assert.throws(()=>core.dayKey(new Date('invalid')));
});
test('daily collection is reproducible, unique, and changes by day and batch',()=>{
  const items=core.dailyWallpapers(now);
  assert.equal(items.length,24);assert.equal(new Set(items.map(x=>x.id)).size,24);
  assert.deepEqual(items,core.dailyWallpapers(new Date('2026-10-01T01:00:00Z')));
  assert.notDeepEqual(items,core.dailyWallpapers(new Date('2026-10-02T12:00:00Z')));
  assert.notDeepEqual(items,core.dailyWallpapers(now,1));
  assert.equal(items.filter(x=>x.height>x.width).length,12);
  for(const value of [-1,NaN,.5,'1'])assert.throws(()=>core.dailyWallpapers(now,value));
  assert.equal(core.dailyWallpapers().length,24);
});
test('all four designs export deterministically, including portrait and 4K',()=>{
  for(const item of core.dailyWallpapers(now)){
    const svg=core.renderSVG(item,item.width,item.height);
    assert.equal(svg,core.renderSVG(item,item.width,item.height));
    assert.ok(svg.startsWith('<svg xmlns='));assert.ok(svg.endsWith('</svg>'));
    assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('undefined'));
    assert.match(svg,new RegExp('width="'+item.width+'" height="'+item.height+'"'));
  }
  assert.ok(core.renderSVG(core.dailyWallpapers(now)[0]));
  for(const item of [null,{palette:99,pattern:0,seed:1},{palette:0,pattern:99,seed:1},{palette:0,pattern:0,seed:'bad'}])assert.throws(()=>core.renderSVG(item));
  for(const size of [0,-1,8000,NaN,2.5])assert.throws(()=>core.renderSVG(core.dailyWallpapers(now)[0],size,540));
});
test('art ingestion requires explicit public-domain flag, usable dimensions and safe IDs',()=>{
  const items=core.normalizeArtworks([art,art,{...art,id:124,share_license_status:'Copyrighted'},{...art,id:125,share_license_status:true},{...art,id:126,accession_number:'../../evil'},{...art,id:127,images:{...art.images,print:{...art.images.print,width:800,height:600}}},null,{...art,id:'128'},{...art,id:129,images:{...art.images,print:{...art.images.print,width:2000,height:NaN}}},{...art,id:130,images:{...art.images,web:{url:'https://evil.example/image.jpg'}}},{...art,id:131,images:{...art.images,print:{url:'javascript:alert(1)'}}}]);
  assert.equal(items.length,1);assert.equal(items[0].license,'CC0');assert.equal(items[0].source,'art');
  assert.equal(items[0].pageUrl,'https://www.clevelandart.org/art/1915.534');
  assert.match(items[0].image,/^https:\/\/openaccess-cdn.clevelandart.org\//);
  assert.deepEqual(core.normalizeArtworks(null),[]);
  const unnamed=core.normalizeArtworks([{...art,title:null,creators:[null,{}],images:{...art.images,print:{...art.images.print,width:2000,height:3000}}}])[0];
  assert.equal(unnamed.title,'无题');assert.equal(unnamed.artist,'作者未注明');assert.ok(unnamed.tags.includes('竖屏'));
});
test('filter combines source, orientation, query and favorites',()=>{
  const daily=core.dailyWallpapers(now),items=[...daily,...core.normalizeArtworks([art])];
  assert.equal(core.filterWallpapers(items).length,25);
  assert.equal(core.filterWallpapers(items,{source:'original',orientation:'landscape'}).length,12);
  assert.equal(core.filterWallpapers(items,{source:'art',query:'LANDSCAPE'}).length,1);
  assert.equal(core.filterWallpapers(items,{orientation:'portrait'}).length,12);
  assert.equal(core.filterWallpapers(items,{query:' 山野 '}).length,6);
  assert.deepEqual(core.filterWallpapers(items,{favorites:new Set([daily[0].id])}),[daily[0]]);
  assert.deepEqual(core.filterWallpapers(items,{query:'does not exist'}),[]);
  assert.equal(core.filterWallpapers(items,{style:'柔光'}).length,6);
  assert.equal(core.filterWallpapers(items,{palette:'0'}).length,4);
  assert.equal(core.filterWallpapers(items,{style:'山野',palette:'1',orientation:'portrait'}).length,1);
  assert.equal(core.filterWallpapers(items,{source:'art',palette:'0'}).length,0);
  assert.equal(core.filterWallpapers(items,{palette:'unknown'}).length,0);
  assert.equal(core.filterWallpapers(items,{category:'nature'}).length,7);
  assert.equal(core.filterWallpapers(items,{category:'minimal'}).length,18);
  assert.equal(core.filterWallpapers(items,{category:'anime'}).length,0);
});
test('Chinese scene keywords match English titles and tags, while combined terms retain other filters',()=>{
  const item=(title,extra={})=>({id:title,title,artist:'Photo Author',tags:[],source:'commons',provider:'ayomi',categories:['anime'],width:1024,height:1536,...extra});
  const examples={猫耳:'Catgirl with Cat Ears',狐耳:'Foxgirl with Fox Ears',少女:'Girl with a Camera',教室:'Classroom Window',壁炉:'Nekomimi Girl Tending to Fireplace',读书:'Neko Girl Reads Book on a Couch',摩天轮:'Neko Girl Under Ferris Wheel Lights',抱猫:'Neko Girl Holds an Orange Kitten',海边:'Coastal Beach Scene',森林:'Forest and Woodland',山川:'Mountain Range',夜景:'Night Cityscape',雨夜:'Rainy City at Night',夕阳:'Sunset on a Lake',樱花:'Cherry Blossoms and Sakura',雪景:'Snowy Landscape',星空:'Starry Sky and Milky Way',神社:'Shrine in Spring',咖啡馆:'Coffee Shop and Café'};
  for(const [query,title] of Object.entries(examples))assert.deepEqual(core.filterWallpapers([item(title)],{query}),[item(title)]);
  for(const title of ['Café','Cafe','Cafes','Coffee Shop'])assert.equal(core.filterWallpapers([item(title)],{query:'咖啡馆'}).length,1);
  for(const [query,title] of [['猫耳','Cathedral Architecture'],['猫耳','Nekomimicry'],['狐耳','Foxtrot'],['森林','Forestier Portrait'],['教室','Classical Music'],['少女','Girlhood Memories'],['壁炉','Fireplacesque Design'],['读书','Girl Reading a Phone'],['读书','Book Covers on a Shelf'],['摩天轮','Ferris the Artist'],['抱猫','Catgirl Holds a Phone'],['抱猫','Cat and Kitten in a Park'],['雨夜','Rainy Afternoon'],['雨夜','Sunny Night'],['星空','Blue Sky'],['咖啡馆','Cafeteria']])assert.deepEqual(core.filterWallpapers([item(title)],{query}),[]);
  const combined=item('Catgirl Gazes Out Classroom Window'),unrelated=item('Catgirl on Beach'),landscape=item('Catgirl in Classroom',{id:'landscape',width:1920,height:1080});
  const records=[combined,unrelated,landscape];
  assert.deepEqual(core.filterWallpapers(records,{query:' 猫耳   教室 ',orientation:'portrait',provider:'ayomi',category:'anime'}),[combined]);
  assert.deepEqual(core.filterWallpapers(records,{query:'CATGIRL window'}),[combined]);
  assert.deepEqual(core.filterWallpapers(records,{query:'教室 Author',favorites:new Set([landscape.id])}),[landscape]);
  assert.deepEqual(core.filterWallpapers([item('Plain Landscape',{tags:['Cat Ears']})],{query:'猫耳'}).length,1);
  assert.deepEqual(core.filterWallpapers([item('Plain Landscape',{artist:'Catgirl Artist'})],{query:'猫耳'}),[]);
  assert.deepEqual(core.filterWallpapers([item('猫耳少女')],{query:'猫耳'}).length,1);
  assert.equal(core.filterWallpapers([item('Catgirl',{artist:null})],{query:'猫耳'}).length,1);
  assert.deepEqual(core.filterWallpapers(records,{query:'__proto__'}),[]);
  const fireplace=item('Blue Haired Nekomimi Girl Near Cozy Fireplace Interior Scene');
  assert.deepEqual(core.filterWallpapers([fireplace,item('Catgirl Holding Kitten')],{query:'猫耳 壁炉',orientation:'portrait',provider:'ayomi',category:'anime'}),[fireplace]);
});
test('fresh artwork request filters, deduplicates and saves a daily cache',async()=>{
  const storage=memory();let calledURL;
  const result=await core.loadArtworks({now,storage,fetcher:async url=>{calledURL=new URL(url);return {ok:true,json:async()=>({data:[art,art]})};}});
  assert.equal(result.state,'fresh');assert.equal(result.items.length,1);
  assert.equal(calledURL.searchParams.get('cc0'),'1');
  assert.equal(calledURL.searchParams.get('has_image'),'1');
  assert.equal(JSON.parse(storage.values.get(cacheKey)).day,'2026-10-01');
  const cached=await core.loadArtworks({now,storage,fetcher:()=>{throw Error('must not fetch');}});
  assert.equal(cached.state,'cached');assert.deepEqual(result.items,cached.items);
});
test('upstream failure keeps last successful data and does not overwrite cache',async()=>{
  const value=JSON.stringify({version:2,day:'2026-09-30',records:[art]});
  const storage=memory({[cacheKey]:value});
  for(const fetcher of [async()=>{throw Error('network');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({data:[]})}),async()=>({ok:true,json:async()=>{throw Error('invalid json');}})]){
    const result=await core.loadArtworks({now,storage,fetcher});
    assert.equal(result.state,'stale');assert.equal(result.items.length,1);assert.equal(storage.values.get(cacheKey),value);
  }
});
test('missing, corrupt, private or full storage does not break artwork loading',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({data:[art]})});
  for(const storage of [undefined,memory({[cacheKey]:'bad json'}),{getItem(){throw Error('private');},setItem(){throw Error('full');}},memory({[cacheKey]:JSON.stringify({version:99,records:[art]})})]){
    assert.equal((await core.loadArtworks({now,storage,fetcher})).state,'fresh');
  }
  const result=await core.loadArtworks({fetcher:async()=>({ok:true,json:async()=>({data:[]})})});
  assert.equal(result.state,'unavailable');assert.deepEqual(result.items,[]);
});
test('timeout aborts upstream and returns the fallback',async()=>{
  let signal;
  const result=await core.loadArtworks({now,timeout:10,fetcher:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  assert.equal(result.state,'unavailable');assert.equal(signal.aborted,true);
});
