const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const {parseDocument,DomUtils:dom}=require('htmlparser2');
const {readZipImages}=require('./read-wallpaper-zip.cjs');
const oga=require('../source/wallpapers/opengameart.js');
const {readImage}=require('./build-wallpaper-previews.cjs');
const {read7zImages}=require('./read-wallpaper-7z.cjs');
const {retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const originalDir=path.resolve(__dirname,'../source/wallpapers/originals/opengameart');
const hasClass=(node,name)=>node.attribs?.class?.split(/\s+/).includes(name);
const field=(node,name)=>dom.findOne(child=>hasClass(child,'field-name-'+name),node.children||[],true);
const links=node=>dom.findAll(child=>child.name==='a',node?.children||[]);
const value=node=>dom.textContent(node||{children:[]}).trim();

function parseWork(html,key){
  const work=Object.hasOwn(oga.works,key)?oga.works[key]:null;if(!work)throw Error('未知场景作品');
  const doc=parseDocument(String(html||'')),root=dom.findOne(node=>hasClass(node,'node-art')&&hasClass(node,'view-mode-full'),doc.children,true);
  if(!root||!field(root,'author-submitter')||!field(root,'field-art-licenses')||!field(root,'field-art-files'))throw Error('作品页结构无法核对');
  const author=links(field(root,'author-submitter')).find(link=>link.attribs.href===work.artistPath);
  const licenses=links(field(root,'field-art-licenses'));
  if(value(author)!==work.artist||!licenses.some(link=>['http://creativecommons.org/publicdomain/zero/1.0/',oga.licenseUrl].includes(link.attribs.href)&&value(link)==='CC0'))return [];
  const notice=value(dom.findOne(node=>hasClass(node,'field-items'),field(root,'field-copyright-notice')?.children||[],true));
  const body=value(field(root,'body'));
  if(/\b(?:no redistribution|all rights reserved|non.?commercial only|AI.generated|stable diffusion|midjourney)\b/i.test(body+' '+notice))return [];
  const records=[];
  for(const link of links(field(root,'field-art-files'))){
    const url=oga.fileURL(link.attribs.href),type=link.attribs.type?.match(/^(application\/(?:zip|x-7z-compressed)|image\/(?:png|jpeg|webp)); length=(\d+)$/),fileID=Number(link.attribs['data-fid']);
    const archiveMime=work.archive==='7z'?'application/x-7z-compressed':work.archive?'application/zip':null;
    if(!url||!type||!Number.isSafeInteger(fileID)||fileID<1||Number(type[2])<1||Number(type[2])>32*1024*1024||!work.file.test(decodeURIComponent(new URL(url).pathname.split('/').pop()))||(archiveMime?type[1]!==archiveMime:!type[1].startsWith('image/')))continue;
    records.push({work:key,fileID,sourceFile:url,sourceBytes:Number(type[2]),artist:work.artist,pageUrl:oga.origin+'/content/'+work.slug,license:'CC0',licenseUrl:oga.licenseUrl,copyrightNotice:notice});
  }
  return [...new Map(records.map(record=>[record.sourceFile,record])).values()];
}

function archiveImages(bytes,key){
  const work=oga.works[key];if(work?.archive!==true||bytes.length>32*1024*1024)throw Error('素材包不符合大小限制');
  return readZipImages(bytes,work.member);
}

async function inspectImage(data,raw,member){
  const image=sharp(data,{limitInputPixels:60000000}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)!==1||(meta.orientation||1)!==1||Math.max(meta.width,meta.height)<1600||Math.min(meta.width,meta.height)<800||meta.hasAlpha&&!(await image.stats()).isOpaque)return null;
  const extension={jpeg:'jpg',png:'png',webp:'webp'}[meta.format];
  const name=member.split('/').pop().replace(/\.[^.]+$/,'').replaceAll('-',' ');
  const work=oga.works[raw.work],detail=work.titles?.[name.replace(/_\d+$/,'')]||(raw.work==='manga'?name.replace(/^manga_bg_/,''):name);
  const title=work.label+' · '+detail;
  const record={...raw,member,title,revision:crypto.createHash('sha256').update(data).digest('hex'),extension,width:meta.width,height:meta.height,bytes:data.length};
  return oga.normalizeRecords([record])[0]?.feedRecord||null;
}

async function collectOpenGameArt({fetcher=fetch,old=[],retryAt,now=new Date(),outputDir=originalDir,logger=console,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay)),intervalMs=10000,workIds=Object.keys(oga.works)}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000||workIds.some(key=>!Object.hasOwn(oga.works,key)))throw Error('场景图源配置无效');
  const previous=oga.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord));
  const records=new Map(previous.map(item=>[item.id,item.feedRecord]));let requests=0,updated=false;
  const cooling=cooldownUntil(now,retryAt);if(cooling)return {records:[...records.values()],retryAt:cooling,updated:false,interrupted:true};
  async function pacedFetch(url,options){
    if(requests)await wait(intervalMs);requests++;
    const response=await fetcher(url,options);
    if([429,503].includes(response.status)){
      const error=Error('图源返回 HTTP '+response.status);error.pause=true;error.retryAt=retryTime(response.headers?.get?.('retry-after'),now);await response.body?.cancel?.();throw error;
    }
    return response;
  }
  async function text(url){return (await readImage(pacedFetch,url,{maxBytes:2*1024*1024,timeout:85000})).toString('utf8');}
  // The public artwork and file paths are crawlable; honor the site's current delay.
  let robots;
  try{robots=await text(oga.origin+'/robots.txt');}
  catch(error){if(error.pause)return {records:[...records.values()],retryAt:error.retryAt,updated:false,interrupted:true};throw error;}
  const rules=robots.split(/\r?\n/).map(line=>line.replace(/#.*/, '').trim());let active=false;
  if(!rules.some(rule=>/^User-agent:\s*\*$/i.test(rule)))throw Error('原站采集规则无法核对');
  for(const rule of rules){
    const agent=rule.match(/^User-agent:\s*(.+)$/i);if(agent){active=agent[1]==='*'||/rabbitwallpaperstation/i.test(agent[1]);continue;}if(!active)continue;
    const delay=rule.match(/^Crawl-delay:\s*(\d+)$/i);if(delay){if(Number(delay[1])>60)throw Error('原站请求间隔超过本轮读取限制');intervalMs=Math.max(intervalMs,Number(delay[1])*1000);}
    const disallow=rule.match(/^Disallow:\s*(.+)$/i);if(disallow&&['/content/','/sites/default/files/'].some(target=>target.startsWith(disallow[1])||disallow[1].startsWith(target)))throw Error('原站不允许读取作品或素材文件');
  }
  await fs.mkdir(outputDir,{recursive:true});
  for(const key of workIds){
    try{
      const candidates=parseWork(await text(oga.origin+'/content/'+oga.works[key].slug),key),checked=[];
      for(const raw of candidates){
        const bytes=await readImage(pacedFetch,raw.sourceFile,{timeout:85000});
        if(bytes.length!==raw.sourceBytes)throw Error('素材文件大小与作者目录不一致');
        const images=oga.works[key].archive==='7z'?await read7zImages(bytes,key):oga.works[key].archive?archiveImages(bytes,key):[{member:decodeURIComponent(new URL(raw.sourceFile).pathname.split('/').pop()),data:bytes}];
        for(const {member,data} of images){
          const record=await inspectImage(data,raw,member);if(!record)continue;
          const filename=record.revision+'.'+record.extension,temporary=path.join(outputDir,filename+'.tmp');
          await fs.writeFile(temporary,data);await fs.rename(temporary,path.join(outputDir,filename));checked.push(record);
        }
      }
      for(const [id,record] of records)if(record.work===key)records.delete(id);
      for(const item of oga.normalizeRecords(checked))records.set(item.id,item.feedRecord);
      updated=true;logger.log('OpenGameArt '+key+'：'+checked.length+' 张');
    }catch(error){
      if(error.pause)return {records:[...records.values()],retryAt:error.retryAt,updated,interrupted:true};
      logger.warn('场景素材暂不可用，保留该作品已有图片：'+key+' · '+error.message);
    }
  }
  if(!updated)throw Error('所有场景作品均无法读取');
  const keep=new Set([...records.values()].map(record=>record.revision+'.'+record.extension));
  for(const filename of await fs.readdir(outputDir))if(/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(filename)&&!keep.has(filename))await fs.unlink(path.join(outputDir,filename));
  return {records:oga.normalizeRecords([...records.values()]).map(item=>item.feedRecord),updated,interrupted:false};
}
module.exports={parseWork,archiveImages,inspectImage,collectOpenGameArt};
