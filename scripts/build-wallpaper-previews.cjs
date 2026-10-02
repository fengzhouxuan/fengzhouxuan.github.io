const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const feeds=require('../source/wallpapers/feeds.js');
const core=require('../source/wallpapers/core.js');
const repositories=require('../source/wallpapers/repositories.js');
const previews=require('../source/wallpapers/previews.js');
const {retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const root=path.resolve(__dirname,'../source/wallpapers');
const outputPath=path.join(root,'data/previews.json');

async function readImage(fetcher,url,{maxBytes=32*1024*1024,timeout=25000,range=false,allowEmpty=false}={}){
  const controller=new AbortController();let reader,timer;
  try{
    return await Promise.race([
      (async()=>{
        const response=await fetcher(url,{signal:controller.signal,headers:{'User-Agent':'RabbitWallpaperStation/1.2 (licensed wallpaper previews)',...(range?{Range:'bytes=0-'+(maxBytes-1)}:{})}});
        if(!response.ok){const error=Error('图源返回 HTTP '+response.status);error.status=response.status;error.retryAfter=response.headers?.get?.('retry-after');try{await response.body?.cancel?.();}finally{throw error;}}
        if(Number(response.headers.get('content-length'))>maxBytes)throw Error('原图超过处理大小限制');
        reader=response.body.getReader();const chunks=[];let size=0;
        while(true){
          const {done,value}=await reader.read();if(done)break;
          size+=value.length;if(size>maxBytes)throw Error('原图超过处理大小限制');chunks.push(value);
        }
        if(!size&&!allowEmpty)throw Error('原图内容为空');
        return Buffer.concat(chunks,size);
      })(),
      new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('原图请求超时'));},timeout);})
    ]);
  }finally{clearTimeout(timer);controller.abort();if(reader)await reader.cancel().catch(()=>{});}
}

async function encodePreview(bytes){
  const image=sharp(bytes,{limitInputPixels:60000000}),metadata=await image.metadata();
  if(!['jpeg','png','webp'].includes(metadata.format))throw Error('原图格式不支持预览');
  const {data,info}=await image.rotate().resize({width:previews.maxEdge,height:previews.maxEdge,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer({resolveWithObject:true});
  if(data.length>previews.maxBytes)throw Error('预览图超过大小限制');
  return {data,width:info.width,height:info.height};
}

async function copyAuthorPreview(bytes,item){
  const normalized=feeds.normalizeFeed([item?.feedRecord],item?.provider)[0];
  if(!['ayomi','revoy','tyson','morevna'].includes(normalized?.provider)||normalized.id!==item?.id||bytes.length>previews.authorMaxBytes)throw Error('作者预览的图片或许可无效');
  const metadata=await sharp(bytes,{limitInputPixels:60000000}).metadata();
  if(metadata.format!==({png:'png',jpg:'jpeg',jpeg:'jpeg',webp:'webp'})[normalized.image.split('.').pop().toLowerCase()]||metadata.width!==normalized.feedRecord.imageWidth||metadata.height!==normalized.feedRecord.imageHeight||(metadata.pages||1)!==1)throw Error('作者预览的格式或尺寸已变化');
  return {data:bytes,width:metadata.width,height:metadata.height,digest:crypto.createHash('sha256').update(bytes).digest('hex')};
}

async function cachedPreview(outputDir,filename,entry,author=false){
  try{
    const bytes=await fs.readFile(path.join(outputDir,filename)),metadata=await sharp(bytes).metadata();
    return (author?['jpeg','png','webp'].includes(metadata.format):metadata.format==='webp')&&metadata.width===entry.width&&metadata.height===entry.height&&bytes.length===entry.bytes&&(!author||crypto.createHash('sha256').update(bytes).digest('hex')===entry.digest);
  }catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR'&&error.code)throw error;return false;}
}

async function buildPreviews({items,previous,sourceRetryAt,fetcher=fetch,outputDir=path.join(root,'previews'),originalsDir=path.join(root,'originals/opengameart'),hdOriginalsDir=path.join(root,'originals/hdwallpapers'),blenderOriginalsDir=path.join(root,'originals/blender'),unicornOriginalsDir=path.join(root,'originals/unicorn'),maxNew=120,now=new Date(),logger=console,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay))}={}){
  if(!Number.isSafeInteger(maxNew)||maxNew<0||maxNew>1000)throw Error('预览处理预算无效');
  await fs.mkdir(outputDir,{recursive:true});
  const approved=(Array.isArray(items)?items:[]).flatMap(item=>{
    const normalized=['ayomi','opengameart','revoy','tyson','pepper','morevna','hdwallpapers','blender','unicorn'].includes(item?.provider)?feeds.normalizeFeed([item.feedRecord],item.provider)[0]:repositories.normalizeRepository([item?.feedRecord],item?.provider)[0];return normalized&&normalized.id===item?.id&&previews.filenameFor(normalized)?[normalized]:[];
  });
  const ordered=feeds.mixSources([...new Map(approved.map(item=>[previews.filenameFor(item),item])).values()],core.dayKey(now));
  const manifest={version:previews.version,generatedAt:now.toISOString(),images:{}},pending=[];
  let reused=0,created=0,failures=0,attempted=0,next=0;const limited=new Set();
  for(const item of ordered){
    const filename=previews.filenameFor(item),entry=previous?.images?.[item.id];
    if(previews.previewFor(item,previous)&&await cachedPreview(outputDir,filename,entry,['ayomi','revoy','tyson','pepper','morevna'].includes(item.provider))){
      manifest.images[item.id]=entry;
      const checked=Date.parse(entry.checkedAt);
      if(item.provider==='pepper'&&(checked>now.getTime()||now.getTime()-checked>=previews.recheckAfterMs))pending.push(item);
    }else pending.push(item);
  }
  async function create(item){
      const filename=previews.filenameFor(item);attempted++;
      try{
        let encoded,lastError;
        if(['ayomi','revoy','tyson','morevna'].includes(item.provider)){
          encoded=await copyAuthorPreview(await readImage(fetcher,item.image,{maxBytes:previews.authorMaxBytes}),item);
          if(['revoy','tyson','morevna'].includes(item.provider)){
            encoded=await encodePreview(encoded.data);encoded.digest=crypto.createHash('sha256').update(encoded.data).digest('hex');
          }
        }
        else if(item.provider==='pepper'){
          const bytes=await readImage(fetcher,item.download),metadata=await sharp(bytes,{limitInputPixels:60000000}).metadata();
          if(metadata.format!=='jpeg'||metadata.width!==item.width||metadata.height!==item.height||(metadata.pages||1)!==1||metadata.orientation>=5)throw Error('作者原图的格式或尺寸已变化');
          encoded=await encodePreview(bytes);encoded.digest=crypto.createHash('sha256').update(encoded.data).digest('hex');
        }
        else if(['opengameart','hdwallpapers','blender','unicorn'].includes(item.provider)){
          const directory={opengameart:originalsDir,hdwallpapers:hdOriginalsDir,blender:blenderOriginalsDir,unicorn:unicornOriginalsDir}[item.provider];
          const filename=item.feedRecord.revision+'.'+(item.feedRecord.extension||'jpg'),bytes=await fs.readFile(path.join(directory,filename));
          if(bytes.length!==item.feedRecord.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.feedRecord.revision)throw Error('原图缓存与已验证摘要不一致');
          encoded=await encodePreview(bytes);
        }
        else for(const url of [item.image,item.fallbackImage].filter(Boolean)){
          try{
            const rawFallback=repositories.sources[item.provider]?.commitPinned&&url===item.fallbackImage;
            const bytes=await readImage(fetcher,url,{timeout:rawFallback?45000:25000,range:rawFallback});
            const revision=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
            if(revision!==item.feedRecord.revision)throw Error('原图与已收录的文件摘要不一致');
            if(item.provider==='wallcolle'||repositories.sources[item.provider]?.commitPinned){
              const metadata=await sharp(bytes,{limitInputPixels:60000000}).metadata();
              if(metadata.width!==item.width||metadata.height!==item.height||(metadata.pages||1)!==1||metadata.orientation>=5||repositories.sources[item.provider]?.commitPinned&&metadata.format!=='png')throw Error('仓库原图的格式、尺寸或方向与已验证目录不一致');
            }
            encoded=await encodePreview(bytes);break;
          }catch(error){lastError=error;}
        }
        if(!encoded)throw lastError;
        const temporary=path.join(outputDir,filename+'.tmp');await fs.mkdir(path.dirname(temporary),{recursive:true});await fs.writeFile(temporary,encoded.data);await fs.rename(temporary,path.join(outputDir,filename));
        manifest.images[item.id]={revision:previews.revisionFor(item),width:encoded.width,height:encoded.height,bytes:encoded.data.length,...(['ayomi','revoy','tyson','morevna','pepper'].includes(item.provider)?{url:item.provider==='pepper'?item.download:item.image,digest:encoded.digest}:{}),...(item.provider==='pepper'?{checkedAt:now.toISOString()}:{})};created++;
        if(created%20===0)logger.log('已生成 '+created+' 张预览');
      }catch(error){failures++;logger.warn('预览暂未生成：'+item.title+'（'+error.message+'）');if(['tyson','pepper','morevna'].includes(item.provider)&&[429,503].includes(error.status))limited.add(item.provider);if(item.provider==='ayomi'&&error.status===429){manifest.authorRetryAt=retryTime(error.retryAfter,now);return false;}}
      return true;
  }
  const author=pending.filter(item=>item.provider==='ayomi'),generated=pending.filter(item=>item.provider!=='ayomi');
  const generatedSources=new Set(generated.map(item=>item.provider)).size;
  const authorBudget=Math.max(1,maxNew-Math.min(generated.length,Math.ceil(maxNew*generatedSources/(generatedSources+1))));
  const cooling=cooldownUntil(now,previous?.authorRetryAt,sourceRetryAt);if(cooling)manifest.authorRetryAt=cooling;
  if(!manifest.authorRetryAt)for(const item of author){
    if(attempted>=maxNew||attempted>=authorBudget)break;
    if(attempted)await wait(1500);
    if(!await create(item))break;
  }
  await Promise.all(Array.from({length:3},async()=>{
    while(next<generated.length&&attempted<maxNew){
      const item=generated[next++];if(!limited.has(item.provider))await create(item);
    }
  }));
  const keep=new Set(ordered.filter(item=>manifest.images[item.id]).map(previews.filenameFor));
  for(const filename of await fs.readdir(outputDir))if(/^(?:(librepixels|folium|midjourney|agundur|wallcolle|sermor|sermornc|pop)-[a-f0-9]{40}|(?:opengameart|hdwallpapers|blender|unicorn)-[a-f0-9]{64})-v1\.webp$/.test(filename)&&!keep.has(filename))await fs.unlink(path.join(outputDir,filename));
  for(const filename of await fs.readdir(outputDir))if(/^(?:revoy|tyson)-[a-f0-9]{64}-v1\.(jpg|webp)$/.test(filename)&&!keep.has(filename))await fs.unlink(path.join(outputDir,filename));
  const authorDir=path.join(outputDir,'ayomi');
  let authorFiles;try{authorFiles=await fs.readdir(authorDir,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;authorFiles=[];}
  for(const filename of authorFiles)if(/\.(png|jpe?g|webp)\.\d+\.(png|jpe?g|webp)$/.test(filename)&&!keep.has('ayomi/'+filename))await fs.unlink(path.join(authorDir,filename));
  for(const provider of ['pepper','morevna']){
    const providerDir=path.join(outputDir,provider);let files;
    try{files=await fs.readdir(providerDir,{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;files=[];}
    const managed=provider==='pepper'?/^[a-zA-Z0-9_-]+\.jpg\.\d+x\d+-v1\.webp$/:/^\d{4}\/\d{2}\/[a-zA-Z0-9_.-]+\.(png|jpe?g|webp)\.\d+-v1\.webp$/;
    for(const filename of files)if(managed.test(filename)&&!keep.has(provider+'/'+filename))await fs.unlink(path.join(providerDir,filename));
  }
  reused=Object.keys(manifest.images).length-created;
  const result={manifest,created,reused,failures,deferred:pending.length-attempted};
  logger.log('预览图片：新增 '+created+'，复用 '+reused+'，失败 '+failures+'，待处理 '+result.deferred);
  return result;
}

async function main(){
  const catalog=JSON.parse(await fs.readFile(path.join(root,'data/official-feeds.json'),'utf8'));let previous;
  try{previous=JSON.parse(await fs.readFile(outputPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const {manifest}=await buildPreviews({items:feeds.normalizeCatalog(catalog),previous,sourceRetryAt:catalog.continuation?.ayomi?.retryAt});
  const temporary=outputPath+'.tmp';await fs.writeFile(temporary,JSON.stringify(manifest,null,2)+'\n');await fs.rename(temporary,outputPath);
}

module.exports={readImage,encodePreview,copyAuthorPreview,buildPreviews};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
