const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require('sharp');
const core=require('../source/projects/blog-pet/core.js');
const motion=require('../source/projects/blog-pet/motion.js');
const root=path.join(__dirname,'../source/projects/blog-pet');

async function bitmap(file){
  const image=sharp(path.join(root,file));
  const metadata=await image.metadata();
  assert.equal(metadata.hasAlpha,true,file+' must retain transparency');
  const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.ok(data[3]<16,file+' must have a transparent background');
  return {data,width:info.width,height:info.height};
}

test('wardrobe IDs remain unique and every outfit survives storage and interactions',()=>{
  assert.equal(new Set(core.outfits.map(outfit=>outfit.id)).size,core.outfits.length);
  for(const outfit of core.outfits){
    const saved={version:1,outfit:outfit.id,autoOutfit:false};
    const state=core.load({getItem:()=>JSON.stringify(saved)});
    assert.equal(state.outfit,outfit.id);
    assert.equal(core.interact(state,'pet').state.outfit,outfit.id);
    assert.equal(core.interact(state,'sleep').state.outfit,outfit.id);
  }
});

for(const outfit of core.outfits)test(outfit.name+' has all motion, fallback and blink cels',async()=>{
  const [atlas,base,blink]=await Promise.all([
    bitmap(outfit.motion),bitmap(outfit.sprite),bitmap(outfit.blink || './assets/youyou-blink-v1.webp')
  ]);
  assert.equal(base.width,base.height,'fallback atlas must be a square 2 by 2 grid');
  for(let row=0;row<2;row++)for(let column=0;column<2;column++){
    const rect={x:column*base.width/2,y:row*base.height/2,width:base.width/2,height:base.height/2};
    const bounds=motion.frameBounds(base.data,base.width,rect);
    assert.ok(bounds && bounds.height>rect.height*.45,'fallback pose '+row+','+column+' is missing');
  }
  const positions={'0 0':[0,0],'100% 0':[1,0],'0 100%':[0,1],'100% 100%':[1,1]};
  assert.ok(positions[outfit.blinkPosition],'blink cell must be explicitly assigned');
  const [column,row]=positions[outfit.blinkPosition];
  assert.ok(motion.frameBounds(blink.data,blink.width,{x:column*blink.width/2,y:row*blink.height/2,width:blink.width/2,height:blink.height/2}));
  const rows=motion.atlasRows(atlas.data,atlas.width,atlas.height);
  for(let row=0;row<4;row++)for(let column=0;column<8;column++){
    const x=Math.round(atlas.width*column/8),end=Math.round(atlas.width*(column+1)/8);
    const rect={x,y:rows[row],width:end-x,height:rows[row+1]-rows[row]};
    const bounds=motion.frameBounds(atlas.data,atlas.width,rect);
    assert.ok(bounds && bounds.height>=rect.height*.45,'motion frame '+row+','+column+' cannot render');
  }
});
