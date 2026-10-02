const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {parseDocument,DomUtils:dom}=require('htmlparser2');
const unicorn=require('../source/wallpapers/unicorn.js');
const {readImage}=require('./build-wallpaper-previews.cjs');
const {robotsDelay,retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const hasClass=(node,name)=>node.attribs?.class?.split(/\s+/).includes(name);
const nodes=(root,predicate)=>dom.findAll(predicate,root.children||[]);
const text=node=>dom.textContent(node).replace(/\s+/g,' ').trim();

function parseSource(html){
  const doc=parseDocument(String(html||'')),titles=nodes(doc,node=>node.name==='h1'&&hasClass(node,'game_title'));
  const descriptions=nodes(doc,node=>hasClass(node,'formatted_description')),panels=nodes(doc,node=>hasClass(node,'game_info_panel_widget')),galleries=nodes(doc,node=>hasClass(node,'screenshot_list'));
  if(titles.length!==1||text(titles[0])!=='Shopping Backgrounds'||descriptions.length!==1||panels.length!==1||galleries.length!==1)throw Error('手绘场景来源结构无法核对');
  const rows=nodes(panels[0],node=>node.name==='tr'),rowFor=label=>rows.filter(row=>nodes(row,node=>node.name==='td').some(cell=>text(cell)===label));
  const authors=rowFor('Author'),licenses=rowFor('Asset license');
  if(authors.length!==1||!nodes(authors[0],node=>node.name==='a'&&node.attribs.href===unicorn.origin&&text(node)===unicorn.artist).length)throw Error('手绘场景作者无法核对');
  const description=descriptions[0],content=text(description);
  const licensed=content.includes('The images in this asset pack are released under the Creative Commons Attribution 4.0 International licence.')&&nodes(description,node=>node.name==='a'&&node.attribs.href===unicorn.licenseUrl&&text(node)==='Creative Commons Attribution 4.0 International').length===1&&licenses.length===1&&nodes(licenses[0],node=>node.name==='a'&&node.attribs.href==='https://itch.io/game-assets/assets-cc4-by').length===1&&!/all rights reserved|no redistribution|(?:do not|cannot|may not|not allowed to) (?:re)?distribut/i.test(content);
  if(!licensed)return {licensed:false,records:[]};
  const links=nodes(galleries[0],node=>node.name==='a'),records=[];
  for(const [key,work] of Object.entries(unicorn.works)){
    const matched=links.filter(link=>unicorn.imageURL(link.attribs.href,key));
    if(matched.length>1)throw Error('手绘场景展示文件重复');
    if(!matched.length)continue;
    const thumbnails=nodes(matched[0],node=>node.name==='img'),prefix=unicorn.imageOrigin+work.assetPath+'/347x500/';
    if(thumbnails.length!==1||!thumbnails[0].attribs.src?.startsWith(prefix))throw Error('手绘场景原图与展示图不一致');
    records.push({work:key,publishedImage:unicorn.imageURL(matched[0].attribs.href,key),artist:unicorn.artist,pageUrl:unicorn.pageUrl,license:unicorn.license,licenseUrl:unicorn.licenseUrl,kind:'published-gallery'});
  }
  return {licensed:true,records};
}

async function inspectImage(bytes,raw){
  if(!raw||!unicorn.imageURL(raw.publishedImage,raw.work))return null;
  const image=sharp(bytes,{limitInputPixels:60000000,failOn:'warning'}),meta=await image.metadata();
  if(meta.format!=='jpeg'||(meta.pages||1)!==1||(meta.orientation||1)!==1||Math.max(meta.width,meta.height)<1600||Math.min(meta.width,meta.height)<800)return null;
  await image.stats();
  const record={...raw,revision:crypto.createHash('sha256').update(bytes).digest('hex'),extension:'jpg',bytes:bytes.length,width:meta.width,height:meta.height};
  return unicorn.normalizeRecords([record])[0]?.feedRecord||null;
}

async function collectUnicorn({fetcher=fetch,old=[],retryAt,now=new Date(),outputDir=path.resolve(__dirname,'../source/wallpapers/originals/unicorn'),logger=console,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay)),intervalMs=1000,workIds=Object.keys(unicorn.works)}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000||!Array.isArray(workIds)||!workIds.length||new Set(workIds).size!==workIds.length||workIds.some(key=>!Object.hasOwn(unicorn.works,key)))throw Error('手绘场景同步配置无效');
  const previous=unicorn.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),records=new Map(previous.map(item=>[item.work,item.feedRecord]));
  const currentRecords=()=>unicorn.normalizeRecords([...records.values()]).map(item=>item.feedRecord);
  const cooling=cooldownUntil(now,retryAt);if(cooling)return {records:[...records.values()],retryAt:cooling,updated:false,interrupted:true};
  const policies=new Map();let requested=false,updated=false;
  async function pacedFetch(url,options){
    const target=new URL(url),policy=policies.get(target.origin),delay=Math.max(intervalMs,policy===undefined?0:robotsDelay(policy,[target.pathname+target.search]));
    if(requested&&delay)await wait(delay);requested=true;
    const response=await fetcher(url,options);
    if([429,503].includes(response.status)){const error=Error('手绘场景来源要求冷却');error.pause=true;error.retryAt=retryTime(response.headers?.get?.('retry-after'),now);await response.body?.cancel?.();throw error;}
    return response;
  }
  async function readRobots(origin){
    let policy;
    try{policy=(await readImage(pacedFetch,origin+'/robots.txt',{maxBytes:131072,allowEmpty:true})).toString('utf8');}
    catch(error){if(error.status!==404)throw error;policy='';}
    robotsDelay(policy,[]);policies.set(origin,policy);
  }
  try{
    await readRobots(unicorn.origin);await readRobots(unicorn.imageOrigin);
    const source=parseSource((await readImage(pacedFetch,unicorn.pageUrl,{maxBytes:2*1024*1024})).toString('utf8'));
    await fs.mkdir(outputDir,{recursive:true});
    if(!source.licensed){records.clear();updated=true;}
    else for(const key of workIds){
      const raw=source.records.find(record=>record.work===key);
      if(!raw){records.delete(key);updated=true;continue;}
      try{
        const bytes=await readImage(pacedFetch,raw.publishedImage),record=await inspectImage(bytes,raw);
        if(record){const file=path.join(outputDir,record.revision+'.jpg');await fs.writeFile(file+'.tmp',bytes);await fs.rename(file+'.tmp',file);records.set(key,record);}
        else records.delete(key);
        updated=true;
      }catch(error){if(error.pause)throw error;logger.warn('手绘场景暂不可用，保留已有图片：'+key+' · '+error.message);}
    }
    if(!updated)throw Error('所有手绘场景均无法读取');
    const collected=currentRecords(),keep=new Set(collected.map(record=>record.revision+'.jpg'));
    for(const filename of await fs.readdir(outputDir))if(/^[a-f0-9]{64}\.jpg$/.test(filename)&&!keep.has(filename))await fs.unlink(path.join(outputDir,filename));
    logger.log('Unicorn Creates：'+collected.length+' 张');return {records:collected,updated,interrupted:false};
  }catch(error){if(!error.pause)throw error;return {records:currentRecords(),retryAt:error.retryAt,updated,interrupted:true};}
}
module.exports={parseSource,inspectImage,collectUnicorn};
