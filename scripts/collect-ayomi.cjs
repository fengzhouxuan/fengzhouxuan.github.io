const ayomi=require('../source/wallpapers/ayomi.js');
const {retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const userAgent='RabbitWallpaperStation/1.0 (static open-license catalog)';

function continuationState(value){
  if(!value||!Array.isArray(value.queue)||value.queue.length>600)return null;
  const queue=value.queue.map(url=>ayomi.galleryURL(url));
  if(queue.some(url=>!url||new URL(url).search||url===ayomi.source.gallery)||new Set(queue).size!==queue.length)return null;
  if(value.retryAt!=null&&(typeof value.retryAt!=='string'||!Number.isFinite(Date.parse(value.retryAt))))return null;
  return {queue,...(value.retryAt?{retryAt:value.retryAt}:{})};
}

async function collectAyomi({fetcher=fetch,dimensions,old=[],continuation,retryAt,now=new Date(),logger=console,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay)),intervalMs=1500,maxRequests=150,maxCollections=30}={}){
  if(typeof dimensions!=='function')throw Error('缺少原图尺寸读取器');
  if(!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>300||!Number.isSafeInteger(maxCollections)||maxCollections<1||maxCollections>100||!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000)throw Error('画廊请求预算无效');
  const previous=ayomi.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),known=new Map(previous.map(item=>[item.download,item.feedRecord]));
  const savedState=continuationState(continuation),records=new Map(known);
  let queue=[...(savedState?.queue||[])],requests=0,read=0,failed=0,progress=false;
  const save=(state,interrupted=false)=>({records:ayomi.normalizeRecords([...records.values()]).map(item=>item.feedRecord),continuation:state,complete:state===null,interrupted,updated:progress});
  const cooling=cooldownUntil(now,savedState?.retryAt,retryAt);
  if(cooling)return save({queue,retryAt:cooling},true);
  function interrupt(message,retryAt){const error=Error(message);error.pause=true;error.retryAt=retryAt;return error;}
  async function pacedFetch(url,options){
    if(requests>=maxRequests)throw interrupt('已达到本次请求预算');
    if(requests&&intervalMs)await wait(intervalMs);
    requests++;
    const response=await fetcher(url,options);
    if(response.status===429){
      const retryAt=retryTime(response.headers?.get?.('retry-after'),now);
      try{await response.body?.cancel?.();}finally{throw interrupt('图源返回 HTTP 429，停止本轮请求',retryAt);}
    }
    return response;
  }
  async function collection(url){
    const candidates=[],children=[],seen=new Set();let total,pages=1;
    for(let page=1;page<=pages;page++){
      const target=new URL(url);target.searchParams.set('page',String(page));
      const response=await pacedFetch(target.href,{headers:{'User-Agent':userAgent},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('画廊返回 HTTP '+response.status);
      let parsed;try{parsed=ayomi.parseGallery(await response.text(),target.href);}catch(error){throw Error(target.href+' · '+error.message);}
      if(page===1){total=parsed.total;pages=parsed.pages;}
      if(parsed.total!==total||parsed.pages!==pages)throw Error('画廊目录在分页过程中变化');
      for(const child of parsed.children){if(seen.has(child))throw Error('画廊分页包含重复子分类');seen.add(child);children.push(child);}
      candidates.push(...parsed.records);
    }
    return {candidates:[...new Map(candidates.map(item=>[item.download,item])).values()],children};
  }
  if(!queue.length){
    try{
      const root=await collection(ayomi.source.gallery);queue=root.children;progress=true;
      for(const [url,item] of records){const pathname=new URL(item.pageUrl).pathname;if(!queue.some(child=>pathname===new URL(child).pathname||pathname.startsWith(new URL(child).pathname+'/')))records.delete(url);}
    }catch(error){if(!error.pause)throw error;logger.warn(error.message);return save({queue:[],...(error.retryAt?{retryAt:error.retryAt}:{})},true);}
  }
  const visited=new Set();
  while(queue.length&&read<maxCollections){
    const url=queue.shift();visited.add(url);read++;
    try{
      const result=await collection(url),checked=new Map();let unavailable=0;
      for(const child of result.children)if(!visited.has(child)&&!queue.includes(child))queue.push(child);
      if(queue.length>600||result.candidates.length>5000)throw Error('画廊目录超过读取上限');
      for(const raw of result.candidates){
        const saved=known.get(raw.download);
        if(saved?.revision===raw.revision&&saved.image===raw.image){checked.set(raw.download,{...raw,width:saved.width,height:saved.height,imageWidth:saved.imageWidth,imageHeight:saved.imageHeight});continue;}
        try{
          const native=await dimensions(pacedFetch,raw.download);let image=raw.image,preview=native;
          if(image!==raw.download){
            try{preview=await dimensions(pacedFetch,image);if(!Number.isSafeInteger(preview.width)||!Number.isSafeInteger(preview.height)||Math.abs(native.width*preview.height/(native.height*preview.width)-1)>=0.01||preview.width>native.width||preview.height>native.height)throw Error('预览已裁切或尺寸不一致');}
            catch(error){if(error.pause)throw error;image=raw.download;preview=native;}
          }
          const item={...raw,...native,image,imageWidth:preview.width,imageHeight:preview.height};
          if(ayomi.normalizeRecords([item]).length){checked.set(raw.download,item);records.set(raw.download,item);progress=true;}
        }catch(error){
          if(error.pause)throw error;
          unavailable++;
          if(saved)checked.set(raw.download,saved);
          logger.warn('原图暂不可用，跳过新图或保留已验证图片：'+raw.title);
        }
      }
      if(result.candidates.length&&unavailable===result.candidates.length&&!checked.size)throw Error('候选作品均无法验证原始尺寸');
      // Only a completely read directory can remove its old records. Unvisited directories survive.
      for(const [download,item] of records)if(new URL(item.pageUrl).pathname===new URL(url).pathname)records.delete(download);
      for(const [download,item] of checked)records.set(download,item);
      progress=true;
    }catch(error){
      if(error.pause){queue.unshift(url);logger.warn(error.message+'，保存进度，下次继续');return save({queue,...(error.retryAt?{retryAt:error.retryAt}:{})},Boolean(error.retryAt));}
      failed++;logger.warn('画廊分类暂不可用，保留该分类已验证图片：'+url+' · '+error.message);
    }
  }
  if(read&&failed===read&&!queue.length)throw Error('所有画廊分类均无法读取');
  const state=queue.length?{queue}:null;
  logger.log('AyomiArt：读取 '+read+' 个画廊目录，'+records.size+' 张已验证图片'+(state?'，下次继续':''));
  return save(state);
}
module.exports={collectAyomi};
