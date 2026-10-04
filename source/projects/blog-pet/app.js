(function(){
  'use strict';
  async function mount(root,{assetBase,controls,host}){
    const core=window.BlogPet;
    const $=id=>root.getElementById(id) || controls.getElementById(id);
    const home=$('pet-home'),body=$('pet-body'),dock=$('pet-dock'),bubble=$('bubble');
    const mobile=window.matchMedia('(max-width:600px)');
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const ui={hovered:false,focused:false,pinned:false,compact:mobile.matches,speaking:false};
    const spriteURL=outfit=>new URL(outfit.sprite,assetBase).href;
    const blinkURL=outfit=>new URL(outfit.blink || 'assets/youyou-blink-v1.webp',assetBase).href;
    const loadedOutfits=new Map();
    const loadedBlinks=new Set();
    let storage;
    try{storage=window.localStorage;}catch(e){/* Browsers can deny storage access. */}
    let state=core.load(storage);
    let drag=null,dragFrame=null,dragPoint=null,draggedTarget=null;
    let keyboard=false,changingOutfit=false;
    let speechTimer,leaveTimer,compactTimer,blinkTimer,outfitTimer,changeTimer;
    let feeding=false,petUntil=0,lastHeart=0,lookFrame=null;
    let anchor={x:0,y:0,width:112,height:112},lookX=0;
    home.hidden=true;
    const animator=window.BlogPetRenderer.create({canvas:$('motion-canvas'),element:root.querySelector('.character-motion'),body,reducedMotion,onComplete:()=>{
      feeding=false;render(undefined,false);
    }});

    function geometry(){
      return {viewport:{width:window.innerWidth,height:window.innerHeight},size:{width:home.offsetWidth,height:home.offsetHeight}};
    }

    function panelSize(element){return {width:element.offsetWidth,height:element.offsetHeight};}
    function positionPanel(element,point){element.style.left=point.x+'px';element.style.top=point.y+'px';}

    function placeOverlays(){
      const {viewport}=geometry();
      if(!$('profile').hidden){
        positionPanel($('profile'),core.panelPoint(anchor,panelSize($('profile')),viewport));
        return;
      }
      const showDock=dock.dataset.open==='true',showSpeech=bubble.dataset.open==='true';
      if(!showDock && !showSpeech)return;
      const ds=showDock?panelSize(dock):{width:0,height:0};
      const bs=showSpeech?panelSize(bubble):{width:0,height:0};
      const stack={width:Math.max(ds.width,bs.width),height:ds.height+bs.height+(showDock && showSpeech?8:0)};
      const point=core.panelPoint(anchor,stack,viewport);
      const below=point.y>=anchor.y+anchor.height;
      const speechY=below?point.y+(showDock?ds.height+8:0):point.y;
      const dockY=below?point.y:point.y+(showSpeech?bs.height+8:0);
      if(showDock)positionPanel(dock,core.clampPoint({x:point.x+(stack.width-ds.width)/2,y:dockY},viewport,ds));
      if(showSpeech){
        positionPanel(bubble,core.clampPoint({x:point.x+(stack.width-bs.width)/2,y:speechY},viewport,bs));
        bubble.dataset.side=below?'below':'above';
      }
    }

    function syncUI(){
      home.dataset.compact=String(ui.compact && !state.minimized);
      home.dataset.minimized=String(state.minimized);
      body.hidden=state.minimized || ui.compact;
      animator.pause(document.hidden || home.hidden || body.hidden || Boolean(drag && drag.moved));
      $('compact').hidden=state.minimized || !ui.compact;
      $('restore').hidden=!state.minimized;
      const open=core.dockVisible({...ui,dragging:Boolean(drag && drag.moved),profileOpen:!$('profile').hidden,minimized:state.minimized,documentHidden:document.hidden});
      dock.dataset.open=String(open);dock.inert=!open;dock.setAttribute('aria-hidden',String(!open));
      $('character').setAttribute('aria-expanded',String(open));
      bubble.dataset.open=String(ui.speaking && !document.hidden && !state.minimized && !ui.compact && $('profile').hidden && !(drag && drag.moved));
      placeOverlays();
    }

    function place(point){
      home.style.left=point.x+'px';home.style.top=point.y+'px';
      const {size}=geometry();anchor={...point,...size};
      placeOverlays();
    }

    function restorePosition(){
      if(drag)return;
      const {viewport,size}=geometry();
      place(core.positionToPoint(state.position,viewport,size));
    }

    function remember(){
      $('memory-note').textContent=core.save(storage,state)?'她会在这个浏览器里记住你。':'这次先陪着你，浏览器暂时无法保存记忆。';
    }

    function hideSpeech(){clearTimeout(speechTimer);ui.speaking=false;syncUI();}

    function speak(message){
      clearTimeout(speechTimer);
      bubble.textContent=message;$('announcer').textContent=message;
      ui.speaking=true;syncUI();
      speechTimer=setTimeout(hideSpeech,core.speechDuration(message));
    }

    function scheduleCompact(){
      clearTimeout(compactTimer);
      if(!mobile.matches || ui.compact)return;
      compactTimer=setTimeout(()=>{
        if(drag || !$('profile').hidden || ui.focused){scheduleCompact();return;}
        ui.compact=true;ui.pinned=false;ui.hovered=false;hideSpeech();syncUI();restorePosition();
      },10000);
    }

    function expand(){
      ui.compact=false;ui.pinned=true;syncUI();restorePosition();scheduleCompact();
    }

    function resetPosition(){
      state=core.normalize({...state,position:null});restorePosition();remember();
    }

    function flushDrag(){
      dragFrame=null;
      if(!drag || !dragPoint)return;
      const point=dragPoint;dragPoint=null;place(point);
    }

    function setupDragging(){
      home.addEventListener('pointerdown',event=>{
        const target=event.target.closest('#character,#drag-handle,#compact,#restore');
        if(event.button!==0 || event.isPrimary===false || !target || drag)return;
        draggedTarget=null;clearTimeout(compactTimer);
        const {viewport,size}=geometry();
        drag={id:event.pointerId,target,startX:event.clientX,startY:event.clientY,x:anchor.x,y:anchor.y,viewport,size,moved:false};
        target.setPointerCapture(event.pointerId);
      });
      home.addEventListener('pointermove',event=>{
        if(!drag || event.pointerId!==drag.id)return;
        const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
        if(!drag.moved && Math.hypot(dx,dy)<6)return;
        if(!drag.moved){
          drag.moved=true;home.classList.add('is-dragging');
          body.dataset.blinking='false';body.dataset.cuddling='false';syncUI();
        }
        dragPoint=core.clampPoint({x:drag.x+dx,y:drag.y+dy},drag.viewport,drag.size);
        if(dragFrame===null)dragFrame=requestAnimationFrame(flushDrag);
      });
      function finish(event,cancelled){
        if(!drag || event.pointerId!==drag.id)return;
        if(dragFrame!==null)cancelAnimationFrame(dragFrame);
        flushDrag();
        const previous=drag;drag=null;home.classList.remove('is-dragging');
        if(previous.target.hasPointerCapture(event.pointerId))previous.target.releasePointerCapture(event.pointerId);
        if(previous.moved && !cancelled){
          state=core.normalize({...state,position:core.pointToPosition(anchor,previous.viewport,previous.size)});
          draggedTarget=previous.target;remember();
        }else if(cancelled)restorePosition();
        syncUI();scheduleCompact();
      }
      home.addEventListener('pointerup',event=>finish(event,false));
      home.addEventListener('pointercancel',event=>finish(event,true));
      home.addEventListener('lostpointercapture',event=>finish(event,true));
      home.addEventListener('click',event=>{
        if(event.detail>0 && draggedTarget && event.target.closest('#character,#drag-handle,#compact,#restore')===draggedTarget){
          draggedTarget=null;event.preventDefault();event.stopImmediatePropagation();
        }
      },true);
      $('drag-handle').addEventListener('keydown',event=>{
        if(event.key==='Home'){event.preventDefault();resetPosition();return;}
        const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
        const step=steps[event.key];if(!step)return;
        event.preventDefault();
        const {viewport,size}=geometry();
        const distance=event.shiftKey?30:10;
        const point=core.clampPoint({x:anchor.x+step[0]*distance,y:anchor.y+step[1]*distance},viewport,size);
        state=core.normalize({...state,position:core.pointToPosition(point,viewport,size)});
        place(point);remember();
      });
      $('reset-position').addEventListener('click',resetPosition);
      new ResizeObserver(restorePosition).observe(home);
      window.addEventListener('resize',()=>{
        if(drag)finish({pointerId:drag.id},true);
        restorePosition();
      });
    }

    function scheduleBlink(){
      clearTimeout(blinkTimer);
      if(document.hidden || reducedMotion.matches || body.dataset.renderer==='canvas')return;
      blinkTimer=setTimeout(()=>{
        const outfit=core.outfits.find(item=>item.id===state.outfit);
        if(loadedBlinks.has(blinkURL(outfit)) && !drag && !state.minimized && !ui.compact && !changingOutfit && body.dataset.mood==='idle'){
          body.dataset.blinking='true';
          setTimeout(()=>{body.dataset.blinking='false';},170);
        }
        scheduleBlink();
      },3500+Math.random()*3500);
    }

    function setupBlinking(){
      for(const url of new Set(core.outfits.map(blinkURL))){
        const image=new Image();
        image.onload=()=>{loadedBlinks.add(url);};image.src=url;
      }
      reducedMotion.addEventListener('change',()=>{
        body.dataset.blinking='false';body.dataset.cuddling='false';
        home.style.setProperty('--look-tilt','0deg');animator.lookAt(0);scheduleBlink();
      });
      scheduleBlink();
    }

    function renderOutfit(){
      const outfit=core.outfits.find(item=>item.id===state.outfit);
      body.dataset.blinking='false';body.dataset.cuddling='false';
      home.style.setProperty('--outfit-sprite','url("'+spriteURL(outfit)+'")');
      body.style.setProperty('--blink-sprite','url("'+blinkURL(outfit)+'")');
      body.style.setProperty('--blink-position',outfit.blinkPosition);
      $('outfit-name').textContent=outfit.name;$('auto-outfit').checked=state.autoOutfit;
      for(const button of $('outfit-options').children)button.setAttribute('aria-pressed',String(button.dataset.outfit===state.outfit));
    }

    function loadOutfit(outfit,onLegacy){
      if(loadedOutfits.has(outfit.id))return loadedOutfits.get(outfit.id);
      const promise=window.BlogPetRenderer.loadOutfit(outfit,assetBase,onLegacy);
      loadedOutfits.set(outfit.id,promise);
      promise.catch(()=>{if(loadedOutfits.get(outfit.id)===promise)loadedOutfits.delete(outfit.id);});
      return promise;
    }

    async function changeOutfit(id,manual=false){
      const outfit=core.outfits.find(item=>item.id===id);
      if(changingOutfit || !outfit || state.outfit===id)return;
      changingOutfit=true;$('next-outfit').setAttribute('aria-disabled','true');
      $('outfit-options').setAttribute('aria-busy','true');
      for(const button of $('outfit-options').children)button.setAttribute('aria-disabled','true');
      try{
        const assets=await loadOutfit(outfit);
        body.dataset.blinking='false';body.dataset.cuddling='false';
        const previous=window.getComputedStyle($('character-sprite'));
        $('outfit-ghost').style.backgroundImage=previous.backgroundImage;
        $('outfit-ghost').style.backgroundPosition=previous.backgroundPosition;
        state=core.normalize({...state,outfit:id});renderOutfit();remember();
        animator.setAssets(assets);scheduleBlink();
        if(!reducedMotion.matches && !document.hidden){
          clearTimeout(changeTimer);body.dataset.changing='true';
          changeTimer=setTimeout(()=>{body.dataset.changing='false';},380);
        }
        if(manual && !state.sleeping)speak('今天穿'+outfit.name+'，陪你一起。');
      }catch(e){
        loadedOutfits.delete(id);if(manual)speak('衣服还没送到，等一会儿再试试。');
      }finally{
        changingOutfit=false;$('next-outfit').setAttribute('aria-disabled','false');
        $('outfit-options').setAttribute('aria-busy','false');
        for(const button of $('outfit-options').children)button.setAttribute('aria-disabled','false');
        scheduleCompact();
      }
    }

    function scheduleOutfit(){
      clearTimeout(outfitTimer);
      if(document.hidden)return;
      outfitTimer=setTimeout(()=>{
        if(state.autoOutfit && !state.sleeping && !drag && !ui.compact && !state.minimized && !ui.hovered && !ui.focused && !ui.pinned && $('profile').hidden && body.dataset.mood==='idle')changeOutfit(core.nextOutfit(state).outfit);
        scheduleOutfit();
      },30000);
    }

    function setupWardrobe(){
      for(const outfit of core.outfits){
        const button=document.createElement('button');
        button.type='button';button.className='outfit-option';button.dataset.outfit=outfit.id;
        button.setAttribute('aria-label','换上'+outfit.name);
        const preview=document.createElement('span');
        preview.className='outfit-preview';preview.setAttribute('aria-hidden','true');
        preview.style.backgroundImage='url("'+spriteURL(outfit)+'")';
        button.append(preview,document.createTextNode(outfit.name));
        button.addEventListener('click',()=>changeOutfit(outfit.id,true));
        $('outfit-options').appendChild(button);
      }
      $('next-outfit').addEventListener('click',()=>changeOutfit(core.nextOutfit(state).outfit,true));
      $('auto-outfit').addEventListener('change',()=>{
        state=core.normalize({...state,autoOutfit:$('auto-outfit').checked});remember();
      });
      renderOutfit();
    }

    function render(mood=state.sleeping?'sleeping':'idle',updateMotion=true){
      body.dataset.blinking='false';body.dataset.cuddling='false';body.dataset.mood=mood;
      $('pet-status').textContent=state.sleeping?'午睡中':mood==='eating'?'点心时间':mood==='happy'?'很开心':mood==='stretching'?'伸个懒腰':'正在陪你';
      $('sleep-label').textContent=state.sleeping?'叫醒':'睡觉';
      $('sleep').setAttribute('aria-pressed',String(state.sleeping));
      $('character').setAttribute('aria-label',state.sleeping?'柚柚正在睡觉，打开操作可以叫醒她':'柚柚：点击摸摸，拖动移动，按 Enter 打开操作');
      $('fullness').value=state.fullness;$('affection').value=state.affection;
      $('fullness-label').textContent=Math.round(state.fullness)+' / 100';$('affection-label').textContent=Math.round(state.affection)+' / 100';
      $('feed').setAttribute('aria-disabled',String(feeding));
      if(updateMotion)animator.play({idle:'idle',happy:'pet',eating:'snack',stretching:'stretch',sleeping:'sleep'}[mood]);
    }

    function hearts(){
      if(reducedMotion.matches || Date.now()-lastHeart<800)return;
      lastHeart=Date.now();
      for(let i=0;i<3;i++){
        const heart=document.createElement('span');heart.className='heart';heart.textContent='♡';
        heart.style.left=(35+i*15)+'%';heart.style.setProperty('--drift',(i-1)*20+'px');heart.style.animationDelay=i*.09+'s';
        $('particles').appendChild(heart);setTimeout(()=>heart.remove(),1800);
      }
    }

    function act(action){
      if(action!=='sleep' && feeding)return;
      if(action==='pet' && Date.now()<petUntil)return;
      if(action==='pet')petUntil=Date.now()+450;
      const result=core.interact(state,action);state=result.state;
      feeding=result.mood==='eating';
      render(result.mood);remember();speak(result.message);scheduleCompact();
      if(result.mood==='happy' && !state.sleeping){
        hearts();
      }
    }

    function profile(open,returnFocus=false){
      $('profile').hidden=!open;
      for(const id of ['profile-toggle','widget-profile-toggle'])if($(id))$(id).setAttribute('aria-expanded',String(open));
      if(open){
        state=core.normalize(state);
        $('fullness').value=state.fullness;$('fullness-label').textContent=Math.round(state.fullness)+' / 100';
        syncUI();$('profile-close').focus({preventScroll:true});
      }else{
        syncUI();scheduleCompact();
        if(returnFocus){ui.pinned=true;syncUI();$('widget-profile-toggle').focus({preventScroll:true});}
      }
    }

    function minimize(value){
      profile(false);ui.pinned=false;ui.focused=false;ui.hovered=false;
      state=core.normalize({...state,minimized:value});hideSpeech();syncUI();restorePosition();remember();
    }

    function setupPresence(){
      home.addEventListener('pointerenter',event=>{
        if(event.pointerType!=='mouse')return;
        clearTimeout(leaveTimer);ui.hovered=true;syncUI();
      });
      home.addEventListener('pointerleave',event=>{
        if(event.pointerType!=='mouse')return;
        clearTimeout(leaveTimer);
        leaveTimer=setTimeout(()=>{ui.hovered=false;syncUI();},320);
      });
      home.addEventListener('focusin',()=>{if(keyboard){ui.focused=true;syncUI();}});
      home.addEventListener('focusout',event=>{
        const outside=event.relatedTarget && !home.contains(event.relatedTarget);
        setTimeout(()=>{
          if(root.activeElement)return;
          ui.focused=false;
          if(outside){ui.pinned=false;if(!$('profile').hidden)profile(false);}
          syncUI();
        },0);
      });
      document.addEventListener('pointerdown',event=>{
        keyboard=false;ui.focused=false;
        if(event.composedPath().includes(host))return;
        ui.hovered=false;ui.pinned=false;profile(false);hideSpeech();
        if(mobile.matches){ui.compact=true;syncUI();restorePosition();}
      });
      document.addEventListener('keydown',event=>{
        if(event.key==='Tab')keyboard=true;
        if(event.key!=='Escape')return;
        if(!$('profile').hidden){event.preventDefault();profile(false,true);return;}
        if(root.activeElement || ui.pinned){
          ui.pinned=false;ui.focused=false;ui.hovered=false;hideSpeech();
          if(mobile.matches){ui.compact=true;syncUI();restorePosition();$('compact').focus({preventScroll:true});}
          else{if(root.activeElement)root.activeElement.blur();syncUI();}
        }
      });
      mobile.addEventListener('change',()=>{
        ui.compact=mobile.matches;ui.pinned=false;ui.hovered=false;profile(false);hideSpeech();syncUI();restorePosition();
      });
      document.addEventListener('pointermove',event=>{
        if(event.pointerType!=='mouse' || reducedMotion.matches || state.sleeping || drag || body.hidden || document.hidden)return;
        lookX=event.clientX;
        if(lookFrame!==null)return;
        lookFrame=requestAnimationFrame(()=>{
          lookFrame=null;
          if(reducedMotion.matches || state.sleeping || drag || body.hidden || document.hidden)return;
          const distance=lookX-anchor.x-anchor.width/2;
          const tilt=Math.abs(distance)>260?0:Math.max(-2.5,Math.min(2.5,distance/100));
          home.style.setProperty('--look-tilt',tilt+'deg');animator.lookAt(tilt);
        });
      });
      document.addEventListener('visibilitychange',()=>{
        home.dataset.paused=String(document.hidden);hideSpeech();
        if(document.hidden){
          ui.hovered=false;ui.pinned=false;clearTimeout(compactTimer);remember();
        }else{state=core.normalize(state);render(body.dataset.mood,false);scheduleCompact();}
        scheduleBlink();scheduleOutfit();syncUI();
      });
    }

    $('character').addEventListener('click',event=>{
      if(event.detail===0 || !ui.hovered){ui.pinned=true;syncUI();scheduleCompact();return;}
      act('pet');
    });
    $('pet').addEventListener('click',()=>act('pet'));
    $('feed').addEventListener('click',()=>act('feed'));
    $('sleep').addEventListener('click',()=>act('sleep'));
    $('stretch').addEventListener('click',()=>{profile(false,true);act('stretch');});
    $('compact').addEventListener('click',expand);
    $('restore').addEventListener('click',()=>{minimize(false);expand();});
    if($('meet'))$('meet').addEventListener('click',()=>{
      minimize(false);expand();if(state.sleeping)act('sleep');else act('pet');$('character').focus({preventScroll:true});
    });
    if($('profile-toggle'))$('profile-toggle').addEventListener('click',()=>{minimize(false);expand();profile(true);});
    $('widget-profile-toggle').addEventListener('click',()=>profile($('profile').hidden));
    $('profile-close').addEventListener('click',()=>profile(false,true));
    $('minimize').addEventListener('click',()=>{minimize(true);$('restore').focus({preventScroll:true});});
    if($('theme'))$('theme').addEventListener('click',()=>{
      const night=document.body.classList.toggle('night');$('theme').textContent=night?'☀':'☾';
      $('theme').setAttribute('aria-pressed',String(night));$('theme').setAttribute('aria-label',night?'切换到白天':'切换到夜晚');
    });

    setupWardrobe();render();syncUI();
    setupDragging();setupPresence();setupBlinking();scheduleOutfit();remember();
    function showCharacter(){
      home.hidden=false;home.dataset.paused=String(document.hidden);syncUI();restorePosition();
    }
    const initialOutfit=state.outfit;
    try{
      const assets=await loadOutfit(core.outfits.find(item=>item.id===initialOutfit),showCharacter);
      if(state.outfit===initialOutfit)animator.setAssets(assets);
    }catch(e){
      console.warn('柚柚的角色素材暂时没加载好：'+e.message);
      if(state.outfit==='sage'){animator.destroy();host.remove();return;}
      try{animator.setAssets(await loadOutfit(core.outfits[0],showCharacter));state=core.normalize({...state,outfit:'sage'});renderOutfit();remember();}
      catch(error){animator.destroy();host.remove();return;}
    }
    showCharacter();
    try{
      const key='rabbit-blog-pet-greeted-v1';
      if(!window.sessionStorage.getItem(key)){
        window.sessionStorage.setItem(key,'1');
        if(!state.minimized && !ui.compact)speak(state.sleeping?'唔……我再睡一会儿。':state.feeds>0?'你回来啦，还记得你给的饼干。':'嗨，我是柚柚。点一下我，陪你读一会儿。');
      }
    }catch(e){/* Greeting is optional when session storage is unavailable. */}
  }
  window.BlogCompanion={mount};
})();
