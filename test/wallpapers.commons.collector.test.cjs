const {test}=require('node:test');
const assert=require('node:assert/strict');
const commons=require('../source/wallpapers/commons.js');
const {categoryURL,refreshCommonsCatalog}=require('../scripts/refresh-wallpaper-commons.cjs');
const now=new Date('2026-10-02T00:00:00Z'),logger={log(){},warn(){}};
function record(id,license='CC0'){
  return {pageid:id,title:'File:Landscape '+id+'.jpg',imageinfo:[{width:3840,height:2160,mime:'image/jpeg',url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/'+id+'.jpg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/'+id+'.jpg/960px-'+id+'.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:'+id+'.jpg',extmetadata:{LicenseShortName:{value:license}}}]};
}
function response(records,cursor){return {ok:true,json:async()=>({query:{pages:Object.fromEntries(records.map(item=>[item.pageid,item]))},...(cursor?{continue:{gcmcontinue:cursor}}:{})})};}
function snapshot(records=[record(1)],continuation=null){return {version:1,updatedAt:Object.fromEntries(Object.keys(commons.categories).map(category=>[category,'old'])),continuation:Object.fromEntries(Object.keys(commons.categories).map(category=>[category,continuation])),records:Object.fromEntries(Object.keys(commons.categories).map(category=>[category,records]))};}

test('category requests are confined to file pages and require valid pagination cursors',()=>{
  const url=new URL(categoryURL('nature','file|50'));
  assert.equal(url.hostname,'commons.wikimedia.org');assert.equal(url.searchParams.get('gcmtitle'),'Category:Featured pictures of landscapes');
  assert.equal(url.searchParams.get('gcmnamespace'),'6');assert.equal(url.searchParams.get('gcmlimit'),'50');assert.equal(url.searchParams.get('gcmcontinue'),'file|50');
  assert.match(url.searchParams.get('iiprop'),/mime.*extmetadata/);assert.equal(url.searchParams.get('maxlag'),'5');
  assert.throws(()=>categoryURL('unknown'),/分类不存在/);
  for(const cursor of ['',3,'x'.repeat(1000)])assert.throws(()=>categoryURL('anime',cursor),/游标无效/);
});

test('complete pagination deduplicates files, checks licenses and removes deleted records',async()=>{
  const requests=[];
  const result=await refreshCommonsCatalog({previous:snapshot([record(99)]),now,logger,fetcher:async(value,options)=>{
    const url=new URL(value);requests.push(url);assert.ok(options.signal);assert.match(options.headers['User-Agent'],/RabbitWallpaperStation/);
    return url.searchParams.has('gcmcontinue')?response([record(1),record(3),record(4,'Copyrighted')]):response([record(1),record(2)],'second');
  }});
  assert.equal(requests.length,10);assert.equal(result.failures,0);
  for(const category of Object.keys(commons.categories)){
    assert.deepEqual(result.catalog.records[category].map(item=>item.pageid),[1,2,3]);assert.equal(result.catalog.continuation[category],null);assert.equal(result.catalog.updatedAt[category],now.toISOString());
  }
});

test('page budgets save a cursor and resume without discarding earlier pages',async()=>{
  const first=await refreshCommonsCatalog({now,logger,maxPages:1,fetcher:async()=>response([record(1)],'second')});
  assert.equal(first.catalog.continuation.anime,'second');
  const resumed=await refreshCommonsCatalog({previous:first.catalog,now,logger,maxPages:1,fetcher:async value=>{
    assert.equal(new URL(value).searchParams.get('gcmcontinue'),'second');return response([record(2)]);
  }});
  assert.deepEqual(resumed.catalog.records.anime.map(item=>item.pageid),[1,2]);assert.equal(resumed.catalog.continuation.anime,null);
  const restarted=await refreshCommonsCatalog({previous:resumed.catalog,now,logger,fetcher:async value=>{
    assert.equal(new URL(value).searchParams.has('gcmcontinue'),false);return response([record(2)]);
  }});
  assert.deepEqual(restarted.catalog.records.anime.map(item=>item.pageid),[2]);
});

test('changed licenses encountered during a resumed run remove that file',async()=>{
  const result=await refreshCommonsCatalog({previous:snapshot([record(1),record(2)],'second'),now,logger,fetcher:async()=>response([record(2,'Copyrighted'),record(3)])});
  assert.deepEqual(result.catalog.records.anime.map(item=>item.pageid),[1,3]);
});

test('network, JSON, API and pagination failures preserve the last complete category',async()=>{
  const previous=snapshot([record(1)],'resume');
  for(const fail of [async()=>{throw Error('offline');},async()=>({ok:false,status:429}),async()=>({ok:true,json:async()=>{throw Error('bad json');}}),async()=>({ok:true,json:async()=>({error:{code:'maxlag'}})}),async()=>({ok:true,json:async()=>({query:{pages:[]}})}),async()=>response([record(2)],'resume')]){
    const result=await refreshCommonsCatalog({previous,now,logger,fetcher:fail});
    assert.equal(result.failures,5);assert.equal(result.catalog.updatedAt.anime,'old');assert.equal(result.catalog.continuation.anime,'resume');assert.deepEqual(result.catalog.records.anime.map(item=>item.pageid),[1]);
  }
  let pages=0;
  const cycling=await refreshCommonsCatalog({previous:snapshot(),now,logger,fetcher:async()=>response([record(2)],++pages%2?'a':'b')});
  assert.equal(cycling.failures,5);assert.deepEqual(cycling.catalog.records.anime.map(item=>item.pageid),[1]);
});

test('one failed source does not prevent other categories from refreshing',async()=>{
  const result=await refreshCommonsCatalog({previous:snapshot(),now,logger,fetcher:async value=>{
    if(new URL(value).searchParams.get('gcmtitle')==='Category:Anime illustrations')throw Error('offline');return response([record(2)]);
  }});
  assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.anime.map(item=>item.pageid),[1]);assert.deepEqual(result.catalog.records.nature.map(item=>item.pageid),[2]);
  assert.equal(result.catalog.updatedAt.anime,'old');assert.equal(result.catalog.updatedAt.nature,now.toISOString());
});

test('invalid budgets are rejected and empty or malformed previous data fails safely',async()=>{
  for(const maxPages of [0,-1,101,1.5])await assert.rejects(refreshCommonsCatalog({maxPages}),/预算无效/);
  const result=await refreshCommonsCatalog({previous:{version:99,records:{anime:[record(1)]}},now,logger,fetcher:async()=>response([record(2,'Copyrighted')])});
  assert.equal(result.failures,5);assert.deepEqual(result.catalog.records.anime,[]);
  const cleared=await refreshCommonsCatalog({previous:snapshot(),now,logger,fetcher:async()=>response([])});
  assert.equal(cleared.failures,0);assert.deepEqual(cleared.catalog.records.anime,[]);
  const invalid=await refreshCommonsCatalog({previous:snapshot([record(1)],3),now,logger,fetcher:async()=>response([record(2)])});
  assert.equal(invalid.failures,5);assert.equal(invalid.catalog.continuation.anime,null);
});
