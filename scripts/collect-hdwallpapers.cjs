const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {parseDocument,DomUtils:dom}=require('htmlparser2');
const hd=require('../source/wallpapers/hdwallpapers.js');
const {readImage}=require('./build-wallpaper-previews.cjs');
const {retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const text=node=>dom.textContent(node||{children:[]}).replace(/\s+/g,' ').trim();
const hasClass=(node,name)=>node.attribs?.class?.split(/\s+/).includes(name);
const nodes=(doc,name)=>dom.findAll(node=>node.name===name,doc.children);
function robotsAllowed(value){
  const lines=String(value||'').split(/\r?\n/).map(line=>line.split('#')[0].trim()).filter(Boolean);
  return lines.some(line=>/^User-agent:\s*\*$/i.test(line))&&lines.some(line=>/^Allow:\s*\/$/i.test(line))&&lines.every(line=>/^(?:User-agent:\s*\*|Allow:\s*\/|Disallow:\s*|Sitemap:\s*https:\/\/www\.hdwallpapers\.org\/sitemap\.xml)$/i.test(line));
}
function termsLicensed(html){
  const content=text(parseDocument(String(html||'')));
  return content.includes('most of the images are shared under a Creative Commons license')&&content.includes('the license is mentioned in every wallpaper page')&&content.includes('if you choose to use or upload in other projects, read carefully license terms')&&!/no automated|automated (?:access|scraping) is prohibited|do not scrape|no scraping|redistribution is prohibited/i.test(content);
}
function parseGallery(html,page=1){
  const doc=parseDocument(String(html||'')),headings=nodes(doc,'h1'),match=headings.length===1&&text(headings[0]).match(/^Anime\s*-\s*HD Wallpapers\s*\((\d+)\)$/),total=match?Number(match[1]):NaN;
  if(!Number.isSafeInteger(total)||total<0||total>1000||!Number.isSafeInteger(page)||page<1||page>Math.max(1,Math.ceil(total/16)))throw Error('动漫画廊目录或分页已变化');
  const links=nodes(doc,'figure').flatMap(figure=>nodes(figure,'a').map(link=>hd.workURL(link.attribs.href)).filter(Boolean));
  if(new Set(links).size!==links.length||links.length!==Math.min(16,Math.max(0,total-(page-1)*16)))throw Error('动漫画廊作品数不一致');
  return {total,pages:Math.max(1,Math.ceil(total/16)),links};
}
function parseWork(html,pageUrl){
  const page=hd.workURL(pageUrl);if(!page)return null;
  const doc=parseDocument(String(html||'')),canonical=nodes(doc,'link').filter(node=>node.attribs.rel==='canonical'),heading=nodes(doc,'h1'),author=nodes(doc,'div').filter(node=>hasClass(node,'w-author')),license=nodes(doc,'div').filter(node=>hasClass(node,'w-license'));
  if(canonical.length!==1||canonical[0].attribs.href!==page||heading.length!==1||author.length!==1||license.length!==1||text(author[0])!=='Author : '+hd.artist||text(license[0])!=='License : Public Domain CC0')return null;
  const title=text(heading[0]),tags=nodes(doc,'a').filter(node=>node.attribs.href?.startsWith(hd.origin+'/tag/')).map(text),workID=new URL(page).pathname.split('/').at(-2);
  if(!title||title.length>150||!/(?:^|[^a-z])ai(?:[^a-z]|$)/i.test(title+' '+tags.join(' '))||hd.excluded.test(title+' '+tags.join(' ')))return null;
  const scripts=nodes(doc,'script').filter(node=>node.attribs.type==='application/ld+json');if(scripts.length!==1)return null;
  let schema;try{schema=JSON.parse(text(scripts[0]));}catch(error){return null;}
  const {width,height,contentUrl}=schema||{};
  if(schema?.['@type']!=='ImageObject'||schema.name!==title+' HD Wallpaper'||schema.representativeOfPage!==true||![hd.origin+'/terms-of-service/#copyright-policy',hd.source.licenseUrl].includes(schema.license)||schema.acquireLicensePage!==page||schema.creator?.name!==hd.artist||schema.creditText!==hd.artist||schema.copyrightNotice!=='Image by '+hd.artist||schema.isAccessibleForFree!==true||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800||width*height>60000000||!hd.sourceFileURL(contentUrl,workID,width,height))return null;
  const downloadURL=hd.origin+new URL(page).pathname.replace('/wallpaper/','/download/')+width+'x'+height+'/';
  if(!nodes(doc,'a').some(node=>hasClass(node,'download-btn')&&node.attribs.href===downloadURL))return null;
  return {workID,title,artist:hd.artist,ai:true,tags,sourceFile:contentUrl,pageUrl:page,width,height,license:hd.source.license,licenseUrl:hd.source.licenseUrl,licenseSource:page};
}
async function collectHDWallpapers({fetcher=fetch,old=[],logger=console,now=new Date(),retryAt,outputDir=path.resolve(__dirname,'../source/wallpapers/originals/hdwallpapers'),wait=delay=>new Promise(resolve=>setTimeout(resolve,delay)),intervalMs=1000}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000)throw Error('壁纸同步间隔无效');
  const previous=hd.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),records=new Map(previous.map(item=>[item.feedRecord.workID,item.feedRecord]));
  const cooling=cooldownUntil(now,retryAt);if(cooling)return {records:[...records.values()],updated:false,interrupted:true,retryAt:cooling};
  let requested=false,complete=false;
  async function pacedFetch(url,options={}){
    if(requested&&intervalMs)await wait(intervalMs);requested=true;
    const response=await fetcher(url,{...options,redirect:'error',headers:{...options.headers,'User-Agent':'RabbitWallpaperStation/1.2 (licensed anime wallpapers)'},signal:options.signal||AbortSignal.timeout(25000)});
    if([429,503].includes(response.status)){const error=Error('图源要求冷却');error.pause=true;error.retryAfter=response.headers?.get('retry-after');await response.body?.cancel?.();throw error;}
    if(!response.ok)throw Error('图源返回 HTTP '+response.status);return response;
  }
  async function html(url){return (await readImage(pacedFetch,url,{maxBytes:512*1024})).toString('utf8');}
  try{
    if(!robotsAllowed(await html(hd.origin+'/robots.txt')))throw Error('图源自动访问规则已变化');
    if(!termsLicensed(await html(hd.origin+'/terms-of-service/')))throw Error('图源图片使用规则已变化');
    const links=[],seen=new Set();let pages=1,total;
    for(let page=1;page<=pages;page++){
      const result=parseGallery(await html(hd.source.gallery+(page===1?'':'?page='+page)),page);
      if(page===1){pages=result.pages;total=result.total;}
      if(result.pages!==pages||result.total!==total||result.links.some(link=>seen.has(link)))throw Error('动漫画廊在分页时发生变化');
      for(const link of result.links){seen.add(link);links.push(link);}
    }
    if(links.length!==total)throw Error('动漫画廊读取不完整');complete=true;
    for(const [id,record] of records)if(!seen.has(record.pageUrl))records.delete(id);
    for(const pageUrl of links){
      if(hd.excluded.test(pageUrl))continue;
      const id=new URL(pageUrl).pathname.split('/').at(-2),saved=records.get(id);
      try{
        const workHTML=await html(pageUrl),raw=parseWork(workHTML,pageUrl);
        if(!raw){
          if(!saved)continue;
          const doc=parseDocument(workHTML),author=nodes(doc,'div').filter(node=>hasClass(node,'w-author')),license=nodes(doc,'div').filter(node=>hasClass(node,'w-license')),title=nodes(doc,'h1');
          if(author.length===1&&license.length===1&&(text(author[0])!=='Author : '+hd.artist||text(license[0])!=='License : Public Domain CC0')||title.length===1&&hd.excluded.test(text(title[0])))records.delete(id);
          else throw Error('作品字段无法完整核对');
          continue;
        }
        const response=await pacedFetch(raw.sourceFile,{method:'HEAD'}),modified=response.headers.get('last-modified'),etag=response.headers.get('etag');await response.body?.cancel?.();
        raw.modified=Number.isFinite(Date.parse(modified))?modified:null;raw.etag=etag&&etag.length<=200?etag:null;
        let bytes;
        if(saved&&raw.sourceFile===saved.sourceFile&&raw.width===saved.width&&raw.height===saved.height&&(raw.modified||raw.etag)&&raw.modified===saved.modified&&raw.etag===saved.etag){
          try{bytes=await fs.readFile(path.join(outputDir,saved.revision+'.jpg'));if(bytes.length!==saved.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==saved.revision)bytes=null;}catch(error){if(error.code!=='ENOENT')throw error;}
        }
        if(!bytes)bytes=await readImage(pacedFetch,raw.sourceFile);
        const metadata=await sharp(bytes,{limitInputPixels:60000000}).metadata();if(metadata.format!=='jpeg'||metadata.width!==raw.width||metadata.height!==raw.height||(metadata.pages||1)!==1||metadata.orientation>=5)throw Error('最高分辨率文件的格式或尺寸不一致');
        raw.bytes=bytes.length;raw.revision=crypto.createHash('sha256').update(bytes).digest('hex');const item=hd.normalizeRecords([raw])[0];if(!item){records.delete(id);continue;}
        await fs.mkdir(outputDir,{recursive:true});const file=path.join(outputDir,raw.revision+'.jpg');await fs.writeFile(file+'.tmp',bytes);await fs.rename(file+'.tmp',file);records.set(id,item.feedRecord);
      }catch(error){if(error.pause)throw error;logger.warn('动漫壁纸暂不可用，保留已验证记录：'+pageUrl+' · '+error.message);}
    }
    return {records:[...records.values()],updated:true,interrupted:false};
  }catch(error){if(!error.pause)throw error;return {records:[...records.values()],updated:complete,interrupted:true,retryAt:retryTime(error.retryAfter,now)};}
}
module.exports={robotsAllowed,termsLicensed,parseGallery,parseWork,collectHDWallpapers};
