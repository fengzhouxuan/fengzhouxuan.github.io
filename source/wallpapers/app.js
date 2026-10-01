(function(){
  'use strict';
  const core=window.WallpaperStation,commons=window.WallpaperCommons,$=id=>document.getElementById(id);
  const favoritesKey='rabbit-wallpapers-favorites-v1';
  const state={day:core.dayKey(),batch:0,originals:core.dailyWallpapers(),artworks:[],source:'all',orientation:'all',query:'',style:'',palette:'',sort:'recommended',limit:24,favorites:new Map(),failed:new Set(),current:null,queue:[],loading:false,view:'image',downloading:false};
  state.category='';state.commons=new Map();state.commonsLoading=new Set();state.commonsStatus=new Map();
  let storage,toastTimer,undoAction,touchStart,fallbackPromise;
  const columnCount=()=>window.innerWidth<=600?2:window.innerWidth<=1100?3:4;
  let columns=columnCount();
  try{storage=window.localStorage;}catch(e){/* Private browsing may disable storage. */}

  function svgURL(item,width=640,height=Math.round(width*item.height/item.width)){
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
          const date=new Date(match[1]+'T12:00:00+08:00');
          if(!Number.isFinite(date.getTime()))continue;
          const restored=core.dailyWallpapers(date,batch)[index];
          if(restored.id===item.id)state.favorites.set(item.id,restored);
        }else if(/^commons-\d+$/.test(item.id)){
          const restored=commons.normalizeCommons([item.commonsRecord],item.collection)[0];
          if(restored?.id===item.id)state.favorites.set(item.id,restored);
        }else if(/^art-\d+$/.test(item.id)){
          const restored=core.normalizeArtworks([{id:Number(item.id.slice(4)),accession_number:item.accessionNumber,share_license_status:item.license,title:item.title,creators:[{description:item.artist}],images:{web:{url:item.image},print:{url:item.download,width:item.width,height:item.height}}}])[0];
          if(restored)state.favorites.set(item.id,restored);
        }
      }
    }catch(e){state.favorites.clear();}
  }

  function toast(message,undo){
    clearTimeout(toastTimer);undoAction=undo;
    $('toast-text').textContent=message;$('toast-undo').hidden=!undo;$('toast').hidden=false;
    toastTimer=setTimeout(()=>{$('toast').hidden=true;undoAction=null;},5000);
  }

  function saveFavorites(){
    try{
      if(!storage)throw Error('收藏存储不可用');
      storage.setItem(favoritesKey,JSON.stringify([...state.favorites.values()]));
      return true;
    }catch(e){return false;}
  }

  function updateFavorites(){
    $('favorite-count').textContent=state.favorites.size;$('tab-favorite-count').textContent=state.favorites.size;
    for(const button of $('gallery').querySelectorAll('.card-favorite')){
      const active=state.favorites.has(button.dataset.id);
      button.textContent=active?'♥':'♡';button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',(active?'取消收藏 ':'收藏 ')+button.dataset.title);
    }
    if(state.current)updateFavoriteButton();
  }

  function setFavorite(item,active){
    if(active)state.favorites.set(item.id,item);else state.favorites.delete(item.id);
    const saved=saveFavorites();
    if(state.source==='favorites')render();else updateFavorites();
    return saved;
  }

  function toggleFavorite(item){
    const wasActive=state.favorites.has(item.id);
    const saved=setFavorite(item,!wasActive);
    toast(saved?(wasActive?'已从收藏移除':'已收藏，下次来还能找到它'):'已更新本次收藏；当前浏览器无法长期保存',()=>{
      setFavorite(item,wasActive);toast('已撤销');
    });
  }

  function visibleItems(){
    const originals=state.originals.slice().sort((a,b)=>((a.index*7)%24)-((b.index*7)%24));
    const openImages=[...new Map([...state.commons.values()].flat().map(item=>[item.id,item])).values()];
    const items=[];
    if(state.source==='favorites')items.push(...state.favorites.values());
    else if(state.source==='all'){
      for(let index=0;index<Math.max(originals.length,state.artworks.length,openImages.length);index++){
        if(originals[index])items.push(originals[index]);
        if(state.artworks[index])items.push(state.artworks[index]);
        if(openImages[index])items.push(openImages[index]);
      }
    }else items.push(...originals,...state.artworks,...openImages);
    const filtered=core.filterWallpapers(items,{source:state.source==='favorites'?'all':state.source,orientation:state.orientation,query:state.query,style:state.style,palette:state.palette,category:state.category}).filter(item=>!state.failed.has(item.id));
    if(state.sort==='resolution')filtered.sort((a,b)=>b.width*b.height-a.width*a.height);
    else if(state.sort==='title')filtered.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
    return filtered;
  }

  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }

  function syncFilters(){
    for(const button of $('content-categories').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.category===state.category));
    for(const tab of $('sources').querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab.dataset.source===state.source));
    for(const button of $('styles').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.style===state.style));
    for(const button of $('palettes').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.palette===state.palette));
    $('orientation').value=state.orientation;$('search').value=state.query;$('sort').value=state.sort;
    $('styles').hidden=state.source==='art';$('palettes').hidden=state.source==='art';
    document.querySelector('.filter-details').hidden=state.source==='art'||state.source==='commons'||['anime','illustration','city','animals'].includes(state.category);
    $('reset-filters').hidden=!state.category&&!state.style&&state.palette===''&&!state.query&&state.orientation==='all';
    const feed=state.category==='illustration'?'anime':state.category;
    const status=state.commonsStatus.get(feed);
    $('category-status').hidden=!Object.hasOwn(commons.categories,feed);
    $('category-status').textContent=state.commonsLoading.has(feed)?'正在更新开放图库，已收录的图片可以先看。':status==='fresh'?'开放图库已更新 · 每张保留作者与许可':status==='cached'?'今日图库已更新 · 每张保留作者与许可':status==='stale'?'图源暂时连接不上，正在展示已收录的开放图片。':status==='unavailable'?'当前图源无法连接，请稍后重试。':'只收录明确开放授权的图片 · 作者与许可随图保留';
    $('retry-commons').hidden=!Object.hasOwn(commons.categories,feed)||state.commonsLoading.has(feed)||!['stale','unavailable'].includes(status);
    for(const tile of document.querySelectorAll('[data-collection]')){
      const name=tile.dataset.collection;
      tile.setAttribute('aria-pressed',String(name==='anime'?state.category==='anime':name==='art'?state.source==='art':name==='night'?state.palette==='1':state.style===name));
    }
  }

  function updateResults(){
    const total=visibleItems().length;
    $('count').textContent=total+' 张壁纸';
    $('empty').hidden=total>0;
    $('load-more').hidden=state.limit>=total;
    $('shown-count').textContent=total?'已看 '+Math.min(state.limit,total)+' / '+total+' 张':'';
    $('load-more').textContent='再看 '+Math.min(24,total-state.limit)+' 张 ↓';
    $('empty-title').textContent=state.source==='favorites'?'给喜欢的风景留个位置。':'换个心情，再挑一次。';
    $('empty-text').textContent=state.source==='favorites'?'点壁纸上的 ♡ 即可收藏，刷新后也会保留。':state.commonsLoading.has(state.category==='illustration'?'anime':state.category)?'正在打开这个分类，稍等一下就好。':state.source==='art'&&!state.artworks.length?(state.loading?'正在打开艺术馆，请稍等一下。':'艺术馆暂时连接不上，先看看今天的原创壁纸。'):'这些条件下暂时没有壁纸，试试其他主题或配色。';
    $('retry-art').hidden=state.source!=='art'||state.loading||state.artworks.length>0;
    $('shuffle').hidden=state.source==='art'||state.source==='favorites';
    $('random').disabled=!total;
  }

  function render(){
    const items=visibleItems().slice(0,state.limit),fragment=document.createDocumentFragment();
    const stacks=Array.from({length:columns},()=>element('div','gallery-column'));
    for(const [index,item] of items.entries()){
      const card=element('article','card');
      card.dataset.id=item.id;card.dataset.orientation=item.height>item.width?'portrait':'landscape';
      card.style.setProperty('--image-ratio',item.width+'/'+item.height);
      const open=element('button','card-open');open.type='button';open.setAttribute('aria-label','预览 '+item.title);
      const image=element('img','card-image');image.alt=item.title;image.loading='lazy';image.decoding='async';
      image.width=640;image.height=Math.round(640*item.height/item.width);
      image.src=item.source==='original'?svgURL(item):item.image;
      image.addEventListener('load',()=>card.classList.add('loaded'),{once:true});
      image.addEventListener('error',()=>{
        state.failed.add(item.id);card.remove();updateResults();
        if(item.source==='art'&&state.artworks.every(art=>state.failed.has(art.id)))$('source-status').textContent='艺术图片暂时无法加载，原创壁纸照常浏览和下载。';
      },{once:true});
      const badge=element('span','card-badge',item.source==='original'?'原创 · 4K':item.source==='commons'?item.license:'开放艺术');
      const hint=element('span','card-open-hint','查看效果 ↗');open.append(image,badge,hint);open.addEventListener('click',()=>showPreview(item));
      const info=element('div','card-info');info.append(element('span','card-title',item.title));
      const meta=element('div','card-meta');meta.append(element('span','',item.width+' × '+item.height),element('span','',item.height>item.width?'手机':'桌面'));info.append(meta);
      const actions=element('div','card-actions');
      const favorite=element('button','card-favorite');favorite.type='button';favorite.dataset.id=item.id;favorite.dataset.title=item.title;favorite.addEventListener('click',()=>toggleFavorite(item));
      let quick;
      if(item.source==='original'){
        quick=element('button','card-download','↓');quick.type='button';quick.setAttribute('aria-label','下载 '+item.title);quick.title='直接下载 4K PNG';quick.addEventListener('click',()=>downloadItem(item,item.width+'x'+item.height));
      }else{
        quick=element('a','card-download','↗');quick.href=item.download;quick.target='_blank';quick.rel='noopener noreferrer';quick.setAttribute('aria-label','打开 '+item.title+' 的高清原图');quick.title='打开高清原图';
      }
      actions.append(favorite,quick);card.append(open,info,actions);stacks[index%columns].append(card);
    }
    fragment.append(...stacks);
    $('gallery').replaceChildren(fragment);syncFilters();updateResults();updateFavorites();
  }

  function updateHero(){
    $('hero-image').src=svgURL(state.originals[0],1280,720);
    $('hero-phone-image').src=svgURL(state.originals[13],540,960);
    $('hero-title').textContent=state.originals[0].title;
    $('hero-date').textContent=state.day.replaceAll('-','.');
    for(const image of document.querySelectorAll('[data-cover]'))image.src=svgURL(state.originals[Number(image.dataset.cover)],240,240);
  }

  function updateFavoriteButton(){
    const active=state.favorites.has(state.current.id);
    $('favorite').textContent=active?'♥ 已收藏':'♡ 收藏';$('favorite').setAttribute('aria-pressed',String(active));
  }

  function updatePreview(){
    const item=state.current;if(!item)return;
    const [width,height]=$('download-size').value.split('x').map(Number);
    const original=item.source==='original';
    let ratioWidth=original?width:item.width,ratioHeight=original?height:item.height;
    if(state.view==='phone'){ratioWidth=9;ratioHeight=16;}
    else if(state.view==='desktop'){ratioWidth=16;ratioHeight=9;}
    $('preview-image').src=original?svgURL(item,Math.round(1200*ratioWidth/Math.max(ratioWidth,ratioHeight)),Math.round(1200*ratioHeight/Math.max(ratioWidth,ratioHeight))):item.image;
    $('device-screen').style.setProperty('--preview-ratio',ratioWidth+'/'+ratioHeight);
    $('device-screen').style.setProperty('--preview-width',ratioHeight>ratioWidth?'240px':'100%');
    $('device-screen').classList.toggle('portrait',ratioHeight>ratioWidth);
    $('preview-canvas').dataset.view=state.view;
    $('lock-clock').hidden=state.view!=='phone';$('desktop-overlay').hidden=state.view!=='desktop';
    $('lock-date').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date());
    for(const button of $('preview-views').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.view===state.view));
    $('preview-dimensions').textContent=(original?width+' × '+height:item.width+' × '+item.height)+(original?' · PNG · 无水印':' · 原始尺寸');
    $('preview-note').textContent=state.view==='image'?'画面不裁切，保留完整构图。':original?'下载只包含壁纸，不包含时钟、桌面图标或设备边框。':'桌面与锁屏为裁切示意；打开高清原图可保存完整作品。';
  }

  function showPreview(item,keepQueue=false){
    if(!keepQueue){
      state.queue=visibleItems();
      if(!state.queue.some(entry=>entry.id===item.id))state.queue=[item,...state.queue];
      state.view='image';
    }
    state.current=item;
    $('preview-title').textContent=item.title;$('preview-artist').textContent=item.artist;$('preview-image').alt=item.title;
    $('preview-source').textContent=item.source==='original'?'每日原创 / '+item.day:item.source==='commons'?'开放图库 / WIKIMEDIA COMMONS':'开放艺术馆 / CLEVELAND';
    const original=item.source==='original';
    $('size-label').hidden=!original;$('download').hidden=!original;$('art-download').hidden=original;
    $('download-size').value=(state.view==='phone'||state.view==='image'&&item.height>item.width)?'2160x3840':'3840x2160';
    $('download-status').textContent='';$('source-link').hidden=original;
    if(!original){$('source-link').href=item.pageUrl;$('art-download').href=item.download;$('source-link').textContent=item.source==='commons'?'Wikimedia Commons · 查看作品与作者 ↗':'克利夫兰艺术博物馆 · 查看作品 ↗';}
    $('license-link').href=item.licenseUrl;
    $('license-link').textContent=item.license+' · '+(item.license.startsWith('CC BY-SA')?'署名 · 相同方式共享':item.license.startsWith('CC BY')?'使用时署名':'可自由使用')+' ↗';
    $('credit-block').hidden=item.source!=='commons';
    $('credit-text').textContent=item.source==='commons'?item.title+' — '+item.artist+' · '+item.license+'\n'+item.pageUrl+'\n'+item.licenseUrl:'';
    $('preview-tags').replaceChildren(...item.tags.filter(tag=>!['横屏','竖屏','原创'].includes(tag)).map(tag=>element('span','',tag)));
    const position=state.queue.findIndex(entry=>entry.id===item.id);
    $('preview-position').textContent=(position+1)+' / '+state.queue.length;
    $('previous').disabled=state.queue.length<2;$('next').disabled=state.queue.length<2;$('preview-next').disabled=state.queue.length<2;
    updateFavoriteButton();updatePreview();
    if(!$('preview').open){$('preview').append($('toast'));$('preview').showModal();document.body.classList.add('preview-open');}
  }

  function movePreview(direction){
    if(!state.current||state.queue.length<2)return;
    const index=state.queue.findIndex(item=>item.id===state.current.id);
    showPreview(state.queue[(index+direction+state.queue.length)%state.queue.length],true);
  }

  async function downloadItem(item,size){
    if(!item||item.source!=='original'||state.downloading)return;
    state.downloading=true;$('download').disabled=true;
    $('download-status').textContent='正在生成高清 PNG…';toast('正在为你准备高清壁纸…');
    let objectURL;
    try{
      const [width,height]=size.split('x').map(Number);
      const image=new Image();image.src=svgURL(item,width,height);await image.decode();
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw Error('图片导出不可用');
      context.drawImage(image,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('图片导出失败');
      objectURL=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=objectURL;link.download=item.title+'-'+width+'x'+height+'.png';document.body.append(link);link.click();link.remove();
      $('download-status').textContent='已生成 '+width+' × '+height+' PNG。';toast('壁纸已准备好 · '+width+' × '+height);
    }catch(e){$('download-status').textContent='下载暂时失败，请重试或换一个尺寸。';toast('这次没能生成图片，再试一次或选择较小尺寸。');}
    finally{if(objectURL)setTimeout(()=>URL.revokeObjectURL(objectURL),10000);$('download').disabled=false;state.downloading=false;}
  }

  async function refreshArtwork(){
    if(state.loading)return;
    state.loading=true;$('retry-art').disabled=true;
    try{
      const result=await core.loadArtworks({fetcher:window.fetch.bind(window),storage});
      state.artworks=result.items;
      $('source-status').textContent={fresh:'艺术馆已更新 · 开放馆藏',cached:'今日已更新',stale:'艺术馆暂时连接不上，仍可浏览上次的作品。',unavailable:'艺术馆暂时连接不上，原创壁纸照常浏览和下载。'}[result.state];
    }finally{state.loading=false;$('retry-art').disabled=false;render();}
  }

  function resetFilters(){
    state.source='all';state.category='';state.style='';state.palette='';state.query='';state.orientation='all';state.limit=24;render();
  }

  async function refreshCommons(category){
    const feed=category==='illustration'?'anime':category;
    if(!Object.hasOwn(commons.categories,feed)||state.commonsLoading.has(feed))return;
    state.commonsLoading.add(feed);render();
    try{
      if(!fallbackPromise)fallbackPromise=fetch('./data/open-images.json').then(response=>{if(!response.ok)throw Error('图库数据暂时不可用');return response.json();}).catch(()=>null);
      const snapshot=await fallbackPromise;
      const fallback=snapshot?.version===1?snapshot.records?.[feed]||[]:[];
      if(!state.commons.has(feed)){state.commons.set(feed,commons.normalizeCommons(fallback,feed));render();}
      const result=await commons.loadCommons({category:feed,fetcher:window.fetch.bind(window),storage,fallback});
      state.commons.set(feed,result.items);state.commonsStatus.set(feed,result.state);
      for(const item of result.items)state.failed.delete(item.id);
    }finally{state.commonsLoading.delete(feed);render();}
  }

  function checkDay(){
    if(document.hidden)return;
    const today=core.dayKey();if(today===state.day)return;
    state.day=today;state.batch=0;state.originals=core.dailyWallpapers();state.failed.clear();
    updateHero();render();refreshArtwork();
    if(state.category)refreshCommons(state.category);
  }

  $('content-categories').addEventListener('click',event=>{
    const button=event.target.closest('button[data-category]');if(!button)return;
    state.category=button.dataset.category;state.source='all';state.style='';state.palette='';state.limit=24;render();refreshCommons(state.category);
  });
  $('retry-commons').addEventListener('click',()=>refreshCommons(state.category));

  $('sources').addEventListener('click',event=>{
    const button=event.target.closest('button[data-source]');if(!button)return;
    state.source=button.dataset.source;state.category='';state.style='';state.palette='';state.limit=24;render();
    if(state.source==='commons'&&!state.commons.size)refreshCommons('anime');
  });
  $('styles').addEventListener('click',event=>{
    const button=event.target.closest('button[data-style]');if(!button)return;
    state.style=button.dataset.style;
    if(state.style&&state.source==='all')state.source='original';
    state.limit=24;render();
  });
  $('palettes').addEventListener('click',event=>{
    const button=event.target.closest('button[data-palette]');if(!button)return;
    state.palette=button.dataset.palette;
    if(state.palette!==''&&state.source==='all')state.source='original';
    state.limit=24;render();
  });
  document.querySelector('.collections').addEventListener('click',event=>{
    const tile=event.target.closest('[data-collection]');if(!tile)return;
    resetFilters();const name=tile.dataset.collection;
    if(name==='anime'){state.category='anime';refreshCommons('anime');}
    else if(name==='art')state.source='art';
    else{state.source='original';if(name==='night')state.palette='1';else state.style=name;}
    render();$('collection').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  $('orientation').addEventListener('change',event=>{state.orientation=event.target.value;state.limit=24;render();});
  $('sort').addEventListener('change',event=>{state.sort=event.target.value;state.limit=24;render();});
  $('search').addEventListener('input',event=>{state.query=event.target.value;state.limit=24;render();});
  $('reset-filters').addEventListener('click',resetFilters);$('empty-reset').addEventListener('click',resetFilters);
  $('load-more').addEventListener('click',()=>{state.limit+=24;render();});
  $('retry-art').addEventListener('click',()=>{state.failed.clear();refreshArtwork();});
  $('header-favorites').addEventListener('click',()=>{
    resetFilters();state.source='favorites';render();$('collection').scrollIntoView({block:'start'});
  });
  $('shuffle').addEventListener('click',()=>{
    state.batch++;state.originals=core.dailyWallpapers(new Date(),state.batch);updateHero();render();toast('换好了，一组新的颜色。');
  });
  $('random').addEventListener('click',()=>{const items=visibleItems();if(items.length)showPreview(items[Math.floor(Math.random()*items.length)]);});
  $('hero-open').addEventListener('click',()=>showPreview(state.originals[0]));
  $('hero-phone-open').addEventListener('click',()=>{showPreview(state.originals[13]);state.view='phone';updatePreview();});
  $('close-preview').addEventListener('click',()=>$('preview').close());
  $('preview').addEventListener('close',()=>{document.body.append($('toast'));document.body.classList.remove('preview-open');});
  $('preview').addEventListener('click',event=>{
    if(event.target!==$('preview'))return;const rect=$('preview').getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('preview').close();
  });
  $('previous').addEventListener('click',()=>movePreview(-1));$('next').addEventListener('click',()=>movePreview(1));$('preview-next').addEventListener('click',()=>movePreview(1));
  $('preview-views').addEventListener('click',event=>{
    const button=event.target.closest('button[data-view]');if(!button)return;
    state.view=button.dataset.view;
    if(state.current?.source==='original'&&state.view!=='image')$('download-size').value=state.view==='phone'?'2160x3840':'3840x2160';
    updatePreview();
  });
  $('download-size').addEventListener('change',()=>{
    if(state.view!=='image')state.view=$('download-size').value==='2160x3840'?'phone':'desktop';
    updatePreview();
  });
  $('preview-image').addEventListener('error',()=>{$('download-status').textContent='图片暂时无法加载，可以打开来源页面查看。';});
  $('download').addEventListener('click',()=>downloadItem(state.current,$('download-size').value));
  $('favorite').addEventListener('click',()=>toggleFavorite(state.current));
  $('copy-credit').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('credit-text').textContent);toast('作者、来源和许可已复制。');}catch(e){toast('复制未完成，可以选中下方署名信息手动复制。');}
  });
  $('toast-close').addEventListener('click',()=>{$('toast').hidden=true;clearTimeout(toastTimer);});
  $('toast-undo').addEventListener('click',()=>{const undo=undoAction;undoAction=null;if(undo)undo();});
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
    if($('preview').open){
      if(event.key==='ArrowLeft'){event.preventDefault();movePreview(-1);}
      else if(event.key==='ArrowRight'){event.preventDefault();movePreview(1);}
      else if(event.key.toLowerCase()==='f'){event.preventDefault();toggleFavorite(state.current);}
    }else if(event.key==='/'){event.preventDefault();$('search').focus();$('collection').scrollIntoView({block:'start'});}
  });
  $('preview-canvas').addEventListener('touchstart',event=>{touchStart=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true});
  $('preview-canvas').addEventListener('touchend',event=>{
    if(!touchStart||!event.changedTouches.length)return;
    const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;
    if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*1.5)movePreview(dx<0?1:-1);
    touchStart=null;
  },{passive:true});
  document.addEventListener('visibilitychange',checkDay);setInterval(checkDay,60000);
  window.addEventListener('resize',()=>{const nextColumns=columnCount();if(nextColumns!==columns){columns=nextColumns;render();}});
  restoreFavorites();updateHero();render();refreshArtwork();
})();
