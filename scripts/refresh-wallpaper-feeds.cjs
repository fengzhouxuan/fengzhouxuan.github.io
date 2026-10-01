const fs=require('node:fs/promises');
const path=require('node:path');
const feeds=require('../source/wallpapers/feeds.js');
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

async function request(fetcher,url){
  const response=await fetcher(url,{headers:{'User-Agent':userAgent},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('图源返回 HTTP '+response.status);
  return response;
}

async function readDimensions(fetcher,url){
  const response=await request(fetcher,url),reader=response.body.getReader();
  let bytes=new Uint8Array(0);
  try{
    while(bytes.length<262144){
      const {done,value}=await reader.read();if(done)break;
      const next=new Uint8Array(Math.min(262144,bytes.length+value.length));next.set(bytes);next.set(value.subarray(0,next.length-bytes.length),bytes.length);bytes=next;
      const dimensions=jpegDimensions(bytes);if(dimensions)return dimensions;
    }
    throw Error('无法读取 JPEG 原始尺寸');
  }finally{await reader.cancel();}
}

function metURL(now){
  const url=new URL('https://collectionapi.metmuseum.org/public/collection/v1.1/search');
  Object.entries({hasImages:'true',departmentId:'11',q:'landscape',limit:'32',offset:String(Math.floor(now.getTime()/86400000)%6*32)}).forEach(([key,value])=>url.searchParams.set(key,value));
  return url.href;
}

async function refreshCatalog({previous,fetcher=fetch,now=new Date(),dimensions=readDimensions,logger=console}={}){
  const catalog={version:1,generatedAt:now.toISOString(),updatedAt:{},records:{}};
  let failures=0;
  for(const provider of Object.keys(feeds.providers)){
    const old=feeds.normalizeFeed(previous?.version===1?previous.records?.[provider]:[],provider);
    try{
      let records;
      if(provider==='pepper'){
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
      const items=feeds.normalizeFeed(records,provider);if(!items.length)throw Error('没有符合尺寸与许可要求的图片');
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

module.exports={jpegDimensions,readDimensions,metURL,refreshCatalog};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
