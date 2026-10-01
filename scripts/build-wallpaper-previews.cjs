const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const feeds=require('../source/wallpapers/feeds.js');
const core=require('../source/wallpapers/core.js');
const repositories=require('../source/wallpapers/repositories.js');
const previews=require('../source/wallpapers/previews.js');
const root=path.resolve(__dirname,'../source/wallpapers');
const outputPath=path.join(root,'data/previews.json');

async function readImage(fetcher,url,{maxBytes=32*1024*1024,timeout=25000}={}){
  const controller=new AbortController();let reader,timer;
  try{
    return await Promise.race([
      (async()=>{
        const response=await fetcher(url,{signal:controller.signal,headers:{'User-Agent':'RabbitWallpaperStation/1.2 (licensed wallpaper previews)'}});
        if(!response.ok)throw Error('图源返回 HTTP '+response.status);
        if(Number(response.headers.get('content-length'))>maxBytes)throw Error('原图超过处理大小限制');
        reader=response.body.getReader();const chunks=[];let size=0;
        while(true){
          const {done,value}=await reader.read();if(done)break;
          size+=value.length;if(size>maxBytes)throw Error('原图超过处理大小限制');chunks.push(value);
        }
        if(!size)throw Error('原图内容为空');
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

async function cachedPreview(outputDir,filename,entry){
  try{
    const bytes=await fs.readFile(path.join(outputDir,filename)),metadata=await sharp(bytes).metadata();
    return metadata.format==='webp'&&metadata.width===entry.width&&metadata.height===entry.height&&bytes.length===entry.bytes;
  }catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR'&&error.code)throw error;return false;}
}

async function buildPreviews({items,previous,fetcher=fetch,outputDir=path.join(root,'previews'),maxNew=120,now=new Date(),logger=console}={}){
  if(!Number.isSafeInteger(maxNew)||maxNew<0||maxNew>1000)throw Error('预览处理预算无效');
  await fs.mkdir(outputDir,{recursive:true});
  const approved=(Array.isArray(items)?items:[]).flatMap(item=>{
    const normalized=repositories.normalizeRepository([item?.feedRecord],item?.provider)[0];return normalized&&normalized.id===item?.id?[normalized]:[];
  });
  const ordered=feeds.mixSources([...new Map(approved.map(item=>[previews.filenameFor(item),item])).values()],core.dayKey(now));
  const manifest={version:previews.version,generatedAt:now.toISOString(),images:{}},pending=[];
  let reused=0,created=0,failures=0,attempted=0,next=0;
  for(const item of ordered){
    const filename=previews.filenameFor(item),entry=previous?.images?.[item.id];
    if(previews.previewFor(item,previous)&&await cachedPreview(outputDir,filename,entry)){manifest.images[item.id]=entry;reused++;}
    else pending.push(item);
  }
  await Promise.all(Array.from({length:3},async()=>{
    while(next<pending.length&&attempted<maxNew){
      const item=pending[next++],filename=previews.filenameFor(item);attempted++;
      try{
        let encoded,lastError;
        for(const url of [item.image,item.fallbackImage].filter(Boolean)){
          try{
            const bytes=await readImage(fetcher,url);
            const revision=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
            if(revision!==item.feedRecord.revision)throw Error('原图与已收录的文件摘要不一致');
            encoded=await encodePreview(bytes);break;
          }catch(error){lastError=error;}
        }
        if(!encoded)throw lastError;
        const temporary=path.join(outputDir,filename+'.tmp');await fs.writeFile(temporary,encoded.data);await fs.rename(temporary,path.join(outputDir,filename));
        manifest.images[item.id]={revision:item.feedRecord.revision,width:encoded.width,height:encoded.height,bytes:encoded.data.length};created++;
        if(created%20===0)logger.log('已生成 '+created+' 张预览');
      }catch(error){failures++;logger.warn('预览暂未生成：'+item.title+'（'+error.message+'）');}
    }
  }));
  const keep=new Set(ordered.filter(item=>manifest.images[item.id]).map(previews.filenameFor));
  for(const filename of await fs.readdir(outputDir))if(/^(librepixels|folium|midjourney)-[a-f0-9]{40}-v1\.webp$/.test(filename)&&!keep.has(filename))await fs.unlink(path.join(outputDir,filename));
  const result={manifest,created,reused,failures,deferred:pending.length-attempted};
  logger.log('预览图片：新增 '+created+'，复用 '+reused+'，失败 '+failures+'，待处理 '+result.deferred);
  return result;
}

async function main(){
  const catalog=JSON.parse(await fs.readFile(path.join(root,'data/official-feeds.json'),'utf8'));let previous;
  try{previous=JSON.parse(await fs.readFile(outputPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const {manifest}=await buildPreviews({items:feeds.normalizeCatalog(catalog),previous});
  const temporary=outputPath+'.tmp';await fs.writeFile(temporary,JSON.stringify(manifest,null,2)+'\n');await fs.rename(temporary,outputPath);
}

module.exports={readImage,encodePreview,buildPreviews};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
