const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp');
const {parseDocument}=require('htmlparser2');
const eso=require('../source/wallpapers/eso.js'),feeds=require('../source/wallpapers/feeds.js'),previews=require('../source/wallpapers/previews.js');
const {galleryURL,policyLicensed,parseGallery,parseCredit,parseWork,positionsFor,collectESO}=require('../scripts/collect-eso.cjs');
const {refreshCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs');
const {buildPreviews,copyAuthorPreview}=require('../scripts/build-wallpaper-previews.cjs');
const {verifyRelease}=require('../scripts/verify-wallpaper-release.cjs');
const now=new Date('2026-10-02T12:00:00Z'),modified='Fri, 02 Oct 2026 00:00:00 GMT',logger={log(){},warn(){}};
const groups=Object.keys(eso.groups),workURL=id=>eso.origin+'/public/images/'+id+'/';
const policy='<div id="body">Unless specifically noted, the images, videos, and music distributed on the public ESO website <a href="'+eso.source.licenseUrl+'">Creative Commons Attribution 4.0 International License</a> with the wording unaltered. Links should be active if the credit is online.</div>';
function gallery(group,page=1,total=3){
  const links=Array.from({length:Math.min(50,total-(page-1)*50)},(_,index)=>workURL(group+'-'+((page-1)*50+index)));
  return '<h1>Image Archive: '+({nebulae:'Nebulae',galaxies:'Galaxies',starclusters:'Star Clusters'})[group]+'</h1><script>var images = ['+links.map(url=>"{url: '"+new URL(url).pathname+"',},").join('')+'];</script><p>Showing '+((page-1)*50+1)+' to '+Math.min(page*50,total)+' of '+total+'</p>'+(page*50<total?'<a href="'+new URL(galleryURL(group,page+1)).pathname+'">Next</a>':'');
}
function work(id='nebulae-0',group='nebulae',{credit='<p>ESO/<a href="https://author.example/">Alice</a>. Acknowledgement: Bob</p>',format='publicationjpg',type='Observation',title='Glittering stars',licensed=true,extra=''}={}){
  return '<meta property="og:url" content="'+workURL(id)+'"><div class="left-column"><h1>'+title+'</h1><div class="credit">'+credit+'</div><div class="copyright">'+(licensed?'<a href="/public/outreach/copyright/">Usage</a>':'All rights reserved')+'</div>'+extra+'</div><div class="object-info"><h3>About the Image</h3><table><tr><td>Id:</td><td>'+id+'</td></tr><tr><td>Type:</td><td>'+type+'</td></tr><tr><td>Category:</td><td><a href="'+new URL(galleryURL(group)).pathname+'">Category</a></td></tr></table></div><span class="archive_dl_text"><a href="'+eso.imageOrigin+'/images/'+format+'/'+id+'.jpg">'+(format==='publicationjpg'?'Publication JPEG':'Large JPEG')+'</a></span><span class="archive_dl_text"><a href="'+eso.imageOrigin+'/images/screen/'+id+'.jpg">Screensize JPEG</a></span>';
}
const raw=(id='nebulae-0',group='nebulae')=>({...parseWork(work(id,group),workURL(id),group),width:1920,height:1080,imageWidth:1280,imageHeight:720,modified,previewModified:modified,revision:'a'.repeat(64)});
function resources(total=3){
  const map=new Map([[eso.origin+'/robots.txt','User-agent: *\nDisallow: /secure'],[eso.imageOrigin+'/robots.txt',{status:404}],[eso.licenseSource,policy]]);
  for(const group of groups){
    for(let page=1;page<=Math.ceil(total/50);page++)map.set(galleryURL(group,page),gallery(group,page,total));
    for(let i=0;i<total;i++)map.set(workURL(group+'-'+i),work(group+'-'+i,group));
  }
  return map;
}
function fetcher(map,calls=[]){return async(url,options={})=>{
  calls.push({url,method:options.method});assert.ok(options.signal);assert.equal(options.redirect,'error');assert.match(options.headers['User-Agent'],/WallpaperStation/);
  const value=map.get(url);if(value instanceof Error)throw value;
  if(value?.status)return new Response(null,{status:value.status,headers:value.headers});
  if(options.method==='HEAD')return new Response(null,{headers:{'content-type':'image/jpeg','content-length':'1024','last-modified':modified}});
  return new Response(value||'Missing',{status:value===undefined?404:200});
};}
const dimensions=async(fetcher,url)=>url.includes('/screen/')?{width:1280,height:720}:{width:1920,height:1080};
const sync=options=>collectESO({now,logger,dimensions,wait:async()=>{},...options});

test('ESO policy is bound to the current image license and visible linked credit requirements',()=>{
  assert.equal(policyLicensed(policy),true);assert.equal(policyLicensed(policy.replace('https://creativecommons','http://creativecommons')),true);
  for(const html of ['',policy.replace('id="body"','id="other"'),policy.replace('/by/4.0/','/by-nc/4.0/'),policy.replace('with the wording unaltered','credit optional'),policy.replace('Links should be active','Links can be hidden')])assert.equal(policyLicensed(html),false);
});
test('ESO archive parsing checks category, exact page counts, duplicate IDs and observed next links without executing source scripts',()=>{
  assert.equal(galleryURL('nebulae'),eso.origin+'/public/images/archive/category/nebulae/');
  assert.equal(parseGallery(gallery('nebulae',1,53),'nebulae').links.length,50);assert.equal(parseGallery(gallery('nebulae',2,53),'nebulae',2).links.length,3);
  for(const [html,group,page] of [[null,'nebulae',1],[gallery('nebulae'),'unknown',1],[gallery('nebulae'),'nebulae',0],[gallery('nebulae'),'nebulae',2],[gallery('nebulae').replace('nebulae-1','nebulae-0'),'nebulae',1],[gallery('nebulae').replace('of 3','of 4'),'nebulae',1],[gallery('nebulae')+'<script>var images = [];</script>','nebulae',1],[gallery('nebulae',1,53).replace('>Next<','>Other<'),'nebulae',1],[gallery('nebulae').replace('];',' ]; globalThis.executed=true;'),'nebulae',1]])assert.throws(()=>parseGallery(html,group,page));
  assert.equal(globalThis.executed,undefined);
});
test('ESO retains complete credit wording, acknowledgements and safe active links',()=>{
  const credit=parseCredit(parseDocument('<div><p> ESO/<a href="/public/">Alice</a>.\n Acknowledgement: <span>Bob</span></p></div>').children[0]);
  assert.equal(credit.artist,'ESO/Alice. Acknowledgement: Bob');assert.equal(credit.creditParts[1].href,eso.origin+'/public/');
  const legacy=parseCredit(parseDocument('<div><p>ESO/<a href="../../../../%7Eauthor">Author</a></p><p><input type="hidden" onclick="globalThis.executed=true"></p></div>').children[0],workURL('nebulae-0'));assert.equal(legacy.artist,'ESO/Author');assert.equal(legacy.creditParts[1].href,eso.origin+'/%7Eauthor');assert.equal(globalThis.executed,undefined);
  const multiline=parseCredit(parseDocument('<div><p>ESO/J. Author<br>Acknowledgment: Observatory</p></div>').children[0]);assert.equal(multiline.artist,'ESO/J. Author Acknowledgment: Observatory');
  for(const html of ['<div><script>bad</script></div>','<div><a href="javascript:bad">Name</a></div>','<div></div>'])assert.throws(()=>parseCredit(parseDocument(html).children[0]));
  for(const value of [null,[],[{text:'ESO',href:'javascript:bad'}],[{text:'<b>ESO</b>'}],[{text:'Other'}],[{text:'ESO',href:'https://user:secret@evil.example'}]])assert.equal(eso.creditParts(value,'ESO'),null);
  for(const value of [null,'javascript:bad','https://user:secret@example.test', 'data:text/html,hello'])assert.equal(eso.creditURL(value),null);
  assert.equal(eso.creditURL('http://author.example/'),'http://author.example/');assert.equal(eso.creditParts([{text:'ESO'}],''),null);
});
test('ESO work parsing binds official ID, observation category, explicit file links and per-work exceptions',()=>{
  const record=parseWork(work(),workURL('nebulae-0'),'nebulae');assert.equal(record.format,'publicationjpg');assert.equal(record.artist,'ESO/Alice. Acknowledgement: Bob');
  assert.equal(parseWork(work('nebulae-0','nebulae',{format:'large'}),record.pageUrl,'nebulae').format,'large');
  for(const html of [work('nebulae-0','nebulae',{licensed:false}),work('nebulae-0','nebulae',{type:'Illustration'}),work('nebulae-0','nebulae',{title:'Annotated chart'}),work('nebulae-0','nebulae',{extra:'CC BY-NC 4.0'}),work().replace('Publication JPEG','Unknown'),work().replace('Screensize JPEG','Unknown')])assert.equal(parseWork(html,record.pageUrl,'nebulae'),null);
  assert.equal(parseWork(work(),record.pageUrl,'galaxies'),null);assert.equal(parseWork(work(),'https://other.example/','nebulae'),null);assert.equal(parseWork(work(),record.pageUrl,'__proto__'),null);
  for(const html of ['',work().replace('nebulae-0/','other/'),work().replace('<td>nebulae-0</td>','<td>other</td>'),work().replace('class="credit"','class="other"'),work().replace('<h1>','<h2>').replace('</h1>','</h2>')])assert.throws(()=>parseWork(html,record.pageUrl,'nebulae'));
});
test('ESO normalized records enforce licenses, native file dimensions and source host bindings',()=>{
  const record=raw(),[item]=eso.normalizeRecords([record,record]);assert.equal(item.id,'eso-nebulae-0');assert.deepEqual(item.categories,['space']);assert.ok(item.tags.includes('星云'));assert.match(item.copyrightNotice,/Publication JPEG/);assert.deepEqual(feeds.normalizeFeed([record],'eso'),[item]);
  for(const change of [{workID:'../evil'},{group:'__proto__'},{type:'Illustration'},{license:'CC0'},{licenseUrl:eso.origin},{licenseSource:item.pageUrl},{title:'Chart'},{artist:'Other'},{pageUrl:item.pageUrl+'?x=1'},{width:1599},{height:799},{imageWidth:1250},{width:50000},{width:10000,height:10000},{revision:'bad'},{modified:'bad'},{previewModified:null},{format:'screen'},{download:item.download.replace('cdn.eso.org','evil.example')},{image:item.image.replace('screen','wallpaper3')}])assert.deepEqual(eso.normalizeRecords([{...record,...change}]),[]);
  assert.deepEqual(eso.normalizeRecords(null),[]);assert.deepEqual(eso.normalizeRecords([null]),[]);assert.equal(eso.workURL(null),null);assert.equal(eso.imageURL(record.image,'../evil','screen'),null);assert.equal(eso.imageURL(record.image,'nebulae-0','unknown'),null);
  assert.equal(eso.normalizeRecords([{...record,format:'large',download:record.download.replace('publicationjpg','large')}])[0].format,'large');
});
test('ESO sync paces discovery, respects its work budget and resumes all three category offsets',async()=>{
  const map=resources(),calls=[],delays=[],first=await sync({fetcher:fetcher(map,calls),maxWorks:4,wait:async value=>delays.push(value)});
  assert.equal(first.records.length,4);assert.equal(first.updated,true);assert.equal(first.interrupted,false);assert.deepEqual(first.continuation.positions,{nebulae:{page:1,offset:2},galaxies:{page:1,offset:1},starclusters:{page:1,offset:1}});
  assert.equal(delays.length,calls.length-1);assert.ok(delays.every(value=>value===1000));
  const second=await sync({old:eso.normalizeRecords(first.records),continuation:first.continuation,fetcher:fetcher(map),maxWorks:3});assert.equal(second.records.length,7);assert.deepEqual(second.continuation.positions.nebulae,{page:1,offset:0});
  let measured=0;const third=await sync({old:eso.normalizeRecords(first.records),fetcher:fetcher(map),maxWorks:3,dimensions:async()=>{measured++;assert.fail('same source metadata should reuse sizes');}});assert.equal(measured,0);assert.equal(third.records.length,4);
});
test('ESO cursor visits later pages, wraps after completion and resets removed or malformed page positions',async()=>{
  const map=resources(53),continuation={positions:Object.fromEntries(groups.map(group=>[group,{page:1,offset:49}]))};
  const result=await sync({fetcher:fetcher(map),maxWorks:6,continuation});assert.equal(result.records.length,6);assert.equal(result.continuation.positions.nebulae.page,2);assert.equal(result.continuation.positions.nebulae.offset,1);
  const wrapped=await sync({fetcher:fetcher(map),maxWorks:3,continuation:{positions:Object.fromEntries(groups.map(group=>[group,{page:2,offset:2}]))}});assert.deepEqual(wrapped.continuation.positions.nebulae,{page:1,offset:0});
  const reset=await sync({fetcher:fetcher(resources()),maxWorks:3,continuation:{positions:{nebulae:{page:4,offset:2},galaxies:{page:1,offset:40}}}});assert.equal(reset.records.length,3);
  assert.deepEqual(positionsFor({positions:{nebulae:{page:-1,offset:-1},galaxies:{page:NaN},starclusters:{page:1,offset:50}}}),positionsFor(null));
});
test('ESO sync retains unavailable records and removes successfully confirmed ineligible files',async()=>{
  const map=resources(),old=eso.normalizeRecords([raw()]);map.set(workURL('nebulae-0'),Error('Offline'));
  const failed=await sync({fetcher:fetcher(map),maxWorks:3,old});assert.deepEqual(failed.records.find(r=>r.workID==='nebulae-0'),old[0].feedRecord);
  map.set(workURL('nebulae-0'),work('nebulae-0','nebulae',{licensed:false}));assert.equal((await sync({fetcher:fetcher(map),maxWorks:3,old})).records.some(r=>r.workID==='nebulae-0'),false);
  map.set(workURL('nebulae-0'),work());const small=await sync({fetcher:fetcher(map),maxWorks:3,old,dimensions:async()=>({width:1000,height:700})});assert.equal(small.records.length,0);
  map.set(eso.imageOrigin+'/images/publicationjpg/nebulae-0.jpg',{status:404});const unavailable=await sync({fetcher:fetcher(map),maxWorks:3,old});assert.ok(unavailable.records.some(r=>r.workID==='nebulae-0'));
});
test('ESO respects robots, request cooldown and catalog retry state without rewriting other providers',async()=>{
  const record=raw(),previous={version:1,records:{eso:[record]},updatedAt:{eso:'2026-10-01T00:00:00Z'},continuation:{eso:null}},map=resources();
  const settings={providerIds:['eso'],previous,now,logger,dimensions,esoOptions:{maxWorks:3,wait:async()=>{}}};
  map.set(workURL('nebulae-0'),{status:429,headers:{'Retry-After':'120'}});const paused=await refreshCatalog({...settings,fetcher:fetcher(map)});assert.equal(paused.failures,1);assert.equal(paused.catalog.continuation.eso.retryAt,'2026-10-02T12:02:00.000Z');assert.deepEqual(paused.catalog.records.eso,[record]);assert.equal(paused.catalog.updatedAt.eso,previous.updatedAt.eso);
  const cooled=await refreshCatalog({...settings,previous:paused.catalog,fetcher:()=>assert.fail('cooldown')});assert.equal(cooled.failures,1);assert.deepEqual(mergeCatalogs(previous,paused.catalog).continuation.eso,paused.catalog.continuation.eso);
  assert.deepEqual((await refreshCatalog({...settings,providerIds:[]})).catalog.records.eso,[record]);
  for(const [url,value]of [[eso.origin+'/robots.txt','User-agent: *\nDisallow: /public/images/'],[eso.origin+'/robots.txt','User-agent: *\nDisallow: /public/images/archive/'],[eso.imageOrigin+'/robots.txt',{status:403}],[eso.imageOrigin+'/robots.txt','User-agent: *\nDisallow: /images/screen/'],[eso.licenseSource,'Unknown policy']]){const denied=resources();denied.set(url,value);const result=await refreshCatalog({...settings,fetcher:fetcher(denied)});assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.eso,[record]);}
  const polite=resources();polite.set(eso.origin+'/robots.txt','User-agent: *\nCrawl-delay: 2');polite.set(eso.imageOrigin+'/robots.txt','User-agent: *\nAllow: /');const delays=[];await sync({fetcher:fetcher(polite),maxWorks:3,wait:async value=>delays.push(value)});assert.ok(delays.slice(1).every(value=>value===2000));
  for(const change of [{dimensions:null},{maxWorks:0},{maxWorks:101},{intervalMs:-1},{intervalMs:60001}])await assert.rejects(sync({fetcher:()=>assert.fail('invalid config'),...change}),/配置/);
});
test('ESO interrupted image measurements preserve verified progress and do not skip the current work',async()=>{
  const map=resources();map.set(eso.imageOrigin+'/images/publicationjpg/galaxies-0.jpg',{status:503,headers:{'Retry-After':'180'}});
  const paused=await sync({fetcher:fetcher(map),maxWorks:3});assert.equal(paused.records.length,1);assert.equal(paused.updated,true);assert.equal(paused.interrupted,true);assert.deepEqual(paused.continuation.positions.galaxies,{page:1,offset:0});
  map.delete(eso.imageOrigin+'/images/publicationjpg/galaxies-0.jpg');const resumed=await sync({old:eso.normalizeRecords(paused.records),continuation:paused.continuation,now:new Date('2026-10-02T12:04:00Z'),fetcher:fetcher(map),maxWorks:3});assert.equal(resumed.interrupted,false);assert.equal(resumed.records.length,4);
});
test('ESO previews preserve full frames, source metadata and safe remote fallback',async t=>{
  const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-eso-'));t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
  const [item]=eso.normalizeRecords([raw()]),bytes=await sharp({create:{width:1280,height:720,channels:3,background:'#263354'}}).jpeg().toBuffer();
  assert.equal((await copyAuthorPreview(bytes,item)).width,1280);await assert.rejects(copyAuthorPreview(bytes,{...item,id:'other'}));
  await assert.rejects(copyAuthorPreview(await sharp(bytes).resize(640,360).toBuffer(),item));
  const built=await buildPreviews({items:[item],outputDir,logger,now,fetcher:async()=>new Response(bytes)});assert.equal(built.created,1);assert.equal(built.failures,0);
  const metadata=await sharp(await fs.readFile(path.join(outputDir,previews.filenameFor(item)))).metadata();assert.equal(metadata.width,1280);assert.equal(metadata.height,720);assert.equal(metadata.format,'webp');
  assert.deepEqual(previews.imageCandidates(item,built.manifest),[previews.previewFor(item,built.manifest),item.image]);
  assert.equal((await buildPreviews({items:[item],previous:built.manifest,outputDir,logger,now,fetcher:()=>assert.fail('cache reused')})).reused,1);
  const invalid=structuredClone(built.manifest);invalid.images[item.id].url='https://other.example';assert.equal(previews.previewFor(item,invalid),null);
  await buildPreviews({items:[],outputDir,logger,now});await assert.rejects(fs.readFile(path.join(outputDir,previews.filenameFor(item))),{code:'ENOENT'});
});

test('ESO publication checks validate the actual local preview and keep the official JPEG download external',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-eso-release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const record=raw(),[item]=eso.normalizeRecords([record]),bytes=await sharp({create:{width:1280,height:720,channels:3,background:'#354627'}}).jpeg().toBuffer();
  const outputDir=path.join(root,'previews'),built=await buildPreviews({items:[item],outputDir,logger,now,fetcher:async()=>new Response(bytes)});
  await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/official-feeds.json'),JSON.stringify({version:1,records:{eso:[record]}}));await fs.writeFile(path.join(root,'data/previews.json'),JSON.stringify(built.manifest));
  assert.deepEqual(await verifyRelease({root,logger}),{items:1,providers:1,originals:0,previews:1,fallbacks:0});
  await fs.unlink(path.join(outputDir,previews.filenameFor(item)));await assert.rejects(verifyRelease({root,logger}),/发布文件缺失/);
});
