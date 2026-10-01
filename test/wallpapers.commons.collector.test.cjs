const {test}=require('node:test');
const assert=require('node:assert/strict');
const commons=require('../source/wallpapers/commons.js');
const {categoryURL,requestPage,refreshCommonsCatalog}=require('../scripts/refresh-wallpaper-commons.cjs');
const now=new Date('2026-10-02T00:00:00Z'),logger={log(){},warn(){}},wait=async()=>{};
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

test('first-page network, JSON, API and pagination failures preserve the previous category',async()=>{
  const previous=snapshot([record(1)],'resume');
  for(const fail of [async()=>{throw Error('offline');},async()=>({ok:false,status:429}),async()=>({ok:true,json:async()=>{throw Error('bad json');}}),async()=>({ok:true,json:async()=>({error:{code:'maxlag'}})}),async()=>({ok:true,json:async()=>({query:{pages:[]}})}),async()=>response([record(2)],'resume')]){
    const result=await refreshCommonsCatalog({previous,now,logger,wait,fetcher:fail});
    assert.equal(result.failures,5);assert.equal(result.catalog.updatedAt.anime,'old');assert.equal(result.catalog.continuation.anime,'resume');assert.deepEqual(result.catalog.records.anime.map(item=>item.pageid),[1]);
  }
  let pages=0;
  const cycling=await refreshCommonsCatalog({previous:snapshot(),now,logger,fetcher:async()=>response([record(2)],++pages%2?'a':'b')});
  assert.equal(cycling.failures,5);assert.deepEqual(cycling.catalog.records.anime.map(item=>item.pageid),[1,2]);
  assert.equal(cycling.catalog.continuation.anime,'b');assert.equal(cycling.catalog.updatedAt.anime,now.toISOString());
  for(const cursor of ['',0,null,'x'.repeat(1000)]){
    const invalid=await refreshCommonsCatalog({previous,now,logger,wait,fetcher:async()=>({ok:true,json:async()=>({query:{pages:{2:record(2)}},continue:{gcmcontinue:cursor}})})});
    assert.equal(invalid.failures,5);assert.deepEqual(invalid.catalog.records.anime.map(item=>item.pageid),[1]);assert.equal(invalid.catalog.continuation.anime,'resume');
  }
});

test('one failed source does not prevent other categories from refreshing',async()=>{
  const result=await refreshCommonsCatalog({previous:snapshot(),now,logger,wait,fetcher:async value=>{
    if(new URL(value).searchParams.get('gcmtitle')==='Category:Anime illustrations')throw Error('offline');return response([record(2)]);
  }});
  assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.anime.map(item=>item.pageid),[1]);assert.deepEqual(result.catalog.records.nature.map(item=>item.pageid),[2]);
  assert.equal(result.catalog.updatedAt.anime,'old');assert.equal(result.catalog.updatedAt.nature,now.toISOString());
});

test('transient request failures retry the same page with bounded backoff',async()=>{
  const delays=[],url=categoryURL('anime');let calls=0;
  const payload=await requestPage(async value=>{
    assert.equal(value,url);calls++;
    if(calls===1)return new Response('busy',{status:429,headers:{'retry-after':'7'}});
    if(calls===2)throw Error('temporary connection failure');
    return response([record(2)]);
  },url,{wait:async delay=>delays.push(delay)});
  assert.equal(calls,3);assert.deepEqual(delays,[7000,2000]);assert.equal(payload.query.pages[2].pageid,2);
  const lagDelays=[];let lagCalls=0;
  await requestPage(async()=>++lagCalls===1?{ok:true,json:async()=>({error:{code:'maxlag'}})}:response([]),url,{wait:async delay=>lagDelays.push(delay)});
  assert.equal(lagCalls,2);assert.deepEqual(lagDelays,[1000]);
  let permanentCalls=0;
  await assert.rejects(requestPage(async()=>{permanentCalls++;return {ok:false,status:403};},url,{wait}),/HTTP 403/);assert.equal(permanentCalls,1);
  let exhausted=0;
  await assert.rejects(requestPage(async()=>{exhausted++;throw Error('offline');},url,{wait}),/offline/);assert.equal(exhausted,3);
  let datedCalls=0;const datedDelays=[];
  await assert.rejects(requestPage(async()=>{datedCalls++;return new Response('busy',{status:503,headers:{'retry-after':new Date(Date.now()+60000).toUTCString()}});},url,{wait:async delay=>datedDelays.push(delay)}),/HTTP 503/);
  assert.equal(datedCalls,1);assert.deepEqual(datedDelays,[]);
  let longLimitCalls=0;
  await assert.rejects(requestPage(async()=>{longLimitCalls++;return new Response('busy',{status:429,headers:{'retry-after':'3600'}});},url,{wait}),/HTTP 429/);assert.equal(longLimitCalls,1);
});

test('request timeout also bounds a hanging JSON body and aborts each failed attempt',async()=>{
  const signals=[];
  await assert.rejects(requestPage(async(value,options)=>{signals.push(options.signal);return {ok:true,json:()=>new Promise(()=>{})};},categoryURL('anime'),{wait,timeout:5}),/请求超时/);
  assert.equal(signals.length,3);assert.ok(signals.every(signal=>signal.aborted));
});

test('a later failed page saves verified records and resumes at the last valid cursor',async()=>{
  const calls=[];
  const interrupted=await refreshCommonsCatalog({previous:snapshot([record(1),record(99)]),now,logger,wait,fetcher:async value=>{
    const url=new URL(value);calls.push(url);
    if(url.searchParams.has('gcmcontinue'))throw Error('offline');
    return response([record(1,'Copyrighted'),record(2)],'next-page');
  }});
  assert.equal(interrupted.failures,5);
  assert.equal(calls.length,20);
  for(const category of Object.keys(commons.categories)){
    assert.deepEqual(interrupted.catalog.records[category].map(item=>item.pageid),[99,2]);
    assert.equal(interrupted.catalog.continuation[category],'next-page');assert.equal(interrupted.catalog.updatedAt[category],now.toISOString());
  }
  const resumed=await refreshCommonsCatalog({previous:interrupted.catalog,now,logger,wait,fetcher:async value=>{
    assert.equal(new URL(value).searchParams.get('gcmcontinue'),'next-page');return response([record(3)]);
  }});
  assert.equal(resumed.failures,0);assert.deepEqual(resumed.catalog.records.anime.map(item=>item.pageid),[99,2,3]);assert.equal(resumed.catalog.continuation.anime,null);
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
