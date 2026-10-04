(function(){
  'use strict';
  const cast=document.getElementById('cast'),status=document.getElementById('status'),pause=document.getElementById('pause');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)'),players=[];
  const names={idle:'正在陪你',pet:'嘿嘿，被摸摸头啦',snack:'啊呜，黄油饼干',stretch:'伸个懒腰，放松一下',sleep:'嘘，睡一小会儿'};
  const buttons=[...document.querySelectorAll('[data-clip]')];buttons.forEach(button=>{button.disabled=true;});
  let ready=0;
  const pending=[];
  for(const outfit of window.BlogPet.outfits){
    const card=document.createElement('article');card.className='card';card.dataset.outfit=outfit.id;
    const element=document.createElement('div');element.className='motion';
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
    const title=document.createElement('h2');title.textContent=outfit.name;
    element.appendChild(canvas);card.append(element,title);cast.appendChild(card);
    const player=window.BlogPetRenderer.create({canvas,element,body:card,reducedMotion,onComplete:()=>{status.textContent=names.idle;}});players.push(player);
    pending.push({outfit,player,title});
  }
  async function loadNext(){
    while(pending.length){
      const {outfit,player,title}=pending.shift();
      try{
        const assets=await window.BlogPetRenderer.loadOutfit(outfit,new URL('.',document.baseURI).href);
        if(!assets)throw Error('动作图片未加载');
        player.setAssets(assets);player.pause(pause.checked || document.hidden);
        ready++;buttons.forEach(button=>{button.disabled=false;});
        status.textContent=ready+' / '+players.length+' 套衣服已准备好';
      }catch(e){title.textContent=outfit.name+' · 稍后再试';}
    }
  }
  Promise.all(Array.from({length:Math.min(2,pending.length)},loadNext)).then(()=>{
    status.textContent=ready===players.length?names.idle:ready+' / '+players.length+' 套衣服已准备好，刷新可重试其余衣服。';
  });
  for(const button of buttons)button.addEventListener('click',()=>{
    for(const player of players)player.play(button.dataset.clip,true);
    status.textContent=names[button.dataset.clip];
  });
  const syncPause=()=>players.forEach(player=>player.pause(pause.checked || document.hidden));
  pause.addEventListener('change',syncPause);document.addEventListener('visibilitychange',syncPause);
})();
