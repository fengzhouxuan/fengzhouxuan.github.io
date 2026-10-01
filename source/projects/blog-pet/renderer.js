/* Small canvas renderer: aligned cels, softened inbetweens and one owned clock. */
(function(){
  'use strict';
  const size=104,resolution=208;
  function surface(width=resolution,height=resolution){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
  }
  function image(url){
    return new Promise((resolve,reject)=>{
      const asset=new Image();
      const timer=setTimeout(()=>finish(false),8000);
      function finish(success){
        clearTimeout(timer);asset.onload=null;asset.onerror=null;
        if(success)resolve(asset);else reject(Error('角色图片暂时没加载出来'));
      }
      asset.onload=()=>asset.decode?asset.decode().then(()=>finish(true),()=>finish(false)):finish(true);
      asset.onerror=()=>finish(false);asset.src=url;
    });
  }
  function pixels(asset){
    const canvas=surface(asset.naturalWidth,asset.naturalHeight);
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(asset,0,0);
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;
    canvas.width=canvas.height=1;return data;
  }
  function cel(asset,bounds,height=98){
    const canvas=surface(),context=canvas.getContext('2d');
    const scale=height/bounds.height,width=bounds.width*scale;
    context.drawImage(asset,bounds.x,bounds.y,bounds.width,bounds.height,(size-width)*.5*2,(100-height)*2,width*2,height*2);
    return canvas;
  }
  function prepare(motion,legacy){
    const model=window.BlogPetMotion;
    const data=pixels(motion),width=motion.naturalWidth,height=motion.naturalHeight;
    const rows=model.atlasRows(data,width,height);
    const frames=[],bounds=[];
    for(let row=0;row<4;row++)for(let column=0;column<8;column++){
      const x=Math.round(width*column/8),end=Math.round(width*(column+1)/8);
      const box=model.frameBounds(data,width,{x,y:rows[row],width:end-x,height:rows[row+1]-rows[row]});
      if(!box || box.height<(rows[row+1]-rows[row])*.45)throw Error('动作帧不完整');
      frames.push(cel(motion,box));bounds.push(box);
    }
    // Reuse one exact standing drawing at both ends of every gesture.
    for(let row=1;row<4;row++){frames[row*8]=frames[0];frames[row*8+7]=frames[0];}
    const old=pixels(legacy),lw=legacy.naturalWidth,lh=legacy.naturalHeight;
    const standing=model.frameBounds(old,lw,{x:0,y:0,width:Math.floor(lw/2),height:Math.floor(lh/2)});
    const asleep=model.frameBounds(old,lw,{x:Math.floor(lw/2),y:Math.floor(lh/2),width:Math.ceil(lw/2),height:Math.ceil(lh/2)});
    if(!standing || !asleep)throw Error('角色姿势不完整');
    return {frames,sleep:cel(legacy,asleep,Math.min(98,asleep.height*98/standing.height)),rows,bounds};
  }
  async function loadOutfit(outfit,assetBase){
    const [legacy,motion]=await Promise.all([
      image(new URL(outfit.sprite,assetBase).href),
      image(new URL(outfit.motion,assetBase).href).catch(()=>null)
    ]);
    if(!motion)return null;
    try{return prepare(motion,legacy);}catch(e){return null;}
  }

  function create({canvas,element,body,reducedMotion,onComplete=()=>{}}){
    const model=window.BlogPetMotion,timeline=model.createTimeline(performance.now());
    canvas.width=canvas.height=resolution;
    const context=canvas.getContext('2d'),buffer=surface(),bufferContext=buffer.getContext('2d');
    let assets=null,paused=true,frame=null,timer=null,ghost=null,ghostAt=0;
    let lastDraw=0,lastTime=performance.now(),look=0,lookTarget=0,renderCount=0;
    context.setTransform(2,0,0,2,0,0);bufferContext.setTransform(2,0,0,2,0,0);
    timeline.pause(lastTime);

    function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;clearTimeout(timer);}
    function capture(now){
      if(!assets || paused || reducedMotion.matches)return;
      ghost=surface();ghost.getContext('2d').drawImage(canvas,0,0);ghostAt=now;
    }
    function drawCel(target,bitmap,alpha,phase,still){
      target.globalAlpha=alpha;
      if(still){target.drawImage(bitmap,0,0,resolution,resolution,0,0,size,size);return;}
      for(let y=0;y<size;y+=2){
        const part=y/size;
        const hair=part>.1 && part<.53?Math.sin((part-.1)/.43*Math.PI)*.22:0;
        const cloth=part>.63 && part<.9?Math.sin((part-.63)/.27*Math.PI)*.32:0;
        const shift=(hair+cloth)*Math.sin(phase*2*Math.PI+part*3);
        target.drawImage(bitmap,0,y*2,resolution,4,shift,y,size,2);
      }
    }
    function render(now){
      const value=timeline.read(now);
      if(value.completed)onComplete(value.completed);
      if(!assets)return value;
      const still=reducedMotion.matches || paused;
      const row=value.row;
      const chosen=still?(model.clips[value.name].loop?0:4):value.frame;
      const a=row<0?assets.sleep:assets.frames[row*8+chosen];
      const b=row<0?assets.sleep:assets.frames[row*8+value.next];
      const mix=still?0:value.mix;
      bufferContext.clearRect(0,0,size,size);bufferContext.globalCompositeOperation='source-over';
      drawCel(bufferContext,a,1-mix,value.progress,still);
      if(mix>0){bufferContext.globalCompositeOperation='lighter';drawCel(bufferContext,b,mix,value.progress,still);}
      bufferContext.globalCompositeOperation='source-over';bufferContext.globalAlpha=1;
      context.clearRect(0,0,size,size);context.globalCompositeOperation='source-over';
      const fade=ghost && !still?Math.min(1,(now-ghostAt)/360):1;
      if(fade<1){context.globalAlpha=1-fade;context.drawImage(ghost,0,0,resolution,resolution,0,0,size,size);context.globalCompositeOperation='lighter';}
      else ghost=null;
      context.globalAlpha=fade;context.drawImage(buffer,0,0,resolution,resolution,0,0,size,size);
      context.globalAlpha=1;context.globalCompositeOperation='source-over';
      const delta=Math.max(0,Math.min(64,now-lastTime));lastTime=now;
      look+=(lookTarget-look)*(1-Math.exp(-delta/120));
      const envelope=model.clips[value.name].loop?0:Math.sin(value.progress*Math.PI);
      const turn=value.name==='pet'?-1.5*envelope:value.name==='stretch'?.8*envelope:0;
      const breath=value.name==='sleep'?Math.sin(value.progress*Math.PI*2)*.004:Math.sin(value.progress*Math.PI*2)*.003;
      element.style.transform=still?'none':'rotate('+((value.name==='sleep'?0:look)+turn)+'deg) scaleY('+(1+breath)+')';
      body.dataset.motionClip=value.name;body.dataset.motionFrame=String(chosen);
      canvas.dataset.renders=String(++renderCount);return value;
    }
    function schedule(){
      stop();if(paused)return;
      if(reducedMotion.matches || !assets){
        const value=render(performance.now());
        if(Number.isFinite(value.remaining))timer=setTimeout(()=>{render(performance.now());schedule();},value.remaining+1);
        return;
      }
      function tick(now){
        frame=null;if(paused)return;
        if(now-lastDraw>=15){lastDraw=now;render(now);}
        frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);
    }
    function setAssets(next){
      const now=performance.now();capture(now);assets=next;
      body.dataset.renderer=next?'canvas':'css';
      if(!next){ghost=null;element.style.transform='';}
      render(now);schedule();
    }
    function play(name,restart=false){
      const now=performance.now(),old=timeline.read(now).name;
      if((name==='sleep' || old==='sleep') && name!==old)capture(now);
      const remaining=timeline.play(name,now,restart);render(now);schedule();return remaining;
    }
    function pause(value){
      if(value===paused)return;
      const now=performance.now();paused=value;
      if(value){timeline.pause(now);stop();}else{timeline.resume(now);lastTime=now;schedule();}
    }
    reducedMotion.addEventListener('change',()=>{ghost=null;render(performance.now());schedule();});
    return {setAssets,play,pause,lookAt:value=>{lookTarget=value;},inspect:()=>timeline.read(performance.now()),destroy:()=>{paused=true;stop();ghost=null;assets=null;}};
  }
  window.BlogPetRenderer={loadOutfit,create};
})();
