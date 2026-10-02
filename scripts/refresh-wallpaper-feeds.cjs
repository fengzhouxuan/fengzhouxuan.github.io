const fs=require('node:fs/promises');
const path=require('node:path');
const feeds=require('../source/wallpapers/feeds.js');
const repositories=require('../source/wallpapers/repositories.js');
const morevna=require('../source/wallpapers/morevna.js');
const revoy=require('../source/wallpapers/revoy.js');
const crypto=require('node:crypto');
const {collectAyomi}=require('./collect-ayomi.cjs');
const {collectOpenGameArt}=require('./collect-opengameart.cjs');
const {collectTyson}=require('./collect-tyson.cjs');
const {collectHDWallpapers}=require('./collect-hdwallpapers.cjs');
const {collectBlender}=require('./collect-blender.cjs');
const {collectUnicorn}=require('./collect-unicorn.cjs');
const catalogPath=path.resolve(__dirname,'../source/wallpapers/data/official-feeds.json');
const userAgent='RabbitWallpaperStation/1.0 (static open-license catalog)';

function jpegDimensions(bytes){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let offset=2;
  while(offset+4<=bytes.length){
    if(bytes[offset]!==0xff)return null;
    const marker=bytes[offset+1];
    if(marker===0xff){offset++;continue;}
    if(marker===0xda||marker===0xd9)return null;
    if(marker===0x01||marker>=0xd0&&marker<=0xd8){offset+=2;continue;}
    const length=(bytes[offset+2]<<8)|bytes[offset+3];
    if(length<2||offset+2+length>bytes.length)return null;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      if(length<8)return null;
      return {height:(bytes[offset+5]<<8)|bytes[offset+6],width:(bytes[offset+7]<<8)|bytes[offset+8]};
    }
    offset+=2+length;
  }
  return null;
}

function imageDimensions(bytes){
  const be32=offset=>bytes[offset]*16777216+bytes[offset+1]*65536+bytes[offset+2]*256+bytes[offset+3];
  const le24=offset=>bytes[offset]+bytes[offset+1]*256+bytes[offset+2]*65536;
  const ascii=(offset,value)=>[...value].every((letter,index)=>bytes[offset+index]===letter.charCodeAt(0));
  if(bytes.length>=24&&bytes[0]===137&&ascii(1,'PNG\r\n\x1a\n')&&ascii(12,'IHDR'))return {width:be32(16),height:be32(20)};
  if(bytes.length>=30&&ascii(0,'RIFF')&&ascii(8,'WEBP')){
    if(ascii(12,'VP8X'))return {width:le24(24)+1,height:le24(27)+1};
    if(ascii(12,'VP8L')&&bytes[20]===47)return {width:1+((bytes[21]+bytes[22]*256)&16383),height:1+((bytes[22]>>6)+bytes[23]*4+(bytes[24]&15)*1024)};
    if(ascii(12,'VP8 ')&&ascii(23,'\x9d\x01\x2a'))return {width:(bytes[26]+bytes[27]*256)&16383,height:(bytes[28]+bytes[29]*256)&16383};
  }
  return jpegDimensions(bytes);
}

async function request(fetcher,url,headers={}){
  const response=await fetcher(url,{headers:{'User-Agent':userAgent,...headers},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('图源返回 HTTP '+response.status);
  return response;
}

async function readDimensions(fetcher,url){
  const response=await request(fetcher,url,{Range:'bytes=0-262143'}),reader=response.body.getReader();
  let bytes=new Uint8Array(0);
  try{
    while(bytes.length<262144){
      const {done,value}=await reader.read();if(done)break;
      const next=new Uint8Array(Math.min(262144,bytes.length+value.length));next.set(bytes);next.set(value.subarray(0,next.length-bytes.length),bytes.length);bytes=next;
      const dimensions=imageDimensions(bytes);if(dimensions)return dimensions;
    }
    throw Error('无法读取 JPEG / PNG / WebP 原始尺寸');
  }finally{await reader.cancel();}
}

function metURL(now){
  const url=new URL('https://collectionapi.metmuseum.org/public/collection/v1.1/search');
  Object.entries({hasImages:'true',departmentId:'11',q:'landscape',limit:'32',offset:String(Math.floor(now.getTime()/86400000)%6*32)}).forEach(([key,value])=>url.searchParams.set(key,value));
  return url.href;
}

async function readRepositoryBlob(fetcher,base,entry){
  if(!entry||!Number.isSafeInteger(entry.size)||entry.size<1||entry.size>131072||typeof entry.sha!=='string'||! /^[a-f0-9]{40}$/.test(entry.sha))throw Error('仓库许可文件无效或超过大小限制');
  const blob=await (await request(fetcher,base+'/git/blobs/'+entry.sha)).json();
  if(blob.encoding!=='base64'||typeof blob.content!=='string'||blob.content.length>180000)throw Error('仓库许可文件无法读取');
  const bytes=Buffer.from(blob.content,'base64'),revision=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(bytes.length!==entry.size||revision!==entry.sha)throw Error('仓库许可文件与提交版本不一致');
  return bytes.toString('utf8');
}

async function repositoryFiles(provider,fetcher){
  const source=repositories.sources[provider];
  if(source.host==='gitlab'){
    const license=await (await request(fetcher,'https://gitlab.com/api/v4/projects/68715866/repository/files/README.md/raw?ref=main')).text();
    if(!/All wallpapers are free to use under.*CC0 1\.0/.test(license))throw Error('仓库的图片许可声明已变化');
    const files=[];
    for(let page=1;page<=10;page++){
      const entries=await (await request(fetcher,'https://gitlab.com/api/v4/projects/68715866/repository/tree?recursive=true&ref=main&per_page=100&page='+page)).json();
      if(!Array.isArray(entries))throw Error('仓库文件列表格式错误');
      files.push(...entries.filter(entry=>entry.type==='blob').map(entry=>({path:entry.path,revision:entry.id})));
      if(entries.length<100)return files;
    }
    throw Error('仓库目录未能完整读取');
  }
  const base='https://api.github.com/repos/'+source.repo;
  if(provider==='pop'){
    const commit=await (await request(fetcher,base+'/commits/'+source.ref)).json();
    if(typeof commit.sha!=='string'||! /^[a-f0-9]{40}$/.test(commit.sha))throw Error('壁纸仓库提交版本无法核对');
    const tree=await (await request(fetcher,base+'/git/trees/'+commit.sha+'?recursive=1')).json();
    if(tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>10000)throw Error('仓库目录未能完整读取');
    const files=new Map();
    for(const entry of tree.tree){
      if(entry.type!=='blob'||!repositories.validPath(entry.path,provider)&&entry.path!=='README.md')continue;
      if(typeof entry.sha!=='string'||! /^[a-f0-9]{40}$/.test(entry.sha)||files.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<1)throw Error('壁纸仓库包含无效文件');
      files.set(entry.path,entry);
    }
    const manifest=files.get('README.md'),declaration=repositories.parsePopDeclaration(await readRepositoryBlob(fetcher,base,manifest));
    if(declaration===null)throw Error('仓库的作者及逐文件许可清单结构已变化');
    return declaration.flatMap(record=>{
      const file=files.get(record.path);
      return file&&file.size<=32*1024*1024?[{...record,revision:file.sha,commit:commit.sha,declarationRevision:manifest.sha}]:[];
    });
  }
  if(source.commitPinned){
    const commit=await (await request(fetcher,base+'/commits/'+source.ref)).json();
    if(typeof commit.sha!=='string'||! /^[a-f0-9]{40}$/.test(commit.sha))throw Error('壁纸仓库提交版本无法核对');
    const tree=await (await request(fetcher,base+'/git/trees/'+commit.sha+'?recursive=1')).json();
    if(tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>10000)throw Error('仓库目录未能完整读取');
    const files=new Map();
    for(const entry of tree.tree){
      if(entry.type!=='blob'||!repositories.validPath(entry.path,provider)&&!['README.md','LICENSE'].includes(entry.path))continue;
      if(typeof entry.sha!=='string'||! /^[a-f0-9]{40}$/.test(entry.sha)||files.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<1)throw Error('壁纸仓库包含无效文件');
      files.set(entry.path,entry);
    }
    const readme=files.get('README.md'),license=files.get('LICENSE');
    const declaration=await readRepositoryBlob(fetcher,base,readme),legal=await readRepositoryBlob(fetcher,base,license);
    if(!repositories.sermorDeclarationLicensed(declaration,legal,provider))throw Error('仓库的作者或图片许可声明已变化');
    const declarationRevision=crypto.createHash('sha1').update(readme.sha+'\0'+license.sha).digest('hex');
    return [...files.values()].filter(entry=>repositories.validPath(entry.path,provider)&&entry.size<=32*1024*1024).map(entry=>({path:entry.path,revision:entry.sha,commit:commit.sha,declarationRevision}));
  }
  if(provider==='wallcolle'){
    const commit=await (await request(fetcher,base+'/commits/'+source.ref)).json();
    if(typeof commit.sha!=='string'||! /^[a-f0-9]{40}$/.test(commit.sha))throw Error('壁纸仓库提交版本无法核对');
    const tree=await (await request(fetcher,base+'/git/trees/'+commit.sha+'?recursive=1')).json();
    if(tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>10000)throw Error('仓库目录未能完整读取');
    const files=new Map(),manifests=[];
    for(const entry of tree.tree){
      if(entry.type!=='blob')continue;
      if(!repositories.validPath(entry.path,provider)&&!/^contributors\/[a-zA-Z0-9_-]{1,80}\/me\.json$/.test(entry.path))continue;
      if(typeof entry.sha!=='string'||! /^[a-f0-9]{40}$/.test(entry.sha)||files.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<1)throw Error('壁纸仓库包含无效文件');
      files.set(entry.path,entry);
      if(entry.path.endsWith('/me.json'))manifests.push(entry);
    }
    if(!manifests.length)throw Error('壁纸仓库缺少逐图许可清单');
    const records=[];
    for(const manifest of manifests){
      const declared=repositories.parseWallcolleDeclaration(JSON.parse(await readRepositoryBlob(fetcher,base,manifest)),manifest.path);
      if(declared===null)throw Error('逐图许可清单结构已变化');
      for(const record of declared){
        const image=files.get(record.path);
        if(image&&image.size<=32*1024*1024)records.push({...record,revision:image.sha,commit:commit.sha,declarationRevision:manifest.sha});
      }
    }
    return records;
  }
  const licenseFile=['folium','agundur'].includes(provider)?'README.md':'LICENSE';
  const license=await (await request(fetcher,base+'/contents/'+licenseFile+'?ref='+source.ref)).json();
  if(license.encoding!=='base64'||typeof license.content!=='string')throw Error('无法核对仓库图片许可');
  const declaration=Buffer.from(license.content,'base64').toString('utf8');
  const declared=provider==='agundur'?repositories.parseAgundurDeclaration(declaration):null;
  if(provider==='agundur'?declared===null:provider==='folium'?!/wallpapers.*released under CC:BY 4\.0/i.test(declaration):!declaration.includes('CC0 1.0 Universal'))throw Error('仓库的图片许可声明已变化');
  const tree=await (await request(fetcher,base+'/git/trees/'+source.ref+'?recursive=1')).json();
  if(tree.truncated||!Array.isArray(tree.tree))throw Error('仓库目录未能完整读取');
  const approved=provider==='agundur'?new Map(declared.map(record=>[record.path,record])):null;
  return tree.tree.filter(entry=>entry.type==='blob'&&(!approved||approved.has(entry.path))).map(entry=>({path:entry.path,revision:entry.sha,...(approved?.get(entry.path)||{})}));
}

async function collectRepository(provider,{fetcher,dimensions,old,logger}){
  const source=repositories.sources[provider],files=await repositoryFiles(provider,fetcher);
  const known=new Map(old.map(item=>[item.feedRecord.path,item.feedRecord]));
  const candidates=files.filter(file=>repositories.validPath(file.path,provider));
  const records=new Array(candidates.length);let next=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<candidates.length){
      const index=next++,file=candidates[index],saved=known.get(file.path);
      try{
        let size;
        if(saved?.revision===file.revision)size={width:saved.width,height:saved.height};
        else{
          const urls=repositories.urlsFor(file.path,provider,file.commit);
          try{size=await dimensions(fetcher,urls.image);}
          catch(error){if(!urls.fallbackImage)throw error;size=await dimensions(fetcher,urls.fallbackImage);}
        }
        records[index]={...file,...size,license:file.license||source.license,licenseUrl:file.licenseUrl||source.licenseUrl};
      }catch(e){
        if(source.commitPinned&&saved)records[index]={...saved};
        logger.warn('跳过暂时无法读取的仓库壁纸：'+file.path);
      }
    }
  }));
  const collected=records.filter(Boolean);
  if(candidates.length&&!collected.length)throw Error('所有候选图片均无法读取，保留上次目录');
  return collected;
}

async function collectPepper({fetcher=fetch,dimensions=readDimensions,old=[],logger=console}={}){
  const previous=feeds.normalizeFeed((Array.isArray(old)?old:[]).map(item=>item?.feedRecord),'pepper');
  const known=new Map(previous.map(item=>[item.feedRecord.filename,item.feedRecord]));
  let wallpapers=previous.filter(item=>item.feedRecord.kind!=='artwork').map(item=>item.feedRecord);
  let artworks=previous.filter(item=>item.feedRecord.kind==='artwork').map(item=>item.feedRecord),updated=0;
  try{
    const response=await request(fetcher,feeds.pepperPage),candidates=feeds.parsePepperIndex(await response.text()),checked=[];
    for(const raw of candidates){
      const saved=known.get(raw.filename);
      try{checked.push({...raw,...(saved&&saved.download===raw.download?{width:saved.width,height:saved.height}:await dimensions(fetcher,raw.download))});}
      catch(error){if(saved?.kind!=='artwork'&&saved)checked.push(saved);logger.warn('跳过无法读取尺寸的壁纸：'+raw.filename);}
    }
    const validated=feeds.normalizeFeed(checked,'pepper');
    if(!validated.length)throw Error('壁纸目录没有符合尺寸与许可的图片');
    wallpapers=validated.map(item=>item.feedRecord);updated++;
  }catch(error){logger.warn('Pepper&Carrot 壁纸更新失败，保留 '+wallpapers.length+' 张：'+error.message);}
  try{
    const response=await request(fetcher,feeds.pepperArtworkPage),gallery=feeds.parsePepperGallery(await response.text());
    if(!gallery.length)throw Error('插画目录无法解析');
    const titles=new Set(wallpapers.map(item=>feeds.pepperWorkKey(item.filename)));
    const candidates=gallery.filter(item=>!titles.has(feeds.pepperWorkKey(item.filename))),checked=new Array(candidates.length);let next=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(next<candidates.length){
        const index=next++,candidate=candidates[index],saved=known.get(candidate.filename);let html;
        try{html=await (await request(fetcher,candidate.pageUrl)).text();}
        catch(error){if(saved?.kind==='artwork')checked[index]=saved;logger.warn('插画来源页暂不可用：'+candidate.filename);continue;}
        const raw=feeds.parsePepperArtwork(html,candidate);
        if(!raw){logger.warn('插画的作者、许可或原图声明不符合要求：'+candidate.filename);continue;}
        try{checked[index]={...raw,...(saved&&saved.download===raw.download?{width:saved.width,height:saved.height}:await dimensions(fetcher,raw.download))};}
        catch(error){if(saved?.kind==='artwork')checked[index]=saved;logger.warn('跳过无法读取尺寸的插画：'+candidate.filename);}
      }
    }));
    artworks=checked.filter(Boolean);updated++;
  }catch(error){logger.warn('Pepper&Carrot 插画更新失败，保留 '+artworks.length+' 张：'+error.message);}
  if(!updated)throw Error('壁纸与插画目录均无法更新');
  return [...wallpapers,...artworks];
}

async function collectMorevna({fetcher=fetch,dimensions=readDimensions,old=[],logger=console}={}){
  const gallery=await (await request(fetcher,morevna.source.gallery)).text();
  if(!morevna.galleryLicensed(gallery))throw Error('官方画廊的图片许可声明无法核对');
  const terms=await (await request(fetcher,morevna.source.api+'artwork_category?slug=artworks,backgrounds')).json();
  if(!Array.isArray(terms)||Object.entries(morevna.categories).some(([slug,id])=>!terms.some(term=>term?.id===id&&term.slug===slug&&term.taxonomy==='artwork_category')))throw Error('官方插画与场景分类已变化');
  const posts=[],seen=new Set();let pages=1,total;
  for(let page=1;page<=pages;page++){
    const url=new URL(morevna.source.api+'artwork');
    Object.entries({artwork_category:Object.values(morevna.categories).join(','),per_page:'100',page:String(page),_embed:'wp:featuredmedia,wp:term'}).forEach(([key,value])=>url.searchParams.set(key,value));
    const response=await request(fetcher,url.href),entries=await response.json();
    const pageCount=response.headers?.get('X-WP-TotalPages'),count=response.headers?.get('X-WP-Total');
    if(!/^\d+$/.test(pageCount)||!/^\d+$/.test(count)||Number(pageCount)>10||Number(count)>1000||!Array.isArray(entries)||entries.length>100)throw Error('插画分页目录无法完整读取');
    if(page===1){pages=Number(pageCount);total=Number(count);if(total>0&&pages<1||pages!==Math.ceil(total/100))throw Error('插画分页总数不一致');}
    if(Number(pageCount)!==pages||Number(count)!==total)throw Error('插画目录在分页过程中变化');
    for(const entry of entries){if(!Number.isSafeInteger(entry?.id)||entry.id<1||seen.has(entry.id))throw Error('插画目录包含无效或重复作品');seen.add(entry.id);posts.push(entry);}
  }
  if(posts.length!==total)throw Error('插画目录尚未完整读取');
  const previous=morevna.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),known=new Map(previous.map(item=>[item.feedRecord.workID,item.feedRecord]));
  const candidates=posts.map(morevna.parseWork).filter(Boolean),records=new Array(candidates.length);let next=0,failed=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<candidates.length){
      const index=next++,raw=candidates[index],saved=known.get(raw.workID);
      if(saved&&saved.download===raw.download&&saved.mediaID===raw.mediaID&&saved.revision===raw.revision&&saved.mediaWidth===raw.mediaWidth&&saved.mediaHeight===raw.mediaHeight){records[index]={...raw,width:saved.width,height:saved.height,...(raw.image===raw.download?{imageWidth:saved.width,imageHeight:saved.height}:{})};continue;}
      try{
        const size=await dimensions(fetcher,raw.download);
        const checked={...raw,...size,...(raw.image===raw.download?{imageWidth:size.width,imageHeight:size.height}:{})};
        if(!morevna.normalizeRecords([checked]).length||size.width<raw.mediaWidth||size.height<raw.mediaHeight){logger.warn('原图尺寸与作品数据不一致：'+raw.title);continue;}
        records[index]=checked;
      }catch(error){failed++;if(saved&&saved.download===raw.download)records[index]=saved;logger.warn('原图暂不可用，跳过新图或保留已验证图片：'+raw.title);}
    }
  }));
  if(candidates.length&&failed===candidates.length&&!records.some(Boolean))throw Error('所有候选原图均无法读取');
  return records.filter(Boolean);
}

async function collectRevoy({fetcher=fetch,dimensions=readDimensions,old=[],existingWorks=[],logger=console}={}){
  const discovered=revoy.parseGallery(await (await request(fetcher,revoy.source.gallery)).text());
  if(!discovered.length)throw Error('作者画廊无法完整解析');
  const duplicates=new Set(feeds.normalizeFeed((Array.isArray(existingWorks)?existingWorks:[]).map(item=>item?.feedRecord),'pepper').map(item=>item.feedRecord.filename.toLowerCase()));
  const gallery=discovered.filter(item=>!duplicates.has(item.filename.toLowerCase()));
  const previous=revoy.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),known=new Map(previous.map(item=>[item.feedRecord.filename,item.feedRecord]));
  const checked=new Array(gallery.length);let next=0,limited=false;
  async function lookup(url,method='GET'){
    if(limited)throw Error('作者图源要求冷却');
    const response=await fetcher(url,{method,headers:{'User-Agent':userAgent},signal:AbortSignal.timeout(20000)});
    if(response.status===429||response.status===503)limited=true;
    if(!response.ok)throw Error('图片元数据返回 HTTP '+response.status);
    return response;
  }
  async function metadata(url){
    const response=await lookup(url,'HEAD');
    const modified=response.headers.get('last-modified');
    if(!Number.isFinite(Date.parse(modified))||!/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('图片修改时间或格式无效');
    return modified;
  }
  await Promise.all(Array.from({length:3},async()=>{
    while(next<gallery.length){
      const index=next++,candidate=gallery[index],saved=known.get(candidate.filename);
      if(limited){if(saved)checked[index]=saved;continue;}
      let raw;
      try{raw=revoy.parseWork(await (await lookup(candidate.pageUrl)).text(),candidate);}
      catch(error){if(saved)checked[index]=saved;logger.warn('作者作品页暂不可用：'+candidate.filename);continue;}
      if(!raw)continue;
      try{
        const modified=await metadata(raw.download),previewModified=await metadata(raw.image),revision=crypto.createHash('sha256').update(JSON.stringify([raw.download,raw.image,modified,previewModified])).digest('hex');
        const reusable=saved&&saved.revision===revision;
        const original=reusable?{width:saved.width,height:saved.height}:await dimensions(fetcher,raw.download);
        const preview=reusable?{width:saved.imageWidth,height:saved.imageHeight}:await dimensions(fetcher,raw.image);
        checked[index]={...raw,...original,imageWidth:preview.width,imageHeight:preview.height,modified,previewModified,revision};
      }catch(error){if(saved)checked[index]={...saved,...raw};logger.warn('作者图片暂不可读取：'+candidate.filename);}
    }
  }));
  if(limited)throw Error('作者图源要求冷却，保留上次目录');
  return checked.filter(Boolean);
}

async function refreshCatalog({previous,fetcher=fetch,now=new Date(),dimensions=readDimensions,logger=console,providerIds=Object.keys(feeds.providers),ayomiOptions={},openGameArtOptions={},hdWallpapersOptions={},blenderOptions={},unicornOptions={}}={}){
  if(providerIds.some(provider=>!Object.hasOwn(feeds.providers,provider)))throw Error('壁纸来源不存在');
  const catalog={version:1,generatedAt:now.toISOString(),updatedAt:{},continuation:{},records:{}};
  if(previous?.version===1)for(const provider of Object.keys(feeds.providers))if(!providerIds.includes(provider)&&Array.isArray(previous.records?.[provider])){
    catalog.records[provider]=feeds.normalizeFeed(previous.records[provider],provider).map(item=>item.feedRecord);
    catalog.updatedAt[provider]=previous.updatedAt?.[provider]||null;
    if(['ayomi','opengameart','hdwallpapers','blender','unicorn'].includes(provider))catalog.continuation[provider]=previous.continuation?.[provider]||null;
  }
  let failures=0;
  for(const provider of providerIds){
    const old=feeds.normalizeFeed(previous?.version===1?previous.records?.[provider]:[],provider);
    try{
      let records,ayomiResult,sceneResult,hdResult,blenderResult,unicornResult;
      if(Object.hasOwn(repositories.sources,provider)){
        records=await collectRepository(provider,{fetcher,dimensions,old,logger});
      }else if(provider==='pepper'){
        records=await collectPepper({fetcher,dimensions,old,logger});
      }else if(provider==='morevna'){
        records=await collectMorevna({fetcher,dimensions,old,logger});
      }else if(provider==='revoy'){
        records=await collectRevoy({fetcher,dimensions,old,logger,existingWorks:feeds.normalizeFeed(catalog.records.pepper||previous?.records?.pepper,'pepper')});
      }else if(provider==='tyson'){
        records=await collectTyson({fetcher,dimensions,old,logger});
      }else if(provider==='hdwallpapers'){
        hdResult=await collectHDWallpapers({...hdWallpapersOptions,fetcher,old,logger,now,retryAt:previous?.continuation?.hdwallpapers?.retryAt});
        records=hdResult.records;catalog.continuation.hdwallpapers=hdResult.retryAt?{retryAt:hdResult.retryAt}:null;if(hdResult.interrupted)failures++;
      }else if(provider==='ayomi'){
        ayomiResult=await collectAyomi({...ayomiOptions,fetcher,dimensions,old,logger,now,continuation:previous?.version===1?previous.continuation?.ayomi:null});
        records=ayomiResult.records;catalog.continuation.ayomi=ayomiResult.continuation;if(ayomiResult.interrupted)failures++;
      }else if(provider==='opengameart'){
        sceneResult=await collectOpenGameArt({...openGameArtOptions,fetcher,old,logger,now,retryAt:previous?.continuation?.opengameart?.retryAt});
        records=sceneResult.records;catalog.continuation.opengameart=sceneResult.retryAt?{retryAt:sceneResult.retryAt}:null;if(sceneResult.interrupted)failures++;
      }else if(provider==='blender'){
        blenderResult=await collectBlender({...blenderOptions,fetcher,old,logger,now,retryAt:previous?.continuation?.blender?.retryAt});
        records=blenderResult.records;catalog.continuation.blender=blenderResult.retryAt?{retryAt:blenderResult.retryAt}:null;if(blenderResult.interrupted)failures++;
      }else if(provider==='unicorn'){
        unicornResult=await collectUnicorn({...unicornOptions,fetcher,old,logger,now,retryAt:previous?.continuation?.unicorn?.retryAt});
        records=unicornResult.records;catalog.continuation.unicorn=unicornResult.retryAt?{retryAt:unicornResult.retryAt}:null;if(unicornResult.interrupted)failures++;
      }else{
        const response=await request(fetcher,metURL(now)),payload=await response.json();records=[];
        const known=new Map(old.map(item=>[item.feedRecord.objectID,item.feedRecord]));
        for(const id of Array.isArray(payload?.objectIDs)?payload.objectIDs.slice(0,32):[]){
          if(!Number.isSafeInteger(id)||id<1)continue;
          try{
            const detail=await request(fetcher,'https://collectionapi.metmuseum.org/public/collection/v1/objects/'+id),raw=await detail.json();
            if(raw.objectID!==id||raw.isPublicDomain!==true||raw.objectName!=='Painting'||typeof raw.primaryImage!=='string'||!raw.primaryImage.startsWith('https://images.metmuseum.org/CRDImages/'))continue;
            const saved=known.get(id);
            records.push({...raw,...(saved&&saved.primaryImage===raw.primaryImage?{width:saved.width,height:saved.height}:await dimensions(fetcher,raw.primaryImage))});
          }catch(e){logger.warn('跳过无法读取的馆藏作品：'+id);}
        }
      }
      let items=feeds.normalizeFeed(records,provider);if(!items.length&&!['pepper','morevna','ayomi','opengameart','revoy','tyson','hdwallpapers','blender','unicorn'].includes(provider)&&!Object.hasOwn(repositories.sources,provider))throw Error('没有符合尺寸与许可要求的图片');
      if(provider==='met')items=[...new Map([...old,...items].map(item=>[item.id,item])).values()];
      catalog.records[provider]=items.map(item=>item.feedRecord);catalog.updatedAt[provider]=(ayomiResult&&!ayomiResult.updated||sceneResult&&!sceneResult.updated||hdResult&&!hdResult.updated||blenderResult&&!blenderResult.updated||unicornResult&&!unicornResult.updated)?previous?.updatedAt?.[provider]||null:now.toISOString();
      logger.log(feeds.providers[provider].name+'：'+items.length+' 张');
    }catch(e){
      failures++;catalog.records[provider]=old.map(item=>item.feedRecord);catalog.updatedAt[provider]=previous?.updatedAt?.[provider]||null;
      if(provider==='ayomi')catalog.continuation.ayomi=previous?.version===1?previous.continuation?.ayomi||null:null;
      if(provider==='opengameart')catalog.continuation.opengameart=previous?.version===1?previous.continuation?.opengameart||null:null;
      if(provider==='hdwallpapers')catalog.continuation.hdwallpapers=previous?.version===1?previous.continuation?.hdwallpapers||null:null;
      if(provider==='blender')catalog.continuation.blender=previous?.version===1?previous.continuation?.blender||null:null;
      if(provider==='unicorn')catalog.continuation.unicorn=previous?.version===1?previous.continuation?.unicorn||null:null;
      logger.warn(feeds.providers[provider].name+'更新失败，保留 '+old.length+' 张已有图片：'+e.message);
    }
  }
  return {catalog,failures};
}

function mergeCatalogs(seed,cached){
  const catalog={version:1,updatedAt:{},continuation:{},records:{}};
  const timestamp=(value,provider)=>value?.version===1&&typeof value.updatedAt?.[provider]==='string'?Date.parse(value.updatedAt[provider]):NaN;
  for(const provider of Object.keys(feeds.providers)){
    const seeded=feeds.normalizeFeed(seed?.version===1?seed.records?.[provider]:[],provider),restored=feeds.normalizeFeed(cached?.version===1?cached.records?.[provider]:[],provider);
    const seedTime=timestamp(seed,provider),cachedTime=timestamp(cached,provider);
    const hasSeed=Number.isFinite(seedTime)&&Array.isArray(seed?.records?.[provider]);
    const hasCached=Number.isFinite(cachedTime)&&Array.isArray(cached?.records?.[provider]);
    const useSeed=hasSeed&&(!hasCached||seedTime>cachedTime);
    catalog.records[provider]=(useSeed?seeded:restored).map(item=>item.feedRecord);
    catalog.updatedAt[provider]=(useSeed?seed:cached)?.updatedAt?.[provider]||null;
    if(provider==='ayomi')catalog.continuation.ayomi=(useSeed?seed:cached)?.continuation?.ayomi||null;
    if(provider==='opengameart')catalog.continuation.opengameart=(useSeed?seed:cached)?.continuation?.opengameart||null;
    if(provider==='hdwallpapers')catalog.continuation.hdwallpapers=(useSeed?seed:cached)?.continuation?.hdwallpapers||null;
    if(provider==='blender')catalog.continuation.blender=(useSeed?seed:cached)?.continuation?.blender||null;
    if(provider==='unicorn')catalog.continuation.unicorn=(useSeed?seed:cached)?.continuation?.unicorn||null;
  }
  return catalog;
}

async function main(){
  let previous;
  try{previous=JSON.parse(await fs.readFile(catalogPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(process.env.WALLPAPER_SEED_CATALOG){
    const seed=JSON.parse(await fs.readFile(process.env.WALLPAPER_SEED_CATALOG,'utf8'));previous=mergeCatalogs(seed,previous);
  }
  let previewRetryAt;
  try{previewRetryAt=JSON.parse(await fs.readFile(path.join(path.dirname(catalogPath),'previews.json'),'utf8')).authorRetryAt;}
  catch(error){if(error.code!=='ENOENT')console.warn('预览缓存冷却信息无法读取，继续核对图源目录');}
  const {catalog,failures}=await refreshCatalog({previous,ayomiOptions:{retryAt:previewRetryAt}});
  if(!feeds.normalizeCatalog(catalog).length)throw Error('所有图源均不可用，目录未改写');
  const temporary=catalogPath+'.tmp';await fs.writeFile(temporary,JSON.stringify(catalog,null,2)+'\n');await fs.rename(temporary,catalogPath);
  if(failures)console.warn('部分图源未更新，站点构建可继续使用已有目录。');
}

module.exports={jpegDimensions,imageDimensions,readDimensions,metURL,repositoryFiles,collectRepository,collectPepper,collectMorevna,collectRevoy,refreshCatalog,mergeCatalogs};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
