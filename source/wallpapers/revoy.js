/* David Revoy's miscellaneous paintings; every accepted work needs its own image license. */
(function(root){
  'use strict';
  const commons=typeof module!=='undefined'&&module.exports?require('./commons.js'):root.WallpaperCommons;
  const origin='https://www.peppercarrot.com',directory=origin+'/0_sources/0ther/misc/';
  const source=Object.freeze({name:'David Revoy · 原创绘画',gallery:origin+'/en/artworks/misc.html',categories:['illustration','anime','fantasy','nature','city','animals','cyberpunk','art']});
  const licenses=Object.freeze({'CC BY 4.0':'https://creativecommons.org/licenses/by/4.0/','CC BY-SA 4.0':'https://creativecommons.org/licenses/by-sa/4.0/'});
  const filenamePattern=/^\d{4}-\d{2}-\d{2}[_-][a-z0-9_-]+_by-David-Revoy\.jpg$/i;
  const excluded=/article|blog|comic|tutorial|logo|sticker|teeshirt|annuncement|announcement|pie-chart|color-text|lineart|sketchpage|sketches|guitar-picks|mascot-study|fan-art|tribute|nsfw|nude|nudity|erotic|sexual|porn|fairy-nuts|regenerating-him|tifa|aerith|secret-of-mana|darkness-of-mana|popoi|dr-slump|tiffany-aching|hibiki|(?:^|[_ -])2b(?:[_ -]|$)/i;
  const validFilename=value=>typeof value==='string'&&value.length<=300&&filenamePattern.test(value)&&!excluded.test(value);
  const pageFor=filename=>origin+'/en/viewer/misc__'+filename.slice(0,-4)+'.html';
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=30000&&height<=30000;
  function parseGallery(html){
    const records=[],seen=new Set();
    for(const match of String(html||'').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<img\b[^>]*src="([^"]+)"[^>]*>/gi)){
      const stem=match[1].match(/^https:\/\/www\.peppercarrot\.com\/en\/viewer\/misc__([a-z0-9_-]+)\.html$/i)?.[1],filename=stem?stem+'.jpg':null;
      if(!validFilename(filename)||seen.has(filename))continue;
      seen.add(filename);records.push({filename,pageUrl:pageFor(filename)});
    }
    return records;
  }
  function parseWork(html,candidate){
    if(!validFilename(candidate?.filename)||candidate.pageUrl!==pageFor(candidate.filename))return null;
    const content=String(html||''),footer=content.match(/<div\b[^>]*class="[^\"]*\bViewFooterInfo\b[^\"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if(!footer||!/\<\/a\>\s+by David Revoy\s*−\s*<a\b/i.test(footer)||/Do not reuse|ViewFooterDisclaimer/i.test(footer))return null;
    const links=[...footer.matchAll(/<a\b[^>]*href="([^\"]+)"[^>]*>([\s\S]*?)<\/a>/gi)],titleLink=links.find(link=>link[1]===candidate.pageUrl);
    const declared=links.flatMap(link=>Object.entries(licenses).filter(([name,url])=>[url,url+'deed.en'].includes(link[1])&&commons.plainText(link[2]).replace('CC-','CC ')===name));
    const title=commons.plainText(titleLink?.[2]).replace(/^["“]|["”]$/g,'');
    if(declared.length!==1||!title||title.length>150||excluded.test(title))return null;
    const download=directory+'hi-res/'+candidate.filename,image=directory+'low-res/'+candidate.filename;
    if(![...content.matchAll(/<a\b[^>]*href="([^\"]+)"[^>]*>\s*<img\b[^>]*src="([^\"]+)"[^>]*>/gi)].some(match=>match[1]===download&&match[2]===image))return null;
    const [license,licenseUrl]=declared[0];return {...candidate,title,artist:'David Revoy',image,download,license,licenseUrl};
  }
  function categoriesFor(filename){
    const categories=['illustration'],name=filename.toLowerCase();
    for(const [category,pattern] of Object.entries({anime:/pepper|carrot|shichimi|kiki|dryad|(?:^|[_-])mage(?:[_-]|$)|warrior/,fantasy:/dragon|elf|fairy|magic|(?:^|[_-])mage(?:[_-]|$)|warrior|owl-princess|fantasy|kinytia|guardienne/,nature:/landscape|tree|forest|lake|lac-|river|beach|island|pyrennee|autumn|windmill/,city:/city|boston|town|street|port-|tower|village|castle|restaurant/,animals:/cat-|rabbit|fish|dragon|boar/,cyberpunk:/cyberpunk/,art:/watercolor|darwin|portrait|painting|study/}))if(pattern.test(name))categories.push(category);
    return categories;
  }
  function normalizeRecords(records){
    const items=[],seen=new Set(),labels={illustration:'插画',anime:'二次元',fantasy:'幻想',nature:'风景',city:'城市',animals:'动物',cyberpunk:'赛博朋克',art:'绘画'};
    for(const raw of Array.isArray(records)?records:[]){
      if(!validFilename(raw?.filename)||raw.artist!=='David Revoy'||!Object.hasOwn(licenses,raw.license)||raw.licenseUrl!==licenses[raw.license]||raw.pageUrl!==pageFor(raw.filename)||raw.download!==directory+'hi-res/'+raw.filename||raw.image!==directory+'low-res/'+raw.filename||seen.has(raw.filename))continue;
      const title=commons.plainText(raw.title),{width,height,imageWidth,imageHeight}=raw;
      if(!title||title.length>150||excluded.test(title)||!validSize(width,height)||Math.max(width,height)<1600||Math.min(width,height)<800||!validSize(imageWidth,imageHeight)||imageWidth>width||imageHeight>height||Math.abs(width*imageHeight/(height*imageWidth)-1)>=0.01)continue;
      if(typeof raw.revision!=='string'||!/^[a-f0-9]{64}$/.test(raw.revision)||![raw.modified,raw.previewModified].every(value=>typeof value==='string'&&value.length<100&&Number.isFinite(Date.parse(value))))continue;
      seen.add(raw.filename);const categories=categoriesFor(raw.filename),feedRecord={filename:raw.filename,title,artist:raw.artist,image:raw.image,download:raw.download,pageUrl:raw.pageUrl,license:raw.license,licenseUrl:raw.licenseUrl,width,height,imageWidth,imageHeight,modified:raw.modified,previewModified:raw.previewModified,revision:raw.revision};
      items.push({id:'revoy-'+raw.filename.slice(0,-4),source:'commons',provider:'revoy',...feedRecord,copyrightNotice:'本站预览等比例缩小并转为 WebP，高清入口保留作者原图。',categories,tags:[...categories.map(category=>labels[category]),source.name,width>=height?'横屏':'竖屏'],feedRecord});
    }
    return items;
  }
  const api={source,licenses,validFilename,parseGallery,parseWork,categoriesFor,normalizeRecords};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WallpaperRevoy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
