const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const feeds=require('../source/wallpapers/feeds.js');
const previews=require('../source/wallpapers/previews.js');

async function verifyRelease({root=path.resolve(__dirname,'../public/wallpapers'),logger=console}={}){
  const directory=path.resolve(root);
  async function read(relative,maxBytes){
    const file=path.resolve(directory,relative);
    if(!file.startsWith(directory+path.sep))throw Error('发布图片路径无效');
    try{
      const info=await fs.lstat(file);
      if(!info.isFile()||info.size<1||info.size>maxBytes)throw Error('发布文件类型或大小无效：'+relative);
      return await fs.readFile(file);
    }catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')throw Error('发布文件缺失：'+relative);throw error;}
  }
  async function json(relative){
    const bytes=await read(relative,16*1024*1024);
    try{return JSON.parse(bytes.toString('utf8'));}catch(error){throw Error('发布目录不是有效 JSON：'+relative);}
  }
  async function image(relative,expected,maxBytes,label){
    const bytes=await read(relative,maxBytes);
    if(bytes.length!==expected.bytes||expected.digest&&crypto.createHash('sha256').update(bytes).digest('hex')!==expected.digest)throw Error(label+'字节或摘要不符：'+relative);
    try{
      const decoder=sharp(bytes,{limitInputPixels:60000000,failOn:'warning'}),metadata=await decoder.metadata();
      if(metadata.format!==expected.format||metadata.width!==expected.width||metadata.height!==expected.height||(metadata.pages||1)!==1||(metadata.orientation||1)!==1)throw Error(label+'格式或尺寸不符：'+relative);
      await decoder.stats();
    }catch(error){if(error.message.startsWith(label))throw error;throw Error(label+'无法完整解码：'+relative);}
  }
  const catalog=await json('data/official-feeds.json'),manifest=await json('data/previews.json');
  if(catalog?.version!==1||!catalog.records||typeof catalog.records!=='object'||Array.isArray(catalog.records))throw Error('发布壁纸目录结构无效');
  if(manifest?.version!==previews.version||!manifest.images||typeof manifest.images!=='object'||Array.isArray(manifest.images))throw Error('发布预览目录结构无效');
  const items=feeds.normalizeCatalog(catalog);
  if(!items.length||Object.entries(catalog.records).some(([provider,records])=>!Object.hasOwn(feeds.providers,provider)||!Array.isArray(records)||feeds.normalizeFeed(records,provider).length!==records.length))throw Error('发布壁纸目录包含无效或重复记录');
  const report={items:items.length,providers:new Set(items.map(item=>item.provider)).size,originals:0,previews:0,fallbacks:0};let next=0,failure;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<items.length&&!failure){
      try{
        const item=items[next++],record=item.feedRecord;
        if(item.download.startsWith('./originals/')){
          const extension=item.download.split('.').pop();
          await image(item.download,{bytes:record.bytes,digest:record.revision,width:item.width,height:item.height,format:extension==='jpg'?'jpeg':extension},32*1024*1024,'原图');report.originals++;
        }
        if(!previews.filenameFor(item))continue;
        const preview=previews.previewFor(item,manifest),entry=manifest.images[item.id];
        if(!preview){if(entry)throw Error('发布预览记录与图片不一致：'+item.id);report.fallbacks++;continue;}
        const format={jpg:'jpeg',jpeg:'jpeg',png:'png',webp:'webp'}[preview.split('.').pop()];
        await image(preview,{...entry,format},item.provider==='ayomi'?previews.authorMaxBytes:previews.maxBytes,'预览');report.previews++;
      }catch(error){failure||=error;}
    }
  }));
  if(failure)throw failure;
  logger.log('发布壁纸：'+report.items+' 张，'+report.originals+' 张同站原图，'+report.previews+' 张预览；待生成预览 '+report.fallbacks+' 张（保留原图源回退）。');
  return report;
}

module.exports={verifyRelease};
if(require.main===module)verifyRelease().catch(error=>{console.error(error.message);process.exitCode=1;});
