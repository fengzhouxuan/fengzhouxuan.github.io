const fs=require('node:fs/promises');
const path=require('node:path');
const commons=require('../source/wallpapers/commons.js');
const catalogPath=path.resolve(__dirname,'../source/wallpapers/data/open-images.json');

function categoryURL(category,continuation){
  if(!Object.hasOwn(commons.categories,category))throw Error('图片分类不存在');
  const url=new URL('https://commons.wikimedia.org/w/api.php');
  const params={action:'query',format:'json',generator:'categorymembers',gcmtitle:'Category:'+commons.categories[category],gcmtype:'file',gcmnamespace:'6',gcmlimit:'50',gcmsort:'timestamp',gcmdir:'desc',prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'960',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl|Categories|ImageDescription|Restrictions',maxlag:'5'};
  if(continuation!=null){
    if(typeof continuation!=='string'||!continuation.length||continuation.length>=1000)throw Error('图片分页游标无效');
    params.gcmcontinue=continuation;
  }
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  return url.href;
}

async function refreshCommonsCatalog({previous,fetcher=fetch,now=new Date(),maxPages=30,logger=console}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('分页预算无效');
  const catalog={version:1,generatedAt:now.toISOString(),updatedAt:{},continuation:{},records:{}};
  let failures=0;
  for(const category of Object.keys(commons.categories)){
    const old=commons.normalizeCommons(previous?.version===1?previous.records?.[category]:[],category);
    const pending=previous?.version===1?previous.continuation?.[category]:null;
    const found=new Map(),visited=new Set(),cursors=new Set();let cursor=pending,complete=false;
    try{
      for(let page=0;page<maxPages;page++){
        const response=await fetcher(categoryURL(category,cursor),{headers:{'User-Agent':'RabbitWallpaperStation/1.1 (open-license wallpaper catalog)'},signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error('图源返回 HTTP '+response.status);
        const payload=await response.json();
        if(payload.error||!payload.query?.pages||typeof payload.query.pages!=='object'||Array.isArray(payload.query.pages))throw Error('图片目录响应无效');
        const records=Object.values(payload.query.pages);
        for(const raw of records)if(Number.isSafeInteger(raw.pageid))visited.add('commons-'+raw.pageid);
        for(const item of commons.normalizeCommons(records,category))found.set(item.id,item);
        const next=payload.continue?.gcmcontinue;
        if(!next){complete=true;cursor=null;break;}
        if(typeof next!=='string'||next.length>=1000||next===cursor||cursors.has(next))throw Error('图片分页游标无效');
        cursors.add(next);cursor=next;
      }
      if(!found.size&&!old.length)throw Error('没有符合尺寸与许可的图片');
      const items=[...new Map([...(complete&&!pending?[]:old.filter(item=>!visited.has(item.id))),...found.values()].map(item=>[item.id,item])).values()];
      catalog.records[category]=items.map(item=>item.commonsRecord);catalog.updatedAt[category]=now.toISOString();catalog.continuation[category]=cursor;
      logger.log(category+'：'+items.length+' 张'+(complete?'':'，下次继续分页'));
    }catch(e){
      failures++;catalog.records[category]=old.map(item=>item.commonsRecord);catalog.updatedAt[category]=previous?.updatedAt?.[category]||null;catalog.continuation[category]=typeof pending==='string'&&pending.length>0&&pending.length<1000?pending:null;
      logger.warn(category+' 更新失败，保留 '+old.length+' 张：'+e.message);
    }
  }
  return {catalog,failures};
}

async function main(){
  let previous;try{previous=JSON.parse(await fs.readFile(catalogPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const {catalog}=await refreshCommonsCatalog({previous});
  if(!Object.values(catalog.records).some(records=>records.length))throw Error('开放照片目录未能更新');
  const temporary=catalogPath+'.tmp';await fs.writeFile(temporary,JSON.stringify(catalog,null,2)+'\n');await fs.rename(temporary,catalogPath);
}

module.exports={categoryURL,refreshCommonsCatalog};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
