const fs=require('node:fs/promises');
const path=require('node:path');
const feeds=require('../source/wallpapers/feeds.js');
const repositories=require('../source/wallpapers/repositories.js');
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
  const licenseFile=provider==='folium'?'README.md':'LICENSE';
  const license=await (await request(fetcher,base+'/contents/'+licenseFile+'?ref='+source.ref)).json();
  if(license.encoding!=='base64'||typeof license.content!=='string')throw Error('无法核对仓库图片许可');
  const declaration=Buffer.from(license.content,'base64').toString('utf8');
  if(provider==='folium'?!/wallpapers.*released under CC:BY 4\.0/i.test(declaration):!declaration.includes('CC0 1.0 Universal'))throw Error('仓库的图片许可声明已变化');
  const tree=await (await request(fetcher,base+'/git/trees/'+source.ref+'?recursive=1')).json();
  if(tree.truncated||!Array.isArray(tree.tree))throw Error('仓库目录未能完整读取');
  return tree.tree.filter(entry=>entry.type==='blob').map(entry=>({path:entry.path,revision:entry.sha}));
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
          const urls=repositories.urlsFor(file.path,provider);
          try{size=await dimensions(fetcher,urls.download);}
          catch(error){if(!urls.fallbackImage)throw error;size=await dimensions(fetcher,urls.fallbackImage);}
        }
        records[index]={...file,...size,license:source.license,licenseUrl:source.licenseUrl};
      }catch(e){logger.warn('跳过暂时无法读取的仓库壁纸：'+file.path);}
    }
  }));
  const collected=records.filter(Boolean);
  if(candidates.length&&!collected.length)throw Error('所有候选图片均无法读取，保留上次目录');
  return collected;
}

async function refreshCatalog({previous,fetcher=fetch,now=new Date(),dimensions=readDimensions,logger=console,providerIds=Object.keys(feeds.providers)}={}){
  if(providerIds.some(provider=>!Object.hasOwn(feeds.providers,provider)))throw Error('壁纸来源不存在');
  const catalog={version:1,generatedAt:now.toISOString(),updatedAt:{},records:{}};
  let failures=0;
  for(const provider of providerIds){
    const old=feeds.normalizeFeed(previous?.version===1?previous.records?.[provider]:[],provider);
    try{
      let records;
      if(Object.hasOwn(repositories.sources,provider)){
        records=await collectRepository(provider,{fetcher,dimensions,old,logger});
      }else if(provider==='pepper'){
        const response=await request(fetcher,'https://www.peppercarrot.com/en/wallpapers/index.html');
        records=feeds.parsePepperIndex(await response.text());
        const known=new Map(old.map(item=>[item.feedRecord.filename,item.feedRecord]));
        const checked=[];
        for(const raw of records.slice(0,64)){
          const saved=known.get(raw.filename);
          try{checked.push({...raw,...(saved&&saved.download===raw.download?{width:saved.width,height:saved.height}:await dimensions(fetcher,raw.download))});}catch(e){logger.warn('跳过无法读取尺寸的壁纸：'+raw.filename);}
        }
        records=checked;
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
      let items=feeds.normalizeFeed(records,provider);if(!items.length&&!Object.hasOwn(repositories.sources,provider))throw Error('没有符合尺寸与许可要求的图片');
      if(provider==='met')items=[...new Map([...old,...items].map(item=>[item.id,item])).values()];
      catalog.records[provider]=items.map(item=>item.feedRecord);catalog.updatedAt[provider]=now.toISOString();
      logger.log(feeds.providers[provider].name+'：'+items.length+' 张');
    }catch(e){
      failures++;catalog.records[provider]=old.map(item=>item.feedRecord);catalog.updatedAt[provider]=previous?.updatedAt?.[provider]||null;
      logger.warn(feeds.providers[provider].name+'更新失败，保留 '+old.length+' 张已有图片：'+e.message);
    }
  }
  return {catalog,failures};
}

async function main(){
  let previous;
  try{previous=JSON.parse(await fs.readFile(catalogPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const {catalog,failures}=await refreshCatalog({previous});
  if(!feeds.normalizeCatalog(catalog).length)throw Error('所有图源均不可用，目录未改写');
  const temporary=catalogPath+'.tmp';await fs.writeFile(temporary,JSON.stringify(catalog,null,2)+'\n');await fs.rename(temporary,catalogPath);
  if(failures)console.warn('部分图源未更新，站点构建可继续使用已有目录。');
}

module.exports={jpegDimensions,imageDimensions,readDimensions,metURL,repositoryFiles,collectRepository,refreshCatalog};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
