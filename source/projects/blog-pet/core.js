/* Browser pet state, using the site's CommonJS/browser bridge. */
(function(root){
  'use strict';
  const storageKey='rabbit-blog-pet-v1';
  const hour=60*60*1000;
  const outfits=[
    {id:'sage',name:'森系日常',sprite:'./assets/youyou-girl-v1.webp',motion:'./assets/youyou-sage-motion-v2.webp',blinkPosition:'0 0'},
    {id:'lavender',name:'紫芋奶茶',sprite:'./assets/youyou-lavender-v1.webp',motion:'./assets/youyou-lavender-motion-v2.webp',blinkPosition:'100% 0'},
    {id:'sailor',name:'晴空水手',sprite:'./assets/youyou-sailor-v1.webp',motion:'./assets/youyou-sailor-motion-v2.webp',blinkPosition:'0 100%'},
    {id:'autumn',name:'焦糖秋日',sprite:'./assets/youyou-autumn-v1.webp',motion:'./assets/youyou-autumn-motion-v2.webp',blinkPosition:'100% 100%'},
    {id:'moon',name:'月白汉服',sprite:'./assets/youyou-moon-v1.webp',motion:'./assets/youyou-moon-motion-v2.webp',blink:'./assets/youyou-extra-blink-v1.webp',blinkPosition:'0 0'},
    {id:'peach',name:'桃花襦裙',sprite:'./assets/youyou-peach-v1.webp',motion:'./assets/youyou-peach-motion-v2.webp',blink:'./assets/youyou-extra-blink-v1.webp',blinkPosition:'100% 0'},
    {id:'cherry',name:'樱桃学院',sprite:'./assets/youyou-cherry-v1.webp',motion:'./assets/youyou-cherry-motion-v2.webp',blink:'./assets/youyou-extra-blink-v1.webp',blinkPosition:'0 100%'},
    {id:'cloud',name:'软绵睡衣',sprite:'./assets/youyou-cloud-v1.webp',motion:'./assets/youyou-cloud-motion-v2.webp',blink:'./assets/youyou-extra-blink-v1.webp',blinkPosition:'100% 100%'}
  ];

  function normalize(raw,now=Date.now()){
    const data=raw && raw.version===1?raw:{};
    const bounded=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
    const updatedAt=Number.isFinite(data.updatedAt)?Math.min(now,Math.max(0,data.updatedAt)):now;
    const elapsed=Math.min(24,Math.max(0,(now-updatedAt)/hour));
    return {version:1,fullness:Math.max(0,bounded(data.fullness,65)-elapsed*3),
      affection:bounded(data.affection,35),sleeping:data.sleeping===true,
      feeds:Number.isSafeInteger(data.feeds)&&data.feeds>=0?data.feeds:0,
      outfit:outfits.some(item=>item.id===data.outfit)?data.outfit:'sage',
      autoOutfit:data.autoOutfit!==false,
      position:data.position && Number.isFinite(data.position.x) && Number.isFinite(data.position.y)?
        {x:Math.max(0,Math.min(1,data.position.x)),y:Math.max(0,Math.min(1,data.position.y))}:null,
      minimized:data.minimized===true,
      updatedAt:now};
  }

  function clampPoint(point,viewport,size,margin=12){
    const axis=(value,extent,length)=>{
      const free=Math.max(0,extent-length);
      const inset=Math.min(Math.max(0,margin),free/2);
      return Math.max(inset,Math.min(free-inset,Number.isFinite(value)?value:free-inset));
    };
    return {x:axis(point.x,viewport.width,size.width),y:axis(point.y,viewport.height,size.height)};
  }

  function positionToPoint(position,viewport,size){
    const min=clampPoint({x:0,y:0},viewport,size);
    const max=clampPoint({x:Infinity,y:Infinity},viewport,size);
    return position?{x:min.x+position.x*(max.x-min.x),y:min.y+position.y*(max.y-min.y)}:max;
  }

  function pointToPosition(point,viewport,size){
    const value=clampPoint(point,viewport,size);
    const min=clampPoint({x:0,y:0},viewport,size);
    const max=clampPoint({x:Infinity,y:Infinity},viewport,size);
    return {x:max.x===min.x?1:(value.x-min.x)/(max.x-min.x),y:max.y===min.y?1:(value.y-min.y)/(max.y-min.y)};
  }

  function panelPoint(anchor,panel,viewport,gap=10){
    const above=anchor.y-panel.height-gap;
    const below=anchor.y+anchor.height+gap;
    const canPlaceBelow=below+panel.height<=viewport.height-12;
    const y=above>=12?above:canPlaceBelow?below:anchor.y+(anchor.height-panel.height)/2;
    const x=above>=12 || canPlaceBelow?anchor.x+(anchor.width-panel.width)/2:
      anchor.x>=panel.width+gap+12?anchor.x-panel.width-gap:anchor.x+anchor.width+gap;
    return clampPoint({x,y},viewport,panel);
  }

  function speechDuration(message){
    return Math.max(4000,Math.min(7000,2200+String(message).length*100));
  }

  function dockVisible({hovered,focused,pinned,dragging,profileOpen,minimized,compact,documentHidden}){
    return !documentHidden && !minimized && !compact && !dragging && !profileOpen &&
      Boolean(hovered || focused || pinned);
  }

  function nextOutfit(raw,now=Date.now()){
    const state=normalize(raw,now);
    const index=outfits.findIndex(item=>item.id===state.outfit);
    return {...state,outfit:outfits[(index+1)%outfits.length].id};
  }

  function interact(raw,action,now=Date.now()){
    const state=normalize(raw,now);
    if(action==='sleep'){
      state.sleeping=!state.sleeping;
      return {state,mood:state.sleeping?'sleeping':'idle',message:state.sleeping?'晚安，替我留一盏小灯。':'睡醒啦。你还在，真好。'};
    }
    if(!['pet','feed','stretch'].includes(action))throw Error('未知的桌宠互动');
    if(state.sleeping)return {state,mood:'sleeping',message:'唔……先让我睡一会儿。'};
    if(action==='stretch')return {state,mood:'stretching',message:'唔——伸个懒腰。你也放松一下吧。'};
    if(action==='feed'){
      if(state.fullness>=95)return {state,mood:'happy',message:'有点撑啦，陪我坐会儿吧。'};
      state.fullness=Math.min(100,state.fullness+22);
      state.affection=Math.min(100,state.affection+4);
      state.feeds++;
      return {state,mood:'eating',message:'啊呜，黄油饼干最好吃了。'};
    }
    state.affection=Math.min(100,state.affection+6);
    return {state,mood:'happy',message:state.affection>=65?'决定了，今天最喜欢你。':'嘿嘿，今天也被你照顾到啦。'};
  }

  function load(storage,now=Date.now()){
    try{return normalize(JSON.parse(storage.getItem(storageKey)),now);}
    catch(e){return normalize(null,now);}
  }

  function save(storage,state){
    try{storage.setItem(storageKey,JSON.stringify(state));return true;}
    catch(e){return false;}
  }

  const api={outfits,normalize,nextOutfit,clampPoint,positionToPoint,pointToPosition,panelPoint,speechDuration,dockVisible,interact,load,save};
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.BlogPet=api;
})(typeof window==='object'?window:globalThis);
