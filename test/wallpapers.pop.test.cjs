const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const repositories=require('../source/wallpapers/repositories.js'),feeds=require('../source/wallpapers/feeds.js'),previews=require('../source/wallpapers/previews.js');
const collector=require('../scripts/refresh-wallpaper-feeds.cjs'),builder=require('../scripts/build-wallpaper-previews.cjs');
const commit='c'.repeat(40),revision='a'.repeat(40),logger={log(){},warn(){}},now=new Date('2026-10-02T12:00:00Z');
const grant="They're licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).";
const markdown='# pop-wallpapers\n\n## Kate Hazen\n\nKate has designed these illustrative wallpapers for System76. '+grant+'\n\n- kate-hazen-fractal-mountains.png\n\n## Unsplash\n\nUnsplash photos are in the public domain.\n- unknown.jpg\n\n## Nick Nazzaro\n\nSystem76 commissioned [Nick Nazzaro](http://www.nicknazzaro.com/) to create backgrounds for our project.\n\n'+grant+'\n\n- nick-nazzaro-bedroom.png\n';
const blobHash=data=>crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
const record=(changes={})=>({path:'original/nick-nazzaro-bedroom.png',title:'Bedroom',artist:'Nick Nazzaro',revision,width:4800,height:2700,license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',commit,declarationRevision:'b'.repeat(40),...changes});
function api({readme=markdown,images=[{path:record().path,sha:revision,size:1000}],ref=commit,change=()=>{},corruptBlob=false}={}){
  const bytes=Buffer.from(readme),manifest={type:'blob',path:'README.md',sha:blobHash(bytes),size:bytes.length};
  const tree={truncated:false,tree:[manifest,...images.map(image=>({type:'blob',...image}))]};change(tree);
  return async url=>{
    let body;
    if(url.endsWith('/commits/master'))body={sha:ref};
    else if(url.endsWith('/git/trees/'+ref+'?recursive=1'))body=tree;
    else if(url.endsWith('/git/blobs/'+manifest.sha))body={encoding:'base64',content:(corruptBlob?Buffer.from('wrong'):bytes).toString('base64')};
    else throw Error('Unexpected request');
    return {ok:true,json:async()=>body};
  };
}

test('Pop image permissions come from each named commissioned artist section, excluding unrelated photos',()=>{
  const records=repositories.parsePopDeclaration(markdown);assert.equal(records.length,2);
  assert.deepEqual(records.map(r=>r.artist),['Kate Hazen','Nick Nazzaro']);assert.equal(records[0].title,'Fractal Mountains');
  assert.equal(repositories.parsePopDeclaration(markdown.replace(grant,'All rights reserved.')).length,1);
  assert.deepEqual(repositories.parsePopDeclaration(markdown.split(grant).join('MIT')),[]);
  assert.equal(repositories.parsePopDeclaration(markdown.replace('System76. '+grant,'System76. '+grant+' No redistribution.')).length,1);
  for(const text of [null,'x'.repeat(131073),markdown.replace('# pop-wallpapers','# Other'),markdown.replace('## Kate Hazen','## Other'),markdown.replace('Kate has designed','Other has designed'),markdown.replace('- nick-nazzaro-bedroom.png','- nick-nazzaro-bedroom.png\n- nick-nazzaro-bedroom.png')])assert.equal(repositories.parsePopDeclaration(text),null);
  const extra=markdown.replace('- kate-hazen-fractal-mountains.png','- kate-hazen-fractal-mountains.png\n- ../other.png\n- nick-nazzaro-space-red.png\n- other.png');assert.equal(repositories.parsePopDeclaration(extra).length,2);
  for(const file of ['original/nick-nazzaro-bedroom.png','original/kate-hazen-COSMIC-desktop-wallpaper.png'])assert.ok(repositories.validPath(file,'pop'));
  for(const file of ['original/unknown.jpg','original/nick-nazzaro-bedroom.jpg','preview/nick-nazzaro-bedroom.png','original/../nick-nazzaro-bedroom.png','original/nick-nazzaro-nude.png'])assert.equal(repositories.validPath(file,'pop'),false);
});

test('Pop keeps image authors, immutable source grants, native downloads and original illustration categories',()=>{
  const [item]=repositories.normalizeRepository([record(),record()],'pop');assert.equal(item.artist,'Nick Nazzaro');assert.equal(item.title,'Bedroom');assert.equal(item.license,'CC BY-SA 4.0');
  assert.deepEqual(item.categories,['illustration']);assert.ok(!item.tags.includes('AI 插画'));assert.ok(!item.categories.includes('anime'));assert.match(item.copyrightNotice,/System76/);
  assert.equal(item.pageUrl,'https://github.com/pop-os/wallpapers/blob/'+commit+'/README.md');assert.equal(item.download,'https://raw.githubusercontent.com/pop-os/wallpapers/'+commit+'/'+record().path);
  assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'pop'),[item]);assert.equal(repositories.normalizeRepository([record(),record()],'pop').length,1);
  for(const changes of [{artist:'Other'},{title:null},{title:''},{title:'x'.repeat(101)},{license:'CC0'},{licenseUrl:'https://example.test'},{commit:'master'},{declarationRevision:'bad'},{width:1599,height:1080},{height:799},{width:20000,height:4000}])assert.deepEqual(repositories.normalizeRepository([record(changes)],'pop'),[]);
  assert.ok(repositories.categoriesFor('original/nick-nazzaro-space-red.png','pop').includes('space'));assert.ok(repositories.categoriesFor('original/kate-hazen-fractal-mountains.png','pop').includes('nature'));
  const other=record({path:'original/kate-hazen-mort1mer.png',artist:'Kate Hazen',title:'Mort1mer',revision:'d'.repeat(40),width:2560,height:1440});assert.equal(repositories.normalizeRepository([record(),other],'pop').length,2);
});

test('Pop matches declared files to the hash-verified README and complete tree at one commit',async()=>{
  const files=await collector.repositoryFiles('pop',api({images:[{path:record().path,sha:revision,size:1000},{path:'original/nick-nazzaro-undocumented.png',sha:'d'.repeat(40),size:1000},{path:'original/kate-hazen-fractal-mountains.png',sha:'e'.repeat(40),size:33*1024*1024}]}));
  assert.equal(files.length,1);assert.equal(files[0].artist,'Nick Nazzaro');assert.equal(files[0].commit,commit);assert.match(files[0].declarationRevision,/^[a-f0-9]{40}$/);
  assert.deepEqual(await collector.repositoryFiles('pop',api({images:[]})),[]);
  for(const options of [{ref:'bad'},{corruptBlob:true},{readme:'Changed structure'},...[
    tree=>tree.truncated=true,tree=>tree.tree=null,tree=>tree.tree=[],tree=>tree.tree.push(tree.tree[0]),tree=>tree.tree[0].sha='bad',tree=>tree.tree[0].size=131073,tree=>tree.tree[0].size++,tree=>tree.tree[1].size=0,tree=>tree.tree=Array(10001).fill(tree.tree[0])
  ].map(change=>({change}))])await assert.rejects(collector.repositoryFiles('pop',api(options)));
});

test('Pop updates available grants, preserves temporary failures and removes confirmed revoked or missing files',async()=>{
  let measured=0;const options={providerIds:['pop'],logger,now,dimensions:async()=>{measured++;return {width:4800,height:2700};}};
  const first=await collector.refreshCatalog({...options,fetcher:api()});assert.equal(first.failures,0);assert.equal(first.catalog.records.pop.length,1);assert.equal(measured,1);
  const reused=await collector.refreshCatalog({...options,previous:first.catalog,fetcher:api({ref:'d'.repeat(40)})});assert.equal(measured,1);assert.equal(reused.catalog.records.pop[0].commit,'d'.repeat(40));
  const failed=await collector.refreshCatalog({...options,previous:first.catalog,fetcher:api({images:[{path:record().path,sha:'f'.repeat(40),size:1000}]}),dimensions:async()=>{throw Error('Offline');}});assert.deepEqual(failed.catalog.records.pop,first.catalog.records.pop);
  const revoked=await collector.refreshCatalog({...options,previous:first.catalog,fetcher:api({readme:markdown.split(grant).join('All rights reserved.')})});assert.deepEqual(revoked.catalog.records.pop,[]);
  const removed=await collector.refreshCatalog({...options,previous:first.catalog,fetcher:api({images:[]})});assert.deepEqual(removed.catalog.records.pop,[]);
  const changed=await collector.refreshCatalog({...options,previous:first.catalog,fetcher:api({readme:'Unrecognized source'})});assert.equal(changed.failures,1);assert.deepEqual(changed.catalog.records.pop,first.catalog.records.pop);assert.equal(changed.catalog.updatedAt.pop,first.catalog.updatedAt.pop);
});

test('Pop previews verify native file hashes, preserve proportions and clean only their managed files',async t=>{
  const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-pop-'));t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
  const bytes=await sharp({create:{width:4800,height:2700,channels:3,background:'#a45e70'}}).png().toBuffer();const [item]=repositories.normalizeRepository([record({revision:blobHash(bytes)})],'pop');
  const options={items:[item],outputDir,logger,now,fetcher:async()=>new Response(bytes)};
  const built=await builder.buildPreviews(options);assert.equal(built.created,1);assert.equal(built.failures,0);
  const meta=await sharp(await fs.readFile(path.join(outputDir,previews.filenameFor(item)))).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,720);assert.equal(meta.format,'webp');assert.equal(item.download,item.fallbackImage);
  assert.equal((await builder.buildPreviews({...options,previous:built.manifest,fetcher:()=>assert.fail('cached preview')})).reused,1);
  const wrong=await sharp(bytes).resize(2400,1350).png().toBuffer();assert.equal((await builder.buildPreviews({...options,fetcher:async()=>new Response(wrong)})).failures,1);
  await fs.writeFile(path.join(outputDir,'pop-personal.webp'),'preserve');await builder.buildPreviews({items:[],outputDir,logger,now});assert.equal(await fs.readFile(path.join(outputDir,'pop-personal.webp'),'utf8'),'preserve');await assert.rejects(fs.readFile(path.join(outputDir,previews.filenameFor(item))),{code:'ENOENT'});
});
