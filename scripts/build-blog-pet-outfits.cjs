const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const core=require('../source/projects/blog-pet/core.js');
const motion=require('../source/projects/blog-pet/motion.js');
const root=path.resolve(__dirname,'../source/projects/blog-pet');
const encoding={quality:92,alphaQuality:100,effort:6};
const positions={'0 0':[0,0],'100% 0':[1,0],'0 100%':[0,1],'100% 100%':[1,1]};

async function compileOutfit(outfit){
  const sprite=path.join(root,outfit.sprite),atlas=path.join(root,outfit.motion);
  const legacyImage=sharp(sprite.replace(/\.webp$/,'.png')).resize(512,512);
  const atlasImage=sharp(atlas.replace(/\.webp$/,'.png'));
  for(const image of [legacyImage,atlasImage]){
    if(!(await image.metadata()).hasAlpha)throw Error(outfit.name+'原稿缺少透明通道');
  }
  const legacy=await legacyImage.clone().ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const source=await atlasImage.clone().ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const width=source.info.width,height=source.info.height;
  const rows=motion.atlasRows(source.data,width,height);
  for(let row=0;row<4;row++)for(let column=0;column<8;column++){
    const x=Math.round(width*column/8),end=Math.round(width*(column+1)/8);
    const box=motion.frameBounds(source.data,width,{x,y:rows[row],width:end-x,height:rows[row+1]-rows[row]});
    if(!box || box.height<(rows[row+1]-rows[row])*.45)throw Error(outfit.name+'动作帧不完整：'+row+','+column);
  }
  const standing=motion.frameBounds(legacy.data,512,{x:0,y:0,width:256,height:256});
  const x=Math.round(width*3/8),end=Math.round(width*4/8);
  const blink=motion.frameBounds(source.data,width,{x,y:0,width:end-x,height:rows[1]});
  if(!standing || !blink || !positions[outfit.blinkPosition])throw Error(outfit.name+'站姿或眨眼位置无效');
  const cell=await atlasImage.clone().extract({left:blink.x,top:blink.y,width:blink.width,height:blink.height}).resize({height:standing.height}).png().toBuffer({resolveWithObject:true});
  if(cell.info.width>256)throw Error(outfit.name+'眨眼帧超出衣橱格子');
  const [column,row]=positions[outfit.blinkPosition];
  const left=column*256+Math.max(0,Math.min(256-cell.info.width,Math.round(standing.x+standing.width/2-cell.info.width/2)));
  const top=row*256+standing.y;
  await legacyImage.clone().webp(encoding).toFile(sprite);
  await atlasImage.clone().webp(encoding).toFile(atlas);
  console.log(outfit.name+'：站姿 '+Math.round((await fs.stat(sprite)).size/1024)+' KB，动作 '+Math.round((await fs.stat(atlas)).size/1024)+' KB');
  return {input:cell.data,left,top};
}

async function buildOutfits(){
  const groups=new Map();
  for(const outfit of core.outfits.filter(item=>item.blink)){
    if(!groups.has(outfit.blink))groups.set(outfit.blink,[]);
    groups.get(outfit.blink).push(outfit);
  }
  for(const [file,outfits] of groups){
    if(new Set(outfits.map(outfit=>outfit.blinkPosition)).size!==outfits.length)throw Error('眨眼图集格子重复：'+file);
    const cells=[];
    for(const outfit of outfits)cells.push(await compileOutfit(outfit));
    const image=sharp({create:{width:512,height:512,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(cells);
    await image.clone().png().toFile(path.join(root,file.replace(/\.webp$/,'.png')));
    await image.clone().webp(encoding).toFile(path.join(root,file));
  }
}

if(require.main===module)buildOutfits().catch(error=>{console.error('衣橱素材编译失败：'+error.message);process.exitCode=1;});
