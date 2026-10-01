const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const motion=require('../source/projects/blog-pet/motion.js');
const rendererPath=require.resolve('../source/projects/blog-pet/renderer.js');

function environment({missingMotion=false,missingLegacy=false,empty=false,decodeFails=false,deferMotion=false}={}){
  let now=0,id=0;const frames=new Map(),timers=new Map(),draws=[],pendingImages=[];
  function canvas(){
    let source;
    const context={setTransform(){},clearRect(){},drawImage(...args){source=args[0];draws.push(args);},getImageData(){
      const width=source.naturalWidth,height=source.naturalHeight,data=new Uint8ClampedArray(width*height*4);
      if(!empty)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const columns=source.src.includes('motion')?8:2,cell=width/columns;
        if(x%cell>3 && x%cell<cell-3 && y%20>1 && y%20<19)data[(y*width+x)*4+3]=255;
      }
      return {data};
    }};
    return {width:208,height:208,dataset:{},getContext:()=>context};
  }
  class Image{
    set src(url){
      this.url=url;this.naturalWidth=url.includes('motion')?160:80;this.naturalHeight=80;
      const deliver=()=>{if((missingMotion && url.includes('motion')) || (missingLegacy && url.includes('legacy')))this.onerror();else this.onload();};
      queueMicrotask(()=>{if(deferMotion && url.includes('motion'))pendingImages.push(deliver);else deliver();});
    }
    get src(){return this.url;}
    decode(){return decodeFails?Promise.reject(Error('decode')):Promise.resolve();}
  }
  const window={BlogPetMotion:motion};
  vm.runInNewContext(fs.readFileSync(rendererPath,'utf8'),{
    window,document:{createElement:canvas},Image,URL,performance:{now:()=>now},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key)
  },{filename:rendererPath});
  const reducedMotion={matches:false,addEventListener(name,fn){this.changed=fn;}};
  const body={dataset:{}},element={style:{}},screen=canvas(),completed=[];
  const player=window.BlogPetRenderer.create({canvas:screen,element,body,reducedMotion,onComplete:name=>completed.push(name)});
  function advance(time){
    now=time;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);
    for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}
  }
  return {api:window.BlogPetRenderer,player,body,element,screen,reducedMotion,frames,timers,completed,advance,draws,releaseImages:()=>pendingImages.splice(0).forEach(deliver=>deliver()),
    assets:()=>({frames:Array.from({length:32},canvas),sleep:canvas()})};
}
test('renderer owns one animation clock, pauses without work and resumes the same action',()=>{
  const env=environment();env.player.setAssets(env.assets());
  assert.equal(env.body.dataset.renderer,'canvas');assert.equal(env.frames.size,0);
  env.player.pause(false);assert.equal(env.frames.size,1);
  env.player.play('pet');env.player.play('pet');env.player.lookAt(2);assert.equal(env.frames.size,1);
  env.advance(500);assert.equal(env.player.inspect().name,'pet');
  const progress=env.player.inspect().progress,renders=env.screen.dataset.renders;
  env.player.pause(true);env.advance(50000);
  assert.equal(env.screen.dataset.renders,renders);assert.equal(env.player.inspect().progress,progress);
  assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);
  env.player.pause(false);env.advance(51400);
  assert.deepEqual(env.completed,['pet']);assert.equal(env.body.dataset.motionClip,'idle');assert.equal(env.frames.size,1);
  env.advance(51500);assert.deepEqual(env.completed,['pet']);
  env.player.destroy();assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);
});
test('outfit and sleep changes retain one clock and return to a standing idle',()=>{
  const env=environment();env.player.setAssets(env.assets());env.player.pause(false);env.advance(100);
  env.player.setAssets(env.assets());env.player.play('sleep');env.advance(300);
  assert.equal(env.body.dataset.motionClip,'sleep');assert.equal(env.frames.size,1);
  env.player.play('idle');env.advance(700);
  assert.equal(env.body.dataset.motionClip,'idle');assert.equal(env.frames.size,1);
  assert.match(env.element.style.transform,/scaleY/);assert.ok(env.draws.length>0);
  env.player.destroy();
});
test('reduced motion and CSS fallback use a completion timer without an idle animation loop',()=>{
  const env=environment();env.player.setAssets(env.assets());env.reducedMotion.matches=true;env.reducedMotion.changed();env.player.pause(false);
  assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);
  env.player.play('stretch');assert.equal(env.body.dataset.motionFrame,'4');assert.equal(env.element.style.transform,'none');
  assert.equal(env.timers.size,1);env.advance(2500);
  assert.deepEqual(env.completed,['stretch']);assert.equal(env.timers.size,0);
  env.player.setAssets(null);assert.equal(env.body.dataset.renderer,'css');assert.equal(env.element.style.transform,'');
  env.player.play('snack');assert.equal(env.timers.size,1);env.advance(5200);
  assert.deepEqual(env.completed,['stretch','snack']);assert.equal(env.frames.size,0);assert.equal(env.timers.size,0);
  env.reducedMotion.matches=false;env.reducedMotion.changed();env.player.destroy();
});
test('loading extracts all poses and reuses the identical standing cel at every gesture end',async()=>{
  const env=environment();
  const assets=await env.api.loadOutfit({sprite:'legacy.png',motion:'motion.png'},'https://example.test/');
  assert.equal(assets.frames.length,32);assert.equal(assets.bounds.length,32);assert.equal(assets.rows.length,5);
  for(let row=1;row<4;row++){
    assert.equal(assets.frames[row*8],assets.frames[0]);assert.equal(assets.frames[row*8+7],assets.frames[0]);
  }
  assert.ok(assets.sleep);assert.equal(env.timers.size,0);
  env.player.destroy();
});
test('missing or malformed motion sheets fall back; missing base images reject cleanly',async()=>{
  const outfit={sprite:'legacy.png',motion:'motion.png'},base='https://example.test/';
  for(const options of [{missingMotion:true},{empty:true}]){
    const env=environment(options);assert.equal(await env.api.loadOutfit(outfit,base),null);assert.equal(env.timers.size,0);env.player.destroy();
  }
  for(const options of [{missingLegacy:true},{decodeFails:true}]){
    const env=environment(options);await assert.rejects(env.api.loadOutfit(outfit,base),/图片/);env.player.destroy();
  }
});
test('the small standing image becomes ready before a slow animation atlas completes',async()=>{
  const env=environment({deferMotion:true});let ready=0,finished=false;
  const loading=env.api.loadOutfit({sprite:'legacy.webp',motion:'motion.webp'},'https://example.test/',()=>{ready++;}).then(assets=>{finished=true;return assets;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ready,1);assert.equal(finished,false);
  env.releaseImages();const assets=await loading;
  assert.equal(assets.frames.length,32);assert.equal(ready,1);assert.equal(finished,true);env.player.destroy();
});
