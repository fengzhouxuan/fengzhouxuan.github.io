const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),sharp=require('sharp');
const hd=require('../source/wallpapers/hdwallpapers.js'),feeds=require('../source/wallpapers/feeds.js'),core=require('../source/wallpapers/core.js'),previews=require('../source/wallpapers/previews.js');
const {robotsAllowed,termsLicensed,parseGallery,parseWork,collectHDWallpapers}=require('../scripts/collect-hdwallpapers.cjs');
const {refreshCatalog,mergeCatalogs}=require('../scripts/refresh-wallpaper-feeds.cjs'),{buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const logger={log(){},warn(){}},now=new Date('2026-10-02T00:00:00Z'),modified='Thu, 01 Oct 2026 00:00:00 GMT';
const robots='User-agent: *\nAllow: /\nSitemap: '+hd.origin+'/sitemap.xml';
const terms='<p>most of the images are shared under a Creative Commons license; the license is mentioned in every wallpaper page; if you choose to use or upload in other projects, read carefully license terms.</p>';
const page=id=>hd.origin+'/wallpaper/anime/ai-cat-'+id+'/'+id+'/';
const image=id=>hd.origin+'/uploads/converted/25/07/07/123-AI_Cat-'+id+'-2000x1250-MM-90.jpg';
function work(id='aa',changes={}){
 const title=changes.title||'AI Cat '+id,url=page(id),schema={'@type':'ImageObject',name:title+' HD Wallpaper',contentUrl:image(id),width:2000,height:1250,creator:{name:hd.artist},creditText:hd.artist,copyrightNotice:'Image by '+hd.artist,license:hd.origin+'/terms-of-service/#copyright-policy',acquireLicensePage:url,isAccessibleForFree:true,representativeOfPage:true,...changes.schema};
 return '<link rel="canonical" href="'+(changes.canonical||url)+'"><h1>'+title+'</h1><div class="w-author hideit">Author : '+(changes.artist||hd.artist)+'</div><div class="w-license hideit">License : '+(changes.license||'Public Domain CC0')+'</div><script type="application/ld+json">'+(changes.invalidJSON||JSON.stringify(schema))+'</script><a href="'+hd.origin+'/tag/AI/">AI</a><a class="download-btn" href="'+(changes.download||url.replace('/wallpaper/','/download/')+'2000x1250/')+'">Download Wallpaper</a>';
}
const gallery=(ids,total=ids.length)=>'<h1>Anime - HD Wallpapers ('+total+')</h1>'+ids.map(id=>'<figure><a href="'+page(id)+'"><img alt="AI Cat"></a></figure>').join('');
const jpeg=background=>sharp({create:{width:2000,height:1250,channels:3,background:background||'#465eb4'}}).jpeg().toBuffer();
const raw=(bytes,id='aa')=>({...parseWork(work(id),page(id)),revision:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,modified,etag:null});
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-hd-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function fetcherFor(ids,bytes,{respond}={}){
 return async(url,options)=>{
  assert.ok(options.signal);assert.match(options.headers['User-Agent'],/WallpaperStation/);assert.equal(options.redirect,'error');
  if(respond){const custom=respond(url,options);if(custom)return custom;}
  if(url===hd.origin+'/robots.txt')return new Response(robots);
  if(url===hd.origin+'/terms-of-service/')return new Response(terms);
  if(url.startsWith(hd.source.gallery)){const number=Number(new URL(url).searchParams.get('page')||1);return new Response(gallery(ids.slice((number-1)*16,number*16),ids.length));}
  const id=ids.find(id=>url===page(id)||url===image(id));assert.ok(id,'unexpected request '+url);
  return url===page(id)?new Response(work(id)):new Response(options.method==='HEAD'?null:bytes,{headers:{'last-modified':modified,'content-type':'image/jpeg'}});
 };
}

test('HDWallpapers reads only an explicitly allowed robots policy and image-specific license rules',()=>{
 assert.equal(robotsAllowed(robots),true);assert.equal(robotsAllowed('# comment\n'+robots+'\nDisallow:'),true);
 for(const value of [null,'',robots+'\nDisallow: /',robots+'\nDisallow: /wallpaper/',robots+'\nCrawl-delay: 10',robots.replace('User-agent: *','User-agent: OtherBot')])assert.equal(robotsAllowed(value),false);
 assert.equal(termsLicensed(terms),true);for(const value of [null,'CC0 images',terms.replace('every wallpaper page','the website footer'),terms+'<p>Do not scrape our site.</p>'])assert.equal(termsLicensed(value),false);
});
test('HDWallpapers source URLs and original paths cannot leave their verified namespace',()=>{
 assert.equal(hd.workURL(page('aa')),page('aa'));assert.equal(hd.sourceFileURL(image('aa'),'aa',2000,1250),image('aa'));assert.equal(hd.originalPath({revision:'a'.repeat(64)}),'./originals/hdwallpapers/'+ 'a'.repeat(64)+'.jpg');
 assert.equal(hd.workURL(hd.origin+'/wallpaper/anime/Anime-Girl-Photoshop-Windows/mZO/'),hd.origin+'/wallpaper/anime/Anime-Girl-Photoshop-Windows/mZO/');
 for(const url of [null,'../file','http://www.hdwallpapers.org/wallpaper/anime/ai-cat/aa/',page('aa')+'?tracking=1',page('aa')+'#x',page('aa').replace('/anime/','/games/'),page('aa').replace('.org/','.org:444/'),page('aa').replace('www.hdwallpapers.org','evil.example')])assert.equal(hd.workURL(url),null);
 for(const url of [null,image('aa')+'?x=1',image('aa')+'#x',image('aa').replace('/07/07/','/13/07/'),image('aa').replace('-aa-','-bb-'),image('aa').replace('www.hdwallpapers.org','evil.example'),image('aa').replace('.jpg','.svg')])assert.equal(hd.sourceFileURL(url,'aa',2000,1250),null);
 assert.equal(hd.sourceFileURL(image('aa'),'../aa',2000,1250),null);assert.equal(hd.sourceFileURL(image('aa'),'aa','2000',1250),null);assert.equal(hd.originalPath(null),null);assert.equal(hd.originalPath({revision:'../file'}),null);
});
test('HDWallpapers complete gallery pagination requires its own headings, unique cards and exact totals',()=>{
 assert.deepEqual(parseGallery(gallery(['aa','bb'])),{total:2,pages:1,links:[page('aa'),page('bb')]});assert.deepEqual(parseGallery(gallery([],0)),{total:0,pages:1,links:[]});
 for(const [html,page] of [['',1],[gallery(['aa'],2),1],[gallery(['aa','aa'],2),1],[gallery(['aa'],1001),1],[gallery(['aa']),0],[gallery(['aa']),2],[gallery(['aa']).replace('Anime -','Other -'),1]])assert.throws(()=>parseGallery(html,page),/画廊/);
});
test('HDWallpapers requires the same work, author, AI label, visible CC0 and highest-resolution file',()=>{
 const record=parseWork(work(),page('aa'));assert.equal(record.workID,'aa');assert.equal(record.sourceFile,image('aa'));assert.equal(record.license,'CC0');assert.equal(record.licenseSource,page('aa'));assert.equal(record.ai,true);
 assert.deepEqual(parseWork(work().replace('License : Public Domain CC0','License :  \n\t Public Domain CC0'),page('aa')),record);
 for(const changes of [{canonical:page('bb')},{artist:'Unknown uploader'},{license:'All rights reserved'},{license:'CC BY 4.0'},{invalidJSON:'invalid'},{title:'AI Hatsune Miku'},{title:'AI Nude Cat'},{download:page('aa')},{schema:{creator:{name:'Someone'}}},{schema:{creditText:'Unknown'}},{schema:{copyrightNotice:'Unknown'}},{schema:{name:'Different work'}},{schema:{representativeOfPage:false}},{schema:{isAccessibleForFree:false}},{schema:{acquireLicensePage:page('bb')}},{schema:{license:'All rights reserved'}},{schema:{contentUrl:image('bb')}},{schema:{width:Infinity}},{schema:{width:1000}}])assert.equal(parseWork(work('aa',changes),page('aa')),null);
 assert.equal(parseWork(work().replace(/AI/g,'Original'),page('aa')),null);assert.equal(parseWork(work()+'<div class="w-license">License : Public Domain CC0</div>',page('aa')),null);assert.equal(parseWork(work().replace('<h1>','<h2>').replace('</h1>','</h2>'),page('aa')),null);assert.equal(parseWork(work(),null),null);
 const generic=work('aa',{license:'All rights reserved'})+'<footer>Public Domain CC0</footer>';assert.equal(parseWork(generic,page('aa')),null);
});
test('HDWallpapers normalization preserves native pixels, CC0 provenance, AI labels and local single-image downloads',async()=>{
 const bytes=await jpeg(),record=raw(bytes),item=hd.normalizeRecords([record])[0];assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'hdwallpapers'),[item]);assert.equal(item.download,hd.originalPath(record));assert.equal(item.image,item.download);assert.equal(item.artist,hd.artist);assert.ok(item.tags.includes('AI 插画'));
 assert.equal(core.filterWallpapers([item],{provider:'hdwallpapers',category:'anime',orientation:'landscape'}).length,1);assert.equal(hd.normalizeRecords([record,record]).length,1);assert.deepEqual(hd.normalizeRecords(null),[]);
 assert.deepEqual(hd.categoriesFor('AI Neon Street Forest Galaxy Dragon Kitty'),['anime','illustration','nature','city','space','fantasy','cyberpunk','animals']);
 const mutations=[r=>r.artist='unknown',r=>r.license='MIT',r=>r.licenseUrl='https://evil.example',r=>r.ai=false,r=>r.pageUrl=page('bb'),r=>r.licenseSource=hd.source.gallery,r=>r.title='AI Genshin Impact',r=>r.tags=['Hatsune Miku'],r=>r.title='',r=>r.width=0,r=>r.height=799,r=>r.width=Infinity,r=>r.bytes=0,r=>r.bytes=32*1024*1024+1,r=>r.sourceFile=image('bb'),r=>r.revision='bad',r=>r.modified='today',r=>r.etag='a'.repeat(201)];
 for(const mutate of mutations){const altered={...record};mutate(altered);assert.deepEqual(hd.normalizeRecords([altered]),[]);}
 assert.deepEqual(hd.normalizeRecords([null]),[]);assert.equal(hd.normalizeRecords([{...record,modified:null,etag:'"digest"',tags:null}]).length,1);
});
test('HDWallpapers collector traverses pagination sequentially and verifies actual files before caching',async t=>{
 const outputDir=await directory(t),bytes=await jpeg(),ids=Array.from({length:17},(_,i)=>'w'+i),waits=[];let active=0,peak=0;
 const base=fetcherFor(ids,bytes),fetcher=async(...args)=>{active++;peak=Math.max(peak,active);try{return await base(...args);}finally{active--;}};
 const result=await collectHDWallpapers({fetcher,outputDir,now,logger,wait:async delay=>waits.push(delay)});
 assert.equal(result.records.length,17);assert.equal(hd.normalizeRecords(result.records).length,1,'identical bytes deduplicate on normalization');assert.equal(result.interrupted,false);assert.equal(result.updated,true);assert.equal(peak,1);assert.ok(waits.length>17);assert.ok(waits.every(delay=>delay===1000));
 const entry=result.records[0];assert.equal(entry.width,2000);assert.equal(entry.height,1250);assert.deepEqual(await fs.readFile(path.join(outputDir,entry.revision+'.jpg')),bytes);
});
test('HDWallpapers unchanged HTTP versions reuse verified native bytes and repair damaged original caches',async t=>{
 const outputDir=await directory(t),bytes=await jpeg(),fetcher=fetcherFor(['aa'],bytes),options={fetcher,outputDir,now,logger,intervalMs:0};
 const first=await collectHDWallpapers(options),old=hd.normalizeRecords(first.records),file=path.join(outputDir,first.records[0].revision+'.jpg');
 const noDownload=fetcherFor(['aa'],bytes,{respond:(url,options)=>{if(url===image('aa')&&options.method!=='HEAD')assert.fail('unchanged bytes should not download');}});
 assert.deepEqual((await collectHDWallpapers({...options,old,fetcher:noDownload})).records,first.records);
 await fs.writeFile(file,'damaged');assert.deepEqual((await collectHDWallpapers({...options,old})).records,first.records);assert.deepEqual(await fs.readFile(file),bytes);
 await fs.unlink(file);assert.equal((await collectHDWallpapers({...options,old})).records.length,1);
 const changed=await jpeg('#bd832d'),replaced=await collectHDWallpapers({...options,old,fetcher:fetcherFor(['aa'],changed,{respond:(url,options)=>url===image('aa')&&options.method==='HEAD'?new Response(null,{headers:{'last-modified':'Fri, 02 Oct 2026 00:00:00 GMT'}}):null})});assert.notEqual(replaced.records[0].revision,first.records[0].revision);
});
test('HDWallpapers removes unlicensed and departed works while preserving temporary work failures',async t=>{
 const outputDir=await directory(t),bytes=await jpeg(),old=hd.normalizeRecords([raw(bytes)]),options={outputDir,old,now,logger,intervalMs:0};
 const unlicensed=await collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes,{respond:url=>url===page('aa')?new Response(work('aa',{license:'All rights reserved'})):null})});assert.deepEqual(unlicensed.records,[]);
 const gone=await collectHDWallpapers({...options,fetcher:fetcherFor([],bytes)});assert.deepEqual(gone.records,[]);
 const unavailable=await collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes,{respond:url=>url===page('aa')?new Response('unavailable',{status:502}):null})});assert.deepEqual(unavailable.records,[old[0].feedRecord]);
 const changedStructure=await collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes,{respond:url=>url===page('aa')?new Response(work().replace('application/ld+json','text/plain')):null})});assert.deepEqual(changedStructure.records,[old[0].feedRecord]);
 const thirdParty=await collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes,{respond:url=>url===page('aa')?new Response(work('aa',{title:'AI Genshin Impact'})):null})});assert.deepEqual(thirdParty.records,[]);
 await assert.rejects(collectHDWallpapers({...options,fetcher:async()=>new Response('Disallow: /')}),/访问规则/);
 await assert.rejects(collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes,{respond:url=>url===hd.origin+'/terms-of-service/'?new Response('No sharing'):null})}),/使用规则/);
 await assert.rejects(collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes,{respond:url=>url===hd.source.gallery?new Response(gallery(['aa'],2)):null})}),/作品数/);
});
test('HDWallpapers cooldowns save verified progress and prevent every source request until retry time',async t=>{
 const outputDir=await directory(t),bytes=await jpeg(),options={outputDir,now,logger,intervalMs:0};
 const result=await collectHDWallpapers({...options,fetcher:fetcherFor(['aa','bb'],bytes,{respond:url=>url===page('bb')?new Response('busy',{status:429,headers:{'retry-after':'120'}}):null})});assert.equal(result.records.length,1);assert.equal(result.interrupted,true);assert.equal(result.retryAt,'2026-10-02T00:02:00.000Z');
 const paused=await collectHDWallpapers({...options,old:hd.normalizeRecords(result.records),retryAt:result.retryAt,fetcher:()=>assert.fail('cooling source must not request')});assert.deepEqual(paused.records,result.records);assert.equal(paused.updated,false);
 const early=await collectHDWallpapers({...options,fetcher:async()=>new Response('busy',{status:503})});assert.equal(early.updated,false);assert.equal(early.retryAt,'2026-10-02T01:00:00.000Z');
 for(const intervalMs of [-1,60001,0.5])await assert.rejects(collectHDWallpapers({...options,intervalMs}),/间隔无效/);
});
test('HDWallpapers rejects wrong pixels and format and preserves full original bytes in local previews',async t=>{
 const outputDir=await directory(t),bytes=await jpeg(),options={outputDir,now,logger,intervalMs:0};
 for(const content of [await sharp(bytes).resize(1000,625).jpeg().toBuffer(),await sharp(bytes).png().toBuffer()])assert.deepEqual((await collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],content)})).records,[]);
 const collected=await collectHDWallpapers({...options,fetcher:fetcherFor(['aa'],bytes)}),items=hd.normalizeRecords(collected.records),previewDir=path.join(outputDir,'previews');
 const built=await buildPreviews({items,hdOriginalsDir:outputDir,outputDir:previewDir,now,logger,fetcher:()=>assert.fail('native files are already cached')});assert.equal(built.created,1);assert.equal(built.failures,0);
 const file=path.join(previewDir,previews.filenameFor(items[0])),metadata=await sharp(await fs.readFile(file)).metadata();assert.equal(metadata.width,1280);assert.equal(metadata.height,800);assert.equal(metadata.format,'webp');assert.ok(previews.previewFor(items[0],built.manifest));
 await fs.writeFile(path.join(outputDir,collected.records[0].revision+'.jpg'),'damaged');const broken=await buildPreviews({items,hdOriginalsDir:outputDir,outputDir:previewDir,now,logger});assert.equal(broken.failures,1);assert.equal(broken.created,0);
});
test('HDWallpapers refresh and cache merge retain every other provider and its own cooldown',async t=>{
 const other=feeds.normalizeFeed([{path:'Abstract/test.png',revision:'b'.repeat(40),width:2000,height:1250,license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}],'folium')[0].feedRecord;
 const outputDir=await directory(t),bytes=await jpeg(),record=raw(bytes),previous={version:1,records:{hdwallpapers:[record],folium:[other]},updatedAt:{hdwallpapers:'2026-10-01T00:00:00Z',folium:'2026-10-01T01:00:00Z'},continuation:{hdwallpapers:{retryAt:'2026-10-02T01:00:00.000Z'}}};
 const paused=await refreshCatalog({previous,providerIds:['hdwallpapers'],now,logger,fetcher:()=>assert.fail('cooldown is retained'),hdWallpapersOptions:{outputDir}});assert.deepEqual(paused.catalog.records.hdwallpapers,[record]);assert.deepEqual(paused.catalog.continuation.hdwallpapers,previous.continuation.hdwallpapers);assert.equal(paused.failures,1);
 assert.deepEqual(mergeCatalogs(previous,paused.catalog).continuation.hdwallpapers,previous.continuation.hdwallpapers);
 const next=await refreshCatalog({previous,providerIds:['hdwallpapers'],now:new Date('2026-10-02T01:00:00Z'),logger,fetcher:fetcherFor(['aa'],bytes),hdWallpapersOptions:{outputDir,intervalMs:0}});assert.equal(next.failures,0);assert.equal(next.catalog.continuation.hdwallpapers,null);assert.equal(next.catalog.records.hdwallpapers.length,1);
 assert.deepEqual(next.catalog.records.folium,[other]);assert.equal(next.catalog.updatedAt.folium,previous.updatedAt.folium);assert.deepEqual(mergeCatalogs(previous,next.catalog).records.folium,[other]);
 const kept=await refreshCatalog({previous,providerIds:[],now,logger});assert.deepEqual(kept.catalog.records.hdwallpapers,[record]);assert.deepEqual(kept.catalog.continuation.hdwallpapers,previous.continuation.hdwallpapers);
 const failed=await refreshCatalog({previous:{...previous,continuation:{}},providerIds:['hdwallpapers'],now,logger,fetcher:async()=>new Response('denied'),hdWallpapersOptions:{outputDir}});assert.equal(failed.failures,1);assert.deepEqual(failed.catalog.records.hdwallpapers,[record]);
});
