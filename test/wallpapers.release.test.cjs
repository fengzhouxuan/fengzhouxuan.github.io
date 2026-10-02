const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),sharp=require('sharp');
const feeds=require('../source/wallpapers/feeds.js'),previews=require('../source/wallpapers/previews.js');
const seed=require('../source/wallpapers/data/official-feeds.json');
const {buildPreviews}=require('../scripts/build-wallpaper-previews.cjs');
const {verifyRelease}=require('../scripts/verify-wallpaper-release.cjs');
const logger={log(){},warn(){}},digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wallpaper-release-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const catalog={version:1,records:{}},native={};
  for(const provider of ['opengameart','hdwallpapers','blender','unicorn']){
    const base=seed.records[provider].find(record=>record.extension==='png')||seed.records[provider][0];
    const width=provider==='hdwallpapers'?base.width:2000,height=provider==='hdwallpapers'?base.height:1000;
    const decoder=sharp({create:{width,height,channels:3,background:'#769db2'}});
    const bytes=await (base.extension==='png'?decoder.png():decoder.jpeg()).toBuffer();
    catalog.records[provider]=[{...base,width,height,bytes:bytes.length,revision:digest(bytes)}];native[provider]=bytes;
  }
  catalog.records.ayomi=[{...seed.records.ayomi[0],width:1024,height:1536,imageWidth:640,imageHeight:960}];
  catalog.records.met=[{objectID:1,title:'Landscape',artistDisplayName:'Artist',isPublicDomain:true,objectName:'Painting',width:2000,height:1000,primaryImage:'https://images.metmuseum.org/CRDImages/ep/original/test.jpg',primaryImageSmall:'https://images.metmuseum.org/CRDImages/ep/web-large/test.jpg',objectURL:'https://www.metmuseum.org/art/collection/search/1'}];
  const items=feeds.normalizeCatalog(catalog);assert.equal(items.length,6);
  for(const item of items.filter(item=>native[item.provider])){
    const file=path.join(root,item.download);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,native[item.provider]);
  }
  const author=items.find(item=>item.provider==='ayomi'),authorBytes=await sharp({create:{width:640,height:960,channels:3,background:'#d1a7be'}}).toFormat(author.image.endsWith('.webp')?'webp':author.image.endsWith('.png')?'png':'jpeg').toBuffer();
  const outputDir=path.join(root,'previews'),result=await buildPreviews({items,outputDir,originalsDir:path.join(root,'originals/opengameart'),hdOriginalsDir:path.join(root,'originals/hdwallpapers'),blenderOriginalsDir:path.join(root,'originals/blender'),unicornOriginalsDir:path.join(root,'originals/unicorn'),logger,fetcher:async url=>{assert.equal(url,author.image);return new Response(authorBytes);}});
  assert.equal(result.created,5);assert.equal(result.failures,0);
  await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/official-feeds.json'),JSON.stringify(catalog));await fs.writeFile(path.join(root,'data/previews.json'),JSON.stringify(result.manifest));
  return {root,catalog,manifest:result.manifest,items,native};
}

test('release verification decodes all claimed assets and preserves licensed external originals',async t=>{
  const {root}=await fixture(t);
  assert.deepEqual(await verifyRelease({root,logger}),{items:6,providers:6,originals:4,previews:5,fallbacks:0});
});

test('missing originals block release for every source with same-site downloads',async t=>{
  for(const provider of ['opengameart','hdwallpapers','blender','unicorn']){
    const {root,items}=await fixture(t),item=items.find(item=>item.provider===provider);await fs.unlink(path.join(root,item.download));
    await assert.rejects(verifyRelease({root,logger}),/发布文件缺失：\.\/originals\//);
  }
});

test('original byte changes and advertised dimensions cannot pass the publication gate',async t=>{
  const {root,catalog,items,native}=await fixture(t),item=items.find(item=>item.provider==='opengameart'),file=path.join(root,item.download);
  const changed=Buffer.from(native.opengameart);changed[30]^=1;await fs.writeFile(file,changed);
  await assert.rejects(verifyRelease({root,logger}),/原图字节或摘要不符/);
  await fs.writeFile(file,native.opengameart);catalog.records.opengameart[0].width=2100;await fs.writeFile(path.join(root,'data/official-feeds.json'),JSON.stringify(catalog));
  await assert.rejects(verifyRelease({root,logger}),/原图格式或尺寸不符/);
});

test('even a matching digest cannot certify a truncated native image',async t=>{
  const {root,catalog,items,native}=await fixture(t),item=items.find(item=>item.provider==='opengameart'),bytes=native.opengameart.subarray(0,native.opengameart.length-30),record=catalog.records.opengameart[0];
  record.bytes=bytes.length;record.revision=digest(bytes);
  const updated=feeds.normalizeFeed([record],'opengameart')[0];await fs.writeFile(path.join(root,updated.download),bytes);await fs.writeFile(path.join(root,'data/official-feeds.json'),JSON.stringify(catalog));
  await assert.rejects(verifyRelease({root,logger}),/原图无法完整解码/);
});

test('claimed previews must exist, match their bytes and decode to the recorded format and size',async t=>{
  const {root,items,manifest}=await fixture(t),item=items.find(item=>item.provider==='ayomi'),file=path.join(root,previews.previewFor(item,manifest)),bytes=await fs.readFile(file);
  await fs.unlink(file);await assert.rejects(verifyRelease({root,logger}),/发布文件缺失：\.\/previews\//);
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;await fs.writeFile(file,changed);await assert.rejects(verifyRelease({root,logger}),/预览字节或摘要不符/);
  await fs.writeFile(file,bytes.subarray(0,bytes.length-1));await assert.rejects(verifyRelease({root,logger}),/预览字节或摘要不符/);
  await fs.writeFile(file,bytes);
  const generated=items.find(item=>item.provider==='opengameart'),entry=manifest.images[generated.id];entry.width-=1;await fs.writeFile(path.join(root,'data/previews.json'),JSON.stringify(manifest));
  await assert.rejects(verifyRelease({root,logger}),/预览格式或尺寸不符/);
});

test('missing optional previews retain remote fallbacks, but invalid claimed records fail',async t=>{
  const {root,items,manifest}=await fixture(t),item=items.find(item=>item.provider==='ayomi'),entry=manifest.images[item.id];delete manifest.images[item.id];
  await fs.writeFile(path.join(root,'data/previews.json'),JSON.stringify(manifest));
  assert.deepEqual(await verifyRelease({root,logger}),{items:6,providers:6,originals:4,previews:4,fallbacks:1});
  manifest.images[item.id]={...entry,revision:'wrong'};await fs.writeFile(path.join(root,'data/previews.json'),JSON.stringify(manifest));
  await assert.rejects(verifyRelease({root,logger}),/发布预览记录与图片不一致/);
});

test('invalid catalogs, preview versions and duplicate or unlicensed records cannot pass',async t=>{
  const {root,catalog,manifest}=await fixture(t),file=path.join(root,'data/official-feeds.json'),previewFile=path.join(root,'data/previews.json');
  await fs.writeFile(file,'{bad json');await assert.rejects(verifyRelease({root,logger}),/不是有效 JSON/);
  for(const bad of [{version:2,records:catalog.records},{version:1,records:[]},{version:1,records:{}},{...catalog,records:{...catalog.records,unknown:[]}}, {...catalog,records:{...catalog.records,ayomi:[{...catalog.records.ayomi[0],license:'MIT'}]}},{...catalog,records:{...catalog.records,ayomi:[...catalog.records.ayomi,...catalog.records.ayomi]}}]){
    await fs.writeFile(file,JSON.stringify(bad));await assert.rejects(verifyRelease({root,logger}),/发布壁纸目录/);
  }
  await fs.writeFile(file,JSON.stringify(catalog));
  for(const bad of [{...manifest,version:2},{...manifest,images:[]}]){
    await fs.writeFile(previewFile,JSON.stringify(bad));await assert.rejects(verifyRelease({root,logger}),/发布预览目录结构无效/);
  }
});
