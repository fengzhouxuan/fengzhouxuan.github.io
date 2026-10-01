(function(){
  'use strict';
  const core=window.WallpaperStation,$=id=>document.getElementById(id);
  const favoritesKey='rabbit-wallpapers-favorites-v1';
  const state={day:core.dayKey(),batch:0,originals:core.dailyWallpapers(),artworks:[],source:'all',orientation:'all',query:'',favorites:new Map(),failed:new Set(),current:null,loading:false,phone:false};
  let storage;
  try{storage=window.localStorage;}catch(e){/* Private browsing may disable storage. */}

  function svgURL(item,width=960,height=Math.round(width*item.height/item.width)){
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(core.renderSVG(item,width,height));
  }

  function restoreFavorites(){
    try{
      const saved=JSON.parse(storage?.getItem(favoritesKey)||'[]');
      for(const item of Array.isArray(saved)?saved:[]){
        if(!item||typeof item.id!=='string')continue;
        const match=item.id.match(/^daily-(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)$/);
        if(match){
          const batch=Number(match[2]),index=Number(match[3]);
          if(batch>100000||index>23)continue;
          const restored=core.dailyWallpapers(new Date(match[1]+'T12:00:00+08:00'),batch)[index];
          if(restored.id===item.id)state.favorites.set(item.id,restored);
        }else if(/^art-\d+$/.test(item.id)){
          const restored=core.normalizeArtworks([{id:Number(item.id.slice(4)),accession_number:item.accessionNumber,share_license_status:item.license,title:item.title,creators:[{description:item.artist}],images:{web:{url:item.image},print:{url:item.download,width:item.width,height:item.height}}}])[0];
          if(restored)state.favorites.set(item.id,restored);
        }
      }
    }catch(e){state.favorites.clear();}
  }

  function toggleFavorite(item){
    if(state.favorites.has(item.id))state.favorites.delete(item.id);
    else state.favorites.set(item.id,item);
    try{
      if(!storage)throw Error('收藏存储不可用');
      storage.setItem(favoritesKey,JSON.stringify([...state.favorites.values()]));
    }catch(e){$('source-status').textContent='当前浏览器无法保存收藏，本次打开期间仍可使用。';}
    render();
    if(state.current)updateFavoriteButton();
  }

  function visibleItems(){
    const items=state.source==='favorites'?[...state.favorites.values()]:[...state.originals,...state.artworks];
    return core.filterWallpapers(items,{source:state.source==='favorites'?'all':state.source,orientation:state.orientation,query:state.query}).filter(item=>!state.failed.has(item.id));
  }

  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }

  function render(){
    const items=visibleItems(),fragment=document.createDocumentFragment();
    for(const item of items){
      const card=element('article','card');
      card.dataset.orientation=item.height>item.width?'portrait':'landscape';
      const open=element('button','card-open');open.type='button';open.setAttribute('aria-label','预览 '+item.title);
      const image=element('img','card-image');image.alt=item.title;image.loading='lazy';image.decoding='async';
      image.src=item.source==='original'?svgURL(item):item.image;
      image.addEventListener('error',()=>{
        state.failed.add(item.id);card.remove();
        const remaining=visibleItems();$('count').textContent=remaining.length+' 张';$('empty').hidden=remaining.length>0;
        if(item.source==='art'&&state.artworks.every(art=>state.failed.has(art.id)))$('source-status').textContent='艺术图片暂时无法加载，原创壁纸照常浏览和下载。';
      },{once:true});
      const info=element('div','card-info');info.append(element('span','card-title',item.title));
      const meta=element('div','card-meta');meta.append(element('span','',item.source==='original'?'原创 · '+item.day:'开放艺术馆'),element('span','',item.height>item.width?'手机 · 竖屏':'电脑 · 横屏'));info.append(meta);
      open.append(image,info);open.addEventListener('click',()=>showPreview(item));
      const favorite=element('button','card-favorite',state.favorites.has(item.id)?'♥':'♡');favorite.type='button';favorite.setAttribute('aria-label',(state.favorites.has(item.id)?'取消收藏 ':'收藏 ')+item.title);favorite.setAttribute('aria-pressed',String(state.favorites.has(item.id)));favorite.addEventListener('click',()=>toggleFavorite(item));
      card.append(open,favorite);fragment.append(card);
    }
    $('gallery').replaceChildren(fragment);$('count').textContent=items.length+' 张';$('empty').hidden=items.length>0;
    $('empty-text').textContent=state.source==='favorites'?'遇见喜欢的壁纸，点一下 ♡ 就能收好。':state.source==='art'&&!state.artworks.length?'艺术馆暂时没有可用图片，先去每日原创逛逛。':'没有匹配的壁纸，换个关键词或尺寸试试。';
    $('shuffle').hidden=state.source==='art'||state.source==='favorites';
    $('random').disabled=!items.length;
  }

  function updateHero(){
    const item=state.originals[0];$('hero-image').src=svgURL(item,1280,800);
    $('hero-date').textContent=state.day.replaceAll('-','.');$('daily-note').textContent='每天更新 · 无需等待';
  }

  function updateFavoriteButton(){
    const active=state.favorites.has(state.current.id);$('favorite').textContent=active?'♥ 已收藏，点击取消':'♡ 收藏这张';$('favorite').setAttribute('aria-pressed',String(active));
  }

  function updatePreview(){
    const item=state.current;
    const [width,height]=$('download-size').value.split('x').map(Number);
    $('preview-image').src=item.source==='original'?svgURL(item,Math.round(1000*width/Math.max(width,height)),Math.round(1000*height/Math.max(width,height))):item.image;
    $('preview-dimensions').textContent=item.source==='original'?width+' × '+height+' · 无水印':item.width+' × '+item.height+' · 原图尺寸';
    const phone=state.phone;
    $('preview-image').parentElement.classList.toggle('phone',phone);$('lock-clock').hidden=!phone;
    $('lock-toggle').setAttribute('aria-pressed',String(phone));$('lock-toggle').textContent=phone?'退出锁屏预览':'预览手机锁屏';
  }

  function showPreview(item){
    state.current=item;state.phone=false;
    $('preview-title').textContent=item.title;$('preview-artist').textContent=item.artist;$('preview-image').alt=item.title;
    $('preview-source').textContent=item.source==='original'?'DAILY ORIGINAL / 每日原创':'OPEN ART / 艺术馆';
    const original=item.source==='original';
    $('size-label').hidden=!original;$('download').hidden=!original;$('art-download').hidden=original;
    $('download-size').value=item.height>item.width?'2160x3840':'3840x2160';
    $('download-status').textContent='';$('source-link').hidden=original;
    if(!original){$('source-link').href=item.pageUrl;$('art-download').href=item.download;}
    $('license-link').href=item.licenseUrl;updateFavoriteButton();updatePreview();
    if(!$('preview').open)$('preview').showModal();
  }

  async function download(){
    const item=state.current;if(!item||item.source!=='original')return;
    $('download').disabled=true;$('download-status').textContent='正在生成高清 PNG…';
    let objectURL;
    try{
      const [width,height]=$('download-size').value.split('x').map(Number);
      const image=new Image();image.src=svgURL(item,width,height);await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw Error('图片导出不可用');
      context.drawImage(image,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('图片导出失败');
      objectURL=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=objectURL;link.download=item.title+'-'+width+'x'+height+'.png';document.body.append(link);link.click();link.remove();
      $('download-status').textContent='已生成 '+width+' × '+height+' PNG。';
    }catch(e){$('download-status').textContent='下载暂时失败，请重试或换一个尺寸。';}
    finally{if(objectURL)setTimeout(()=>URL.revokeObjectURL(objectURL),10000);$('download').disabled=false;}
  }

  async function refreshArtwork(){
    if(state.loading)return;
    state.loading=true;
    try{
      const result=await core.loadArtworks({fetcher:window.fetch.bind(window),storage});
      state.artworks=result.items;
      $('source-status').textContent={fresh:'艺术馆已更新 · 来自克利夫兰艺术博物馆（CC0）。',cached:'艺术馆今日已更新 · 原创壁纸按北京时间每日换新。',stale:'艺术馆暂时连接不上，继续展示上次缓存的作品。',unavailable:'艺术馆暂时连接不上，原创壁纸照常浏览和下载。'}[result.state];
      render();
    }finally{state.loading=false;}
  }

  function checkDay(){
    if(document.hidden)return;
    const today=core.dayKey();
    if(today===state.day)return;
    state.day=today;state.batch=0;state.originals=core.dailyWallpapers();state.failed.clear();
    updateHero();render();refreshArtwork();
  }

  $('sources').addEventListener('click',event=>{
    const button=event.target.closest('button[data-source]');if(!button)return;
    state.source=button.dataset.source;
    for(const tab of $('sources').querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab===button));
    render();
  });
  $('orientation').addEventListener('change',event=>{state.orientation=event.target.value;render();});
  $('search').addEventListener('input',event=>{state.query=event.target.value;render();});
  $('shuffle').addEventListener('click',()=>{state.batch++;state.originals=core.dailyWallpapers(new Date(),state.batch);updateHero();render();});
  $('random').addEventListener('click',()=>{const items=visibleItems();if(items.length)showPreview(items[Math.floor(Math.random()*items.length)]);});
  $('close-preview').addEventListener('click',()=>$('preview').close());
  $('preview').addEventListener('click',event=>{if(event.target!==$('preview'))return;const rect=$('preview').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('preview').close();});
  $('download-size').addEventListener('change',updatePreview);
  $('preview-image').addEventListener('error',()=>{$('download-status').textContent='图片暂时无法加载，可以打开来源页面查看。';});
  $('lock-toggle').addEventListener('click',()=>{state.phone=!state.phone;updatePreview();});
  $('download').addEventListener('click',download);
  $('favorite').addEventListener('click',()=>toggleFavorite(state.current));
  document.addEventListener('visibilitychange',checkDay);setInterval(checkDay,60000);
  restoreFavorites();updateHero();render();refreshArtwork();
})();
