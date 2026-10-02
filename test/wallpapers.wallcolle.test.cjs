const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const repositories=require('../source/wallpapers/repositories.js');
const feeds=require('../source/wallpapers/feeds.js');
const previews=require('../source/wallpapers/previews.js');
const collector=require('../scripts/refresh-wallpaper-feeds.cjs');
const builder=require('../scripts/build-wallpaper-previews.cjs');
const commit='c'.repeat(40),revision='a'.repeat(40),manifestPath='contributors/photographer/me.json';
const logger={log(){},warn(){}},now=new Date('2026-10-02T10:00:00Z');
const hash=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const work=(i=0,l='CC BY-NC 4.0')=>({i,f:'jpg',t:'Lake and Mountains',l,tags:['Nature','Mountain','Water']});
const declaration=(wallpapers=[work()])=>({uname:'photographer',name:'Photo Author',email:'not-for-catalog@example.com',wallpapers});
const record=(extra={})=>({path:'contributors/photographer/0.jpg',title:'Lake and Mountains',artist:'Photo Author',tags:['Nature','Mountain','Water'],license:'CC BY-NC 4.0',licenseUrl:repositories.sources.wallcolle.licenses['CC BY-NC 4.0'],revision,commit,declarationRevision:'b'.repeat(40),width:4000,height:3000,...extra});

function api({raw=declaration(),images=[{path:'contributors/photographer/0.jpg',sha:revision,size:1000}],change=()=>{}}={}){
  const bytes=Buffer.from(JSON.stringify(raw)),sha=hash(bytes);
  const tree={truncated:false,tree:[{type:'blob',path:manifestPath,sha,size:bytes.length},...images.map(image=>({type:'blob',...image}))]};
  const blob={encoding:'base64',content:bytes.toString('base64')};change({tree,blob});
  return async url=>{
    let body;
    if(url.endsWith('/commits/master'))body={sha:commit};
    else if(url.endsWith('/git/trees/'+commit+'?recursive=1'))body=tree;
    else if(url.endsWith('/git/blobs/'+sha))body=blob;
    else throw Error('Unexpected source request');
    return {ok:true,json:async()=>body};
  };
}

test('WallColle binds per-image licenses to the exact contributor namespace, without publishing emails',()=>{
  const raw=declaration([work(),work(1,'CC BY 4.0'),work(2,'CC BY-SA 4.0'),work(3,'Public Domain'),work(4,'CC BY-ND-4.0'),work(5,'WTFPL')]);
  const parsed=repositories.parseWallcolleDeclaration(raw,manifestPath);
  assert.equal(parsed.length,4);assert.equal(parsed[3].license,'Public domain');
  assert.equal(parsed[0].artist,'Photo Author');assert.equal(parsed[0].path,'contributors/photographer/0.jpg');
  assert.ok(!JSON.stringify(parsed).includes(raw.email));
  assert.deepEqual(repositories.parseWallcolleDeclaration(declaration([]),manifestPath),[]);
  assert.deepEqual(repositories.parseWallcolleDeclaration(declaration([work(0,'All rights reserved')]),manifestPath),[]);
  for(const [body,filename] of [[null,manifestPath],[raw,null],[raw,'contributors/other/me.json'],[{...raw,uname:'../photographer'},manifestPath],[{...raw,name:''},manifestPath],[{...raw,name:'x'.repeat(101)},manifestPath],[{...raw,name:'<p></p>'},manifestPath],[{...raw,wallpapers:null},manifestPath],[{...raw,wallpapers:Array(1001).fill(work())},manifestPath],[declaration([work(),work()]),manifestPath],[declaration([{...work(),i:-1}]),manifestPath],[declaration([{...work(),i:1000000}]),manifestPath],[declaration([{...work(),l:null}]),manifestPath]])assert.equal(repositories.parseWallcolleDeclaration(body,filename),null);
  for(const extra of [{f:'svg'},{t:''},{t:'x'.repeat(101)},{t:'Nude scene'},{tags:[]},{tags:null},{tags:Array(21).fill('Nature')},{tags:['Nature?']},{tags:['x'.repeat(51)]},{tags:['Unknown']}])assert.deepEqual(repositories.parseWallcolleDeclaration(declaration([{...work(),...extra}]),manifestPath),[]);
});

test('WallColle categories and URLs preserve original files at the verified immutable commit',()=>{
  assert.deepEqual(repositories.wallcolleCategories(['Civil','Metropolis','Nature','Water','Mountain','Plant','Garden','Astronomy']),['city','nature','space']);
  assert.deepEqual(repositories.wallcolleCategories(null),[]);
  const urls=repositories.urlsFor(record().path,'wallcolle',commit);
  assert.ok(urls.download.includes('@'+commit+'/contributors/photographer/0.jpg'));
  assert.ok(urls.pageUrl.endsWith('/'+commit+'/contributors/photographer/me.json'));
  assert.equal(urls.fallbackImage,urls.download.replace('cdn.jsdelivr.net','fastly.jsdelivr.net'));
  for(const invalid of [undefined,'master','g'.repeat(40),1])assert.equal(repositories.urlsFor(record().path,'wallcolle',invalid),null);
  for(const invalid of ['../0.jpg','contributors/name/me.json','contributors/name/01.jpg','contributors/name/0.webp','contributors/name/1000000.jpg','contributors/name/0.jpg?x'])assert.equal(repositories.validPath(invalid,'wallcolle'),false);
});

test('WallColle normalization preserves author, license and modification credits within the processing limits',()=>{
  const [item]=repositories.normalizeRepository([record()],'wallcolle');
  assert.equal(item.artist,'Photo Author');assert.deepEqual(item.categories,['nature']);assert.equal(feeds.licenseHint(item.license),'署名 · 非商业');
  assert.match(item.copyrightNotice,/等比例缩小.*编号：0/);assert.deepEqual(item.feedRecord,record());
  assert.deepEqual(feeds.normalizeFeed([item.feedRecord],'wallcolle'),[item]);
  assert.equal(repositories.normalizeRepository([record(),record()],'wallcolle').length,1);
  for(const extra of [{width:11455,height:6098},{width:1599,height:800},{height:799},{commit:null},{declarationRevision:null},{artist:''},{artist:'<p></p>'},{artist:'x'.repeat(101)},{title:''},{title:'x'.repeat(101)},{title:'Hentai'},{tags:['Unknown']},{tags:null},{license:'GPLv2'},{licenseUrl:'https://example.com/'},{path:'contributors/../0.jpg'},{revision:'bad'}])assert.deepEqual(repositories.normalizeRepository([record(extra)],'wallcolle'),[]);
  assert.ok(repositories.normalizeRepository([record({width:10000,height:6000})],'wallcolle').length);
});

test('WallColle discovery checks manifest bytes at one commit and excludes missing or oversized originals',async()=>{
  const files=await collector.repositoryFiles('wallcolle',api({raw:declaration([work(),work(1),work(2),work(3,'CC BY-ND-4.0')]),images:[{path:record().path,sha:revision,size:1000},{path:'contributors/photographer/2.jpg',sha:'d'.repeat(40),size:32*1024*1024+1},{path:'contributors/photographer/3.jpg',sha:'e'.repeat(40),size:1000}]}));
  assert.equal(files.length,1);assert.equal(files[0].commit,commit);assert.equal(files[0].declarationRevision,hash(Buffer.from(JSON.stringify(declaration([work(),work(1),work(2),work(3,'CC BY-ND-4.0')])))));
  assert.ok(!JSON.stringify(files).includes('not-for-catalog'));
});

test('WallColle refresh rechecks licenses, reuses unchanged dimensions, removes withdrawn works and preserves failures',async()=>{
  let measurements=0;
  const options={providerIds:['wallcolle'],logger,now,dimensions:async(fetcher,url)=>{measurements++;assert.ok(url.includes('@'+commit+'/'));return {width:4000,height:3000};}};
  const initial=await collector.refreshCatalog({...options,fetcher:api()});
  assert.equal(initial.failures,0);assert.equal(measurements,1);assert.equal(initial.catalog.records.wallcolle.length,1);
  const changed=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:api({raw:declaration([{...work(),t:'Renamed',l:'CC BY-SA 4.0'}])})});
  assert.equal(measurements,1);assert.equal(changed.catalog.records.wallcolle[0].title,'Renamed');assert.equal(changed.catalog.records.wallcolle[0].license,'CC BY-SA 4.0');
  const empty=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:api({raw:declaration([work(0,'All rights reserved')])})});
  assert.equal(empty.failures,0);assert.deepEqual(empty.catalog.records.wallcolle,[]);
  const offline=await collector.refreshCatalog({...options,previous:initial.catalog,fetcher:async()=>{throw Error('Offline');}});
  assert.equal(offline.failures,1);assert.deepEqual(offline.catalog.records.wallcolle,initial.catalog.records.wallcolle);assert.equal(offline.catalog.updatedAt.wallcolle,initial.catalog.updatedAt.wallcolle);
});

test('WallColle rejects incomplete, duplicate, malformed and mismatched declarations without erasing the last catalog',async()=>{
  const changes=[({tree})=>tree.truncated=true,({tree})=>tree.tree=null,({tree})=>tree.tree=[],({tree})=>tree.tree.push(tree.tree[0]),({tree})=>tree.tree[0].sha='bad',({tree})=>tree.tree[0].size=131073,({blob})=>blob.encoding='text',({blob})=>blob.content='x'.repeat(180001),({blob})=>blob.content=Buffer.from('{}').toString('base64'),({tree})=>tree.tree[0].size++];
  const previous={version:1,records:{wallcolle:[record()]},updatedAt:{wallcolle:'2026-10-01T00:00:00Z'}};
  for(const fetcher of [...changes.map(change=>api({change})),api({raw:{...declaration(),uname:'another'}}),async()=>({ok:true,json:async()=>({sha:'not a commit'})})]){
    const result=await collector.refreshCatalog({providerIds:['wallcolle'],previous,fetcher,logger});
    assert.equal(result.failures,1);assert.deepEqual(result.catalog.records.wallcolle,[record()]);assert.equal(result.catalog.updatedAt.wallcolle,previous.updatedAt.wallcolle);
  }
});

test('WallColle previews verify real original bytes and retain native downloads and share-alike attribution',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-wallcolle-'));
  try{
    const bytes=await sharp({create:{width:1800,height:1200,channels:3,background:'#8ca8bf'}}).jpeg().toBuffer(),revision=hash(bytes);
    const [item]=repositories.normalizeRepository([record({revision,width:1800,height:1200,license:'CC BY-SA 4.0',licenseUrl:repositories.sources.wallcolle.licenses['CC BY-SA 4.0']})],'wallcolle');
    const fetcher=async()=>new Response(bytes, {headers:{'content-length':String(bytes.length)}});
    const result=await builder.buildPreviews({items:[item],fetcher,outputDir:directory,logger,now});
    assert.equal(result.created,1);assert.equal(result.failures,0);assert.equal(item.download,item.image);
    const encoded=await sharp(await fs.readFile(path.join(directory,previews.filenameFor(item)))).metadata();
    assert.equal(encoded.format,'webp');assert.equal(encoded.width,1280);assert.equal(encoded.height,853);
    const reused=await builder.buildPreviews({items:[item],previous:result.manifest,fetcher:async()=>{throw Error('No refetch');},outputDir:directory,logger,now});
    assert.equal(reused.reused,1);
    const bogus=repositories.normalizeRepository([record({revision,width:4000,height:3000})],'wallcolle')[0];
    const failed=await builder.buildPreviews({items:[bogus],fetcher,outputDir:directory,logger,now});assert.equal(failed.failures,1);
    await fs.writeFile(path.join(directory,'unrelated.webp'),'preserve');
    await builder.buildPreviews({items:[],outputDir:directory,logger,now});
    assert.equal(await fs.readFile(path.join(directory,'unrelated.webp'),'utf8'),'preserve');
    assert.deepEqual((await fs.readdir(directory)).filter(file=>file.startsWith('wallcolle-')),[]);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
