const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {parseDocument,DomUtils:dom}=require('htmlparser2');
const blender=require('../source/wallpapers/blender.js');
const {readZipImages}=require('./read-wallpaper-zip.cjs');
const {readImage}=require('./build-wallpaper-previews.cjs');
const {retryTime,cooldownUntil}=require('./wallpaper-request-policy.cjs');
const hasClass=(node,name)=>node.attribs?.class?.split(/\s+/).includes(name);
const nodes=(root,predicate)=>dom.findAll(predicate,root.children||[]);
const text=node=>dom.textContent(node||{children:[]}).replace(/\s+/g,' ').trim();
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function robotsDelay(value,targets){
  const groups=[];let group;
  for(const line of String(value||'').split(/\r?\n/).map(line=>line.split('#')[0].trim()).filter(Boolean)){
    const directive=line.match(/^(User-agent|Allow|Disallow|Crawl-delay|Sitemap):\s*(.*)$/i);if(!directive)throw Error('原站访问规则无法核对');
    const key=directive[1].toLowerCase(),argument=directive[2];if(key==='sitemap')continue;
    if(key==='user-agent'){
      if(!argument)throw Error('原站访问规则无法核对');
      if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group);}group.agents.push(argument.toLowerCase());
    }else{if(!group)throw Error('原站访问规则无法核对');group.rules.push({key,argument});}
  }
  const score=entry=>Math.max(...entry.agents.map(agent=>agent==='*'?0:'rabbitwallpaperstation/1.2'.startsWith(agent)?agent.length:-1));
  const specificity=Math.max(-1,...groups.map(score)),rules=groups.filter(entry=>specificity>=0&&score(entry)===specificity).flatMap(entry=>entry.rules);
  let delay=0;
  for(const rule of rules)if(rule.key==='crawl-delay'){
    const seconds=Number(rule.argument);if(!rule.argument||!Number.isFinite(seconds)||seconds<0||seconds>60)throw Error('原站请求间隔超过读取限制');delay=Math.max(delay,Math.ceil(seconds*1000));
  }
  for(const target of targets){
    const matching=rules.filter(rule=>['allow','disallow'].includes(rule.key)&&rule.argument).filter(rule=>{
      const end=rule.argument.endsWith('$'),pattern=rule.argument.slice(0,end?-1:undefined).split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
      return new RegExp('^'+pattern+(end?'$':'')).test(target);
    }).sort((a,b)=>b.argument.replace(/[*$]/g,'').length-a.argument.replace(/[*$]/g,'').length||Number(a.key==='disallow')-Number(b.key==='disallow'));
    if(matching[0]?.key==='disallow')throw Error('原站不允许读取该素材路径');
  }
  return delay;
}

function discoverAsset(html,key){
  const work=blender.works[key];if(!Object.hasOwn(blender.works,key))throw Error('未知动画项目');
  const doc=parseDocument(String(html||'')),titles=nodes(doc,node=>node.name==='title');
  if(titles.length!==1||text(titles[0])!=='Press - '+work.projectName+' - Blender Studio')throw Error('动画项目公开目录无法核对');
  const assets=nodes(doc,node=>node.name==='a'&&hasClass(node,'file-modal-link')&&node.attribs['data-asset-id']===String(work.assetID));
  if(!assets.length)return null;
  if(assets.length!==1||assets[0].attribs.title!==work.title||blender.origin+assets[0].attribs['data-url']!==blender.assetURL(key))throw Error('动画素材与项目目录不一致');
  return blender.assetURL(key);
}

function projectLicensed(html,key){
  const work=Object.hasOwn(blender.works,key)?blender.works[key]:null;if(!work)return false;
  const doc=parseDocument(String(html||'')),bodies=nodes(doc,node=>hasClass(node,'flat-page-content'));if(bodies.length!==1)return false;
  const paragraphs=nodes(bodies[0],node=>node.name==='p'),content=paragraphs.map(text).join(' ');
  return content.includes('This includes all the data we publish on this website.')&&content.includes('you can freely reuse and distribute this content, also commercially')&&content.includes(work.attribution)&&paragraphs.some(node=>nodes(node,link=>link.name==='a'&&link.attribs.href===blender.licenseUrl).length===1)&&!content.includes('redistribution is prohibited');
}

function parseAsset(html,key){
  const work=Object.hasOwn(blender.works,key)?blender.works[key]:null;if(!work)throw Error('未知动画项目');
  const doc=parseDocument(String(html||'')),roots=nodes(doc,node=>hasClass(node,'js-modal-inner-wrapper')&&node.attribs.id==='asset-'+work.assetID&&node.attribs['data-asset-id']===String(work.assetID));
  if(roots.length!==1)throw Error('动画素材详情无法核对');const root=roots[0];
  if(nodes(root,node=>hasClass(node,'content-locked-img')).length)return null;
  const toolbars=nodes(root,node=>hasClass(node,'btns-toolbar')),names=nodes(root,node=>hasClass(node,'profile-name')),descriptions=nodes(root,node=>hasClass(node,'markdown-text')&&hasClass(node.parent,'modal-body'));
  if(toolbars.length!==1||names.length!==1||descriptions.length!==1)throw Error('动画素材许可或作者结构无法核对');
  const licenses=nodes(toolbars[0],node=>node.name==='a'&&hasClass(node,'dropdown-item')&&/^License\b/.test(text(node))),titles=nodes(descriptions[0],node=>node.name==='h3');
  if(licenses.length!==1||titles.length!==1||text(titles[0])!==work.title)throw Error('动画素材许可或标题无法核对');
  if(licenses[0].attribs.href!==blender.licenseUrl||text(licenses[0])!=='License CC-BY'||text(names[0])!==work.contributor)return null;
  const free=nodes(root,node=>node.name==='ul'&&hasClass(node,'list-inline')).some(node=>nodes(node,child=>child.name==='li'&&text(child)==='Free').length===1);
  if(!free)return null;
  const downloads=nodes(toolbars[0],node=>node.name==='a'&&/^Download \(/.test(node.attribs.title||'')&&/\.zip$/i.test(node.attribs.download||''));
  if(downloads.length!==1)throw Error('动画素材下载入口无法核对');
  const sourceFile=blender.fileURL(blender.origin+downloads[0].attribs.href);if(!sourceFile)throw Error('动画素材下载路径无效');
  return {work:key,assetID:work.assetID,sourceFile,artist:blender.artist,contributor:work.contributor,pageUrl:blender.pageFor(key),license:blender.license,licenseUrl:blender.licenseUrl,licenseSource:blender.origin+work.licenseSource};
}

async function inspectImage(data,raw,member){
  const work=raw&&Object.hasOwn(blender.works,raw.work)?blender.works[raw.work]:null;if(!work||!work.member.test(member))return null;
  const image=sharp(data,{limitInputPixels:60000000}),meta=await image.metadata(),extension=member.endsWith('.png')?'png':'jpg';
  if(meta.format!==(extension==='png'?'png':'jpeg')||(meta.pages||1)!==1||(meta.orientation||1)!==1||Math.max(meta.width,meta.height)<1600||Math.min(meta.width,meta.height)<800)return null;
  const stats=await image.stats();if(meta.hasAlpha&&!stats.isOpaque)return null;
  const record={...raw,member,revision:digest(data),extension,width:meta.width,height:meta.height,bytes:data.length};
  return blender.normalizeRecords([record])[0]?.feedRecord||null;
}

async function collectBlender({fetcher=fetch,old=[],retryAt,now=new Date(),outputDir=path.resolve(__dirname,'../source/wallpapers/originals/blender'),logger=console,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay)),intervalMs=1000,workIds=Object.keys(blender.works)}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000||!Array.isArray(workIds)||!workIds.length||new Set(workIds).size!==workIds.length||workIds.some(key=>!Object.hasOwn(blender.works,key)))throw Error('动画图源同步配置无效');
  const previous=blender.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),records=new Map(previous.map(item=>[item.id,item.feedRecord]));
  const cooling=cooldownUntil(now,retryAt);if(cooling)return {records:[...records.values()],retryAt:cooling,updated:false,interrupted:true};
  let requested=false,updated=false,robots;
  async function pacedFetch(url,options){
    const delay=robots===undefined?intervalMs:Math.max(intervalMs,robotsDelay(robots,[new URL(url).pathname+new URL(url).search]));
    if(requested&&delay)await wait(delay);requested=true;
    const response=await fetcher(url,options);
    if([429,503].includes(response.status)){const error=Error('动画图源要求冷却');error.pause=true;error.retryAt=retryTime(response.headers?.get?.('retry-after'),now);await response.body?.cancel?.();throw error;}
    return response;
  }
  async function html(url,allowEmpty=false){return (await readImage(pacedFetch,url,{maxBytes:2*1024*1024,allowEmpty})).toString('utf8');}
  try{
    robots=await html(blender.origin+'/robots.txt',true);robotsDelay(robots,[]);await fs.mkdir(outputDir,{recursive:true});
    for(const key of workIds){
      try{
        const work=blender.works[key],licensed=projectLicensed(await html(blender.origin+work.licenseSource),key);
        if(!licensed)throw Error('动画项目授权声明已变化');
        const asset=discoverAsset(await html(blender.pageFor(key)),key),raw=asset?parseAsset(await html(asset),key):null,checked=[];
        if(raw){
          const bytes=await readImage(pacedFetch,raw.sourceFile);raw.archiveRevision=digest(bytes);
          for(const {member,data} of readZipImages(bytes,work.member)){
            const record=await inspectImage(data,raw,member);if(!record)continue;
            const file=path.join(outputDir,record.revision+'.'+record.extension);await fs.writeFile(file+'.tmp',data);await fs.rename(file+'.tmp',file);checked.push(record);
          }
        }
        for(const [id,record] of records)if(record.work===key)records.delete(id);
        for(const item of blender.normalizeRecords(checked))records.set(item.id,item.feedRecord);
        updated=true;logger.log('Blender '+work.projectName+'：'+checked.length+' 张');
      }catch(error){if(error.pause)throw error;logger.warn('动画素材暂不可用，保留该项目已有图片：'+key+' · '+error.message);}
    }
    if(!updated)throw Error('所有动画素材均无法读取');
    const keep=new Set([...records.values()].map(record=>record.revision+'.'+record.extension));
    for(const filename of await fs.readdir(outputDir))if(/^[a-f0-9]{64}\.(jpg|png)$/.test(filename)&&!keep.has(filename))await fs.unlink(path.join(outputDir,filename));
    return {records:[...records.values()],updated,interrupted:false};
  }catch(error){if(!error.pause)throw error;return {records:[...records.values()],retryAt:error.retryAt,updated,interrupted:true};}
}
module.exports={robotsDelay,discoverAsset,projectLicensed,parseAsset,inspectImage,collectBlender};
