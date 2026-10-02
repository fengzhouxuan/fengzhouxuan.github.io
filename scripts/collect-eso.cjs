const crypto=require('node:crypto');
const {parseDocument,DomUtils:dom}=require('htmlparser2');
const eso=require('../source/wallpapers/eso.js');
const {readImage}=require('./build-wallpaper-previews.cjs');
const {robotsDelay,retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const nodes=(doc,name)=>dom.findAll(node=>node.name===name,doc.children);
const text=node=>dom.textContent(node||{children:[]}).replace(/\s+/g,' ').trim();
const hasClass=(node,name)=>node.attribs?.class?.split(/\s+/).includes(name);
const galleryURL=(group,page=1)=>eso.origin+'/public/images/archive/category/'+group+'/'+(page===1?'':'list/'+page+'/');
function policyLicensed(html){
  const doc=parseDocument(String(html||'')),body=dom.findOne(node=>node.attribs?.id==='body',doc.children,true),content=text(body);
  return Boolean(body&&content.includes('Unless specifically noted, the images, videos, and music distributed on the public ESO website')&&content.includes('with the wording unaltered')&&content.includes('Links should be active if the credit is online.')&&nodes(body,'a').some(node=>[eso.source.licenseUrl,'http://creativecommons.org/licenses/by/4.0/'].includes(node.attribs.href)&&text(node)==='Creative Commons Attribution 4.0 International License'));
}
function parseGallery(html,group,page=1){
  if(!Object.hasOwn(eso.groups,group)||!Number.isSafeInteger(page)||page<1)throw Error('ESO 分类或分页配置无效');
  const doc=parseDocument(String(html||'')),headings=nodes(doc,'h1').map(text),scripts=nodes(doc,'script').map(node=>dom.textContent(node)).filter(value=>/^\s*var images\s*=/.test(value));
  const ranges=[...text(doc).matchAll(/Showing (\d+) to (\d+) of (\d+)/g)],range=ranges[0];
  if(!headings.includes('Image Archive: '+({nebulae:'Nebulae',galaxies:'Galaxies',starclusters:'Star Clusters'})[group])||scripts.length!==1||!/^\s*var images\s*=\s*\[[\s\S]*\];\s*$/.test(scripts[0])||!range||ranges.some(item=>item[0]!==range[0]))throw Error('ESO 目录结构已变化');
  const [start,end,total]=range.slice(1).map(Number),pages=Math.ceil(total/50);
  const links=[...scripts[0].matchAll(/\burl:\s*'(\/public\/images\/[a-z0-9_-]{1,100}\/)'\s*,/g)].map(match=>eso.workURL(eso.origin+match[1]));
  if(total<1||total>10000||page>pages||start!==(page-1)*50+1||end!==Math.min(page*50,total)||links.length!==end-start+1||links.some(link=>!link)||new Set(links).size!==links.length)throw Error('ESO 目录作品数不一致');
  if(page<pages&&!nodes(doc,'a').some(node=>node.attribs.href===new URL(galleryURL(group,page+1)).pathname&&text(node)==='Next'))throw Error('ESO 下一页链接无法核对');
  return {links,total,pages};
}
function parseCredit(node,pageUrl=eso.origin){
  const parts=[];
  function walk(current,href){
    if(current.type==='text'){const value=current.data.replace(/\s+/g,' ');if(value)parts.push({text:value,...(href?{href}:{})});return;}
    if(current.type==='comment')return;
    if(current.name==='input'&&current.attribs.type==='hidden')return;
    if(!['div','p','span','a','strong','em','b','i','br'].includes(current.name))throw Error('ESO 署名结构已变化');
    if(current.name==='a'){href=eso.creditURL(new URL(current.attribs.href,pageUrl).href);if(!href)throw Error('ESO 署名链接无效');}
    if(current.name==='br')parts.push({text:' '});
    for(const child of current.children||[])walk(child,href);
    if(current.name==='p')parts.push({text:' '});
  }
  walk(node);
  for(let i=0;i<parts.length;i++){if(i===0)parts[i].text=parts[i].text.trimStart();if(i&&parts[i-1].text.endsWith(' '))parts[i].text=parts[i].text.trimStart();}
  while(parts.length&&!parts.at(-1).text.trim())parts.pop();if(parts.length)parts.at(-1).text=parts.at(-1).text.trimEnd();
  const cleaned=parts.filter(part=>part.text),artist=cleaned.map(part=>part.text).join('');
  if(artist.replace(/\s/g,'')!==text(node).replace(/\s/g,'')||!eso.creditParts(cleaned,artist))throw Error('ESO 完整署名无法核对');
  return {artist,creditParts:cleaned};
}
function parseWork(html,pageUrl,group){
  const page=eso.workURL(pageUrl);if(!page||!Object.hasOwn(eso.groups,group))return null;
  const doc=parseDocument(String(html||'')),left=nodes(doc,'div').filter(node=>hasClass(node,'left-column')),credits=nodes(doc,'div').filter(node=>hasClass(node,'credit')),copyright=nodes(doc,'div').filter(node=>hasClass(node,'copyright'));
  const canonical=nodes(doc,'meta').filter(node=>node.attribs.property==='og:url');
  if(left.length!==1||credits.length!==1||copyright.length!==1||canonical.length!==1||canonical[0].attribs.content!==page)throw Error('ESO 作品身份或署名字段已变化');
  const heading=nodes(left[0],'h1');if(heading.length!==1)throw Error('ESO 作品标题无法核对');
  const workID=new URL(page).pathname.split('/').at(-2),title=text(heading[0]);
  const info=nodes(doc,'div').find(node=>hasClass(node,'object-info')&&nodes(node,'h3').some(node=>text(node)==='About the Image'));
  const rows=nodes(info||{children:[]},'tr'),fields=rows.map(row=>nodes(row,'td')).filter(cells=>cells.length===2).map(cells=>[text(cells[0]),text(cells[1])]);
  if(fields.find(([key])=>key==='Id:')?.[1]!==workID)throw Error('ESO 作品 ID 无法核对');
  if(!nodes(copyright[0],'a').some(node=>node.attribs.href==='/public/outreach/copyright/')||/all rights reserved|no redistribution|permission required|CC[- ]BY[- ](?:NC|ND|SA)|not (?:released|licensed) under/i.test(text(left[0])+' '+text(copyright[0])))return null;
  if(fields.find(([key])=>key==='Type:')?.[1]!=='Observation'||eso.excluded.test(title)||!nodes(info,'a').some(node=>node.attribs.href===new URL(galleryURL(group)).pathname))return null;
  const downloads=nodes(doc,'span').filter(node=>hasClass(node,'archive_dl_text')).flatMap(node=>nodes(node,'a'));
  const format=['publicationjpg','large'].find(format=>downloads.some(node=>node.attribs.href===eso.imageOrigin+'/images/'+format+'/'+workID+'.jpg'&&text(node)===(format==='publicationjpg'?'Publication JPEG':'Large JPEG')));
  const image=eso.imageOrigin+'/images/screen/'+workID+'.jpg';
  if(!format||!downloads.some(node=>node.attribs.href===image&&text(node)==='Screensize JPEG'))return null;
  return {workID,group,title,type:'Observation',...parseCredit(credits[0],page),pageUrl:page,image,download:eso.imageOrigin+'/images/'+format+'/'+workID+'.jpg',format,license:eso.source.license,licenseUrl:eso.source.licenseUrl,licenseSource:eso.licenseSource};
}
function positionsFor(continuation){
  const positions={};
  for(const group of Object.keys(eso.groups)){
    const position=continuation?.positions?.[group];
    positions[group]=position&&Number.isSafeInteger(position.page)&&position.page>=1&&position.page<=200&&Number.isSafeInteger(position.offset)&&position.offset>=0&&position.offset<50?{page:position.page,offset:position.offset}:{page:1,offset:0};
  }
  return positions;
}
async function collectESO({fetcher=fetch,dimensions,old=[],logger=console,now=new Date(),continuation,maxWorks=30,intervalMs=1000,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay))}={}){
  if(typeof dimensions!=='function'||!Number.isSafeInteger(maxWorks)||maxWorks<1||maxWorks>100||!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000)throw Error('ESO 同步配置无效');
  const records=new Map(eso.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)).map(item=>[item.workID,item.feedRecord])),positions=positionsFor(continuation);
  const cooling=cooldownUntil(now,continuation?.retryAt);if(cooling)return {records:[...records.values()],updated:false,interrupted:true,continuation:{positions,retryAt:cooling}};
  let requested=false,updated=false,delay=intervalMs,siteRobots,imageRobots;
  async function pacedFetch(url,options={}){
    const target=new URL(url);
    if(target.origin===eso.origin&&siteRobots!==undefined)robotsDelay(siteRobots,[target.pathname]);
    if(target.origin===eso.imageOrigin&&imageRobots!==undefined)robotsDelay(imageRobots,[target.pathname]);
    if(requested&&delay)await wait(delay);requested=true;
    const response=await fetcher(url,{...options,redirect:'error',headers:{...options.headers,'User-Agent':'RabbitWallpaperStation/1.2 (licensed astronomical wallpapers)'},signal:options.signal||AbortSignal.timeout(25000)});
    if([429,503].includes(response.status)){const error=Error('ESO 要求冷却');error.pause=true;error.retryAfter=response.headers?.get('retry-after');await response.body?.cancel?.();throw error;}
    return response;
  }
  async function html(url){return (await readImage(pacedFetch,url,{maxBytes:512*1024})).toString('utf8');}
  async function metadata(url,maxBytes){
    const response=await pacedFetch(url,{method:'HEAD'}),modified=response.headers.get('last-modified');await response.body?.cancel?.();
    if(!response.ok||!/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type')||'')||!Number.isFinite(Date.parse(modified))||Number(response.headers.get('content-length'))>maxBytes)throw Error('ESO 图片格式、大小或修改时间无效');
    return modified;
  }
  try{
    siteRobots=await html(eso.origin+'/robots.txt');delay=Math.max(delay,robotsDelay(siteRobots,['/public/images/','/public/outreach/copyright/']));
    const robot=await pacedFetch(eso.imageOrigin+'/robots.txt');
    if(robot.status===404)await robot.body?.cancel?.();
    else if(robot.ok){imageRobots=await robot.text();delay=Math.max(delay,robotsDelay(imageRobots,['/images/screen/','/images/publicationjpg/','/images/large/']));}
    else throw Error('ESO 图片服务访问规则无法读取');
    if(!policyLicensed(await html(eso.licenseSource)))throw Error('ESO 图片许可声明已变化');
    const visited=new Set();
    for(const [groupIndex,group] of Object.keys(eso.groups).entries()){
      const first=parseGallery(await html(galleryURL(group)),group),position=positions[group];
      if(position.page>first.pages){position.page=1;position.offset=0;}
      let gallery=position.page===1?first:parseGallery(await html(galleryURL(group,position.page)),group,position.page);
      if(position.offset>=gallery.links.length)position.offset=0;
      const count=Math.floor(maxWorks/Object.keys(eso.groups).length)+(groupIndex<maxWorks%Object.keys(eso.groups).length?1:0);
      for(let index=0;index<count;index++){
        if(position.offset>=gallery.links.length){position.page=position.page>=gallery.pages?1:position.page+1;position.offset=0;gallery=parseGallery(await html(galleryURL(group,position.page)),group,position.page);}
        const pageUrl=gallery.links[position.offset],id=new URL(pageUrl).pathname.split('/').at(-2),saved=records.get(id);
        if(visited.has(id)){position.offset++;continue;}visited.add(id);
        try{
          const raw=parseWork(await html(pageUrl),pageUrl,group);
          if(!raw){records.delete(id);updated=true;position.offset++;continue;}
          const modified=await metadata(raw.download,32*1024*1024),previewModified=await metadata(raw.image,8*1024*1024),revision=crypto.createHash('sha256').update(JSON.stringify([raw.download,raw.image,modified,previewModified])).digest('hex');
          const reusable=saved?.revision===revision;
          const original=reusable?{width:saved.width,height:saved.height}:await dimensions(pacedFetch,raw.download);
          const preview=reusable?{width:saved.imageWidth,height:saved.imageHeight}:await dimensions(pacedFetch,raw.image);
          const item=eso.normalizeRecords([{...raw,...original,imageWidth:preview.width,imageHeight:preview.height,modified,previewModified,revision}])[0];
          if(item)records.set(id,item.feedRecord);else records.delete(id);updated=true;
        }catch(error){if(error.pause)throw error;logger.warn('ESO 作品暂不可核对，保留已验证记录：'+pageUrl+' · '+error.message);}
        position.offset++;
      }
      if(position.offset>=gallery.links.length){position.page=position.page>=gallery.pages?1:position.page+1;position.offset=0;}
      logger.log('ESO '+eso.groups[group]+'：已检查本批 '+count+' 件，下一位置 '+position.page+' 页 / '+position.offset+'；目录保留 '+records.size+' 张。');
    }
    return {records:[...records.values()],updated,interrupted:false,continuation:{positions}};
  }catch(error){if(!error.pause)throw error;return {records:[...records.values()],updated,interrupted:true,continuation:{positions,retryAt:retryTime(error.retryAfter,now)}};}
}
module.exports={galleryURL,policyLicensed,parseGallery,parseCredit,parseWork,positionsFor,collectESO};
