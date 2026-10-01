const crypto=require('node:crypto');
const {parseDocument,DomUtils:dom}=require('htmlparser2');
const tyson=require('../source/wallpapers/tyson.js');
const commons=require('../source/wallpapers/commons.js');
const hasClass=(node,name)=>node.attribs?.class?.split(/\s+/).includes(name);
const value=node=>dom.textContent(node||{children:[]}).trim();

function articleLicensed(html){
  const doc=parseDocument(String(html||'')),footer=dom.findOne(node=>node.name==='footer',doc.children,true);
  if(!footer||!value(footer).includes('Copyright © '+tyson.artist))return false;
  return dom.findAll(node=>node.name==='p',footer.children).some(node=>value(node).startsWith('Content on this website (including external copies) is dual-licensed under the ')&&value(node).includes(', unless stated otherwise.')&&dom.findAll(link=>link.name==='a',node.children).some(link=>link.attribs.href===tyson.source.licenseUrl&&value(link)==='Creative Commons License Attribution-ShareAlike (CC BY-SA)'));
}

function primaryWork(post,terms,authorID){
  if(!(terms instanceof Map)||!Number.isSafeInteger(authorID)||authorID<1||post?.status!=='publish'||post.type!=='post'||post.content?.protected===true||post.author!==authorID||!Array.isArray(post.categories)||post.categories.some(id=>!Number.isSafeInteger(id)||id<1)||!Number.isSafeInteger(post.id)||post.id<1||!tyson.workURL(post.link)||tyson.excluded.test(commons.plainText(post.title?.rendered)))return null;
  const project=Object.keys(tyson.projects).find(slug=>post.categories?.includes(terms.get(slug))&&new URL(post.link).pathname.startsWith('/gallery/'+slug+'/'));
  if(!project)return null;
  const doc=parseDocument(String(post.content?.rendered||'')),figure=dom.findOne(node=>node.name==='figure'&&hasClass(node,'wp-block-image'),doc.children,true);
  if(!figure)return null;
  const image=dom.findOne(node=>node.name==='img',figure.children,true),caption=dom.findOne(node=>node.name==='figcaption',figure.children,true);
  const fullsize=dom.findAll(node=>node.name==='a',caption?.children||[]).find(node=>/^(?:Download )?Fullsize$/i.test(value(node)));
  const title=value(caption).split('|')[0].trim(),mediaID=Number(image?.attribs?.class?.match(/(?:^|\s)wp-image-(\d+)(?:\s|$)/)?.[1]);
  if(!title||tyson.excluded.test(title)||!Number.isSafeInteger(mediaID)||mediaID<1||!tyson.imageURL(image?.attribs?.src)||!tyson.imageURL(fullsize?.attribs?.href)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(post.modified_gmt))return null;
  if(/all rights reserved|no redistribution|CC[- ]BY[- ]NC|CC0|Creative Commons? Zero|Public[ -]domain license|License:\s*MIT|copyright belongs to|©\s*(?:GalaxyTrail|Nintendo|SEGA)/i.test(value(doc)))return null;
  return {workID:post.id,mediaID,project,title,artist:tyson.artist,image:image.attribs.src,download:fullsize.attribs.href,pageUrl:post.link,postModified:post.modified_gmt,license:tyson.source.license,licenseUrl:tyson.source.licenseUrl,licenseSource:post.link};
}

async function collectTyson({fetcher=fetch,dimensions,old=[],logger=console,wait=delay=>new Promise(resolve=>setTimeout(resolve,delay)),intervalMs=500}={}){
  if(typeof dimensions!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>60000)throw Error('作者画廊同步配置无效');
  let requested=false;
  async function pacedFetch(url,options={}){
    if(requested&&intervalMs)await wait(intervalMs);requested=true;
    const response=await fetcher(url,{...options,headers:{...options.headers,'User-Agent':'RabbitWallpaperStation/1.0 (licensed author gallery)'},signal:options.signal||AbortSignal.timeout(20000)});
    if([429,503].includes(response.status)){const error=Error('作者图源要求冷却，保留上次目录');error.pause=true;await response.body?.cancel?.();throw error;}
    if(!response.ok)throw Error('作者图源返回 HTTP '+response.status);return response;
  }
  const terms=await (await pacedFetch(tyson.source.api+'categories?slug='+Object.keys(tyson.projects).join(','))).json();
  if(!Array.isArray(terms)||Object.keys(tyson.projects).some(slug=>!terms.some(term=>term.slug===slug&&term.taxonomy==='category'&&Number.isSafeInteger(term.id)&&term.id>0)))throw Error('原创画廊分类已变化');
  const selected=new Map(terms.filter(term=>Object.hasOwn(tyson.projects,term.slug)).map(term=>[term.slug,term.id]));
  const authors=await (await pacedFetch(tyson.source.api+'users?slug=tysontan')).json();
  if(!Array.isArray(authors)||authors.length!==1||authors[0].name!==tyson.artist||!Number.isSafeInteger(authors[0].id)||authors[0].id<1||authors[0].link!==tyson.origin+'/author/tysontan/')throw Error('作者身份无法核对');
  const posts=[],seen=new Set();let pages=1,total;
  for(let page=1;page<=pages;page++){
    const url=new URL(tyson.source.api+'posts');Object.entries({categories:[...selected.values()].join(','),author:String(authors[0].id),per_page:'100',page:String(page)}).forEach(([key,val])=>url.searchParams.set(key,val));
    const response=await pacedFetch(url.href),entries=await response.json(),pageCount=response.headers?.get('x-wp-totalpages'),count=response.headers?.get('x-wp-total');
    if(!/^\d+$/.test(pageCount)||!/^\d+$/.test(count)||Number(pageCount)>10||Number(count)>1000||!Array.isArray(entries)||entries.length>100)throw Error('作者画廊分页无法完整读取');
    if(page===1){pages=Number(pageCount);total=Number(count);if(pages!==Math.ceil(total/100))throw Error('作者画廊分页总数不一致');}
    if(Number(pageCount)!==pages||Number(count)!==total)throw Error('作者画廊在分页过程中变化');
    for(const post of entries){if(!Number.isSafeInteger(post?.id)||post.id<1||seen.has(post.id))throw Error('作者画廊包含无效或重复作品');seen.add(post.id);posts.push(post);}
  }
  if(posts.length!==total)throw Error('作者画廊目录尚未完整读取');
  const previous=tyson.normalizeRecords((Array.isArray(old)?old:[]).map(item=>item?.feedRecord)),known=new Map(previous.map(item=>[item.workID,item.feedRecord])),checked=[];
  for(const post of posts){
    const raw=primaryWork(post,selected,authors[0].id),saved=known.get(post.id);if(!raw)continue;
    try{
      const html=await (await pacedFetch(raw.pageUrl)).text();if(!articleLicensed(html))continue;
      const doc=parseDocument(html),canonical=dom.findOne(node=>node.name==='link'&&node.attribs.rel==='canonical',doc.children,true);
      if(canonical?.attribs.href!==raw.pageUrl||!dom.findAll(node=>node.name==='img',doc.children).some(node=>node.attribs.src===raw.image)||!dom.findAll(node=>node.name==='a',doc.children).some(node=>node.attribs.href===raw.download))throw Error('作品页文件绑定无法核对');
      async function metadata(url){const response=await pacedFetch(url,{method:'HEAD'}),modified=response.headers.get('last-modified');if(!Number.isFinite(Date.parse(modified))||!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('图片修改时间或格式无效');return modified;}
      const modified=await metadata(raw.download),previewModified=await metadata(raw.image),revision=crypto.createHash('sha256').update(JSON.stringify([raw.download,raw.image,raw.postModified,modified,previewModified])).digest('hex');
      const original=saved?.revision===revision?{width:saved.width,height:saved.height}:await dimensions(pacedFetch,raw.download);
      const preview=saved?.revision===revision?{width:saved.imageWidth,height:saved.imageHeight}:await dimensions(pacedFetch,raw.image);
      checked.push({...raw,...original,imageWidth:preview.width,imageHeight:preview.height,modified,previewModified,revision});
    }catch(error){if(error.pause)throw error;if(saved)checked.push(saved);logger.warn('作者作品暂不可用，保留已验证记录：'+raw.title+' · '+error.message);}
  }
  return checked;
}
module.exports={articleLicensed,primaryWork,collectTyson};
