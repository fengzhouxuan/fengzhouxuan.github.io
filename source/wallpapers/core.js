/* Daily wallpapers: browser-only, with the same CommonJS/browser bridge as music. */
(function(root){
  'use strict';
  const palettes=[
    {name:'松间',colors:['#dce6d5','#88a88e','#3b6654','#f8edcb']},
    {name:'暮蓝',colors:['#172638','#526c89','#9bb3be','#e8dbb9']},
    {name:'杏雨',colors:['#f2e4d2','#d6ac95','#b57469','#fff5de']},
    {name:'薰衣草',colors:['#e9e3f2','#b0a0cc','#6e6196','#f3dce5']},
    {name:'落日',colors:['#f3d2a7','#d89872','#965e52','#fce6b4']},
    {name:'海盐',colors:['#d5e9e6','#7eaaa8','#3b7078','#f2eacc']}
  ];
  const patterns=['山野','柔光','轨道','几何'];
  const cacheKey='rabbit-wallpapers-art-v2';

  function dayKey(now=new Date()){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  }

  function hash(value){
    let seed=2166136261;
    for(const char of String(value)){seed^=char.charCodeAt(0);seed=Math.imul(seed,16777619);}
    return seed>>>0;
  }

  function random(seed){
    let state=seed>>>0;
    return function(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  }

  function dailyWallpapers(now=new Date(),batch=0){
    if(!Number.isSafeInteger(batch)||batch<0)throw Error('批次格式不正确');
    const day=dayKey(now);
    return Array.from({length:24},(_,index)=>{
      const palette=index%palettes.length,pattern=Math.floor(index/palettes.length);
      const portrait=index%2===1;
      return {id:'daily-'+day+'-'+batch+'-'+index,source:'original',day,batch,index,
        seed:hash(day+'-'+batch+'-'+index),palette,pattern,
        title:palettes[palette].name+' · '+patterns[pattern],paletteName:palettes[palette].name,colors:palettes[palette].colors,
        artist:'兔子洞 · 程序绘制',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
        width:portrait?2160:3840,height:portrait?3840:2160,
        categories:pattern===0?['nature']:pattern===2?['minimal','space']:['minimal'],
        tags:[patterns[pattern],palettes[palette].name,'原创',portrait?'竖屏':'横屏']};
    });
  }

  function renderSVG(item,width=960,height=540){
    if(!item||!Number.isInteger(item.palette)||!palettes[item.palette]||!Number.isInteger(item.pattern)||!patterns[item.pattern]||!Number.isInteger(item.seed))throw Error('壁纸参数不正确');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>7680||height>7680)throw Error('图片尺寸不正确');
    const [bg,mid,ink,light]=palettes[item.palette].colors;
    const rand=random(item.seed),w=1600,h=1600*height/width;
    const cx=w*(.35+rand()*.3),cy=h*(.22+rand()*.3),radius=Math.min(w,h)*(.12+rand()*.09);
    let shapes='';
    if(item.pattern===0){
      shapes='<circle cx="'+cx+'" cy="'+cy+'" r="'+radius+'" fill="'+light+'" opacity=".86"/>';
      for(let layer=0;layer<4;layer++){
        const y=h*(.49+layer*.14);
        shapes+='<path d="M-100 '+(y+rand()*h*.1)+' Q '+(w*.25)+' '+(y-h*(.22+rand()*.17))+' '+(w*.52)+' '+y+' T '+(w+100)+' '+(y-h*.06)+' V '+h+' H-100Z" fill="'+[mid,ink,mid,ink][layer]+'" opacity="'+[.55,.4,.7,.87][layer]+'"/>';
      }
    }else if(item.pattern===1){
      shapes='<g filter="url(#blur)">';
      for(let i=0;i<6;i++)shapes+='<ellipse cx="'+(rand()*w)+'" cy="'+(rand()*h)+'" rx="'+(w*(.2+rand()*.25))+'" ry="'+(h*(.15+rand()*.25))+'" fill="'+[mid,ink,light][i%3]+'" opacity=".65"/>';
      shapes+='</g>';
    }else if(item.pattern===2){
      shapes='<circle cx="'+cx+'" cy="'+cy+'" r="'+radius+'" fill="'+light+'"/><g fill="none" stroke="'+mid+'" stroke-width="2" opacity=".65">';
      for(let i=0;i<9;i++)shapes+='<ellipse cx="'+(w*.55)+'" cy="'+(h*.58)+'" rx="'+(w*(.22+i*.045))+'" ry="'+(h*(.12+i*.033))+'" transform="rotate(-28 '+(w*.55)+' '+(h*.58)+')"/>';
      shapes+='</g><circle cx="'+(w*.68)+'" cy="'+(h*.67)+'" r="'+(radius*.23)+'" fill="'+ink+'"/>';
    }else{
      shapes='<g transform="translate('+(w*.18)+' '+(h*.22)+')">';
      for(let i=0;i<6;i++){
        const x=(i%3)*w*.215,y=Math.floor(i/3)*h*.25,size=Math.min(w*.18,h*.22);
        const color=[mid,ink,light][i%3];
        shapes+=i%2?'<circle cx="'+(x+size/2)+'" cy="'+(y+size/2)+'" r="'+size/2+'" fill="'+color+'"/>':'<path d="M'+x+' '+(y+size)+' V'+(y+size/2)+' a'+size/2+' '+size/2+' 0 0 1 '+size+' 0 V'+(y+size)+'Z" fill="'+color+'"/>';
      }
      shapes+='</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+w+' '+h+'"><defs><linearGradient id="bg" x2=".3" y2="1"><stop stop-color="'+bg+'"/><stop offset="1" stop-color="'+mid+'"/></linearGradient><filter id="blur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="90"/></filter><pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="2" r=".6" fill="'+ink+'" opacity=".1"/></pattern></defs><path fill="url(#bg)" d="M0 0H'+w+'V'+h+'H0Z"/>'+shapes+'<path fill="url(#grain)" d="M0 0H'+w+'V'+h+'H0Z"/></svg>';
  }

  function normalizeArtworks(records){
    const seen=new Set(),items=[];
    function imageURL(value){
      try{
        const url=new URL(value);
        return url.protocol==='https:'&&url.hostname==='openaccess-cdn.clevelandart.org'&&!url.username&&!url.password&&/^\/[a-z0-9._-]+\/[a-z0-9._-]+\.jpg$/i.test(url.pathname)?url.href:null;
      }catch(e){return null;}
    }
    for(const raw of Array.isArray(records)?records:[]){
      if(!raw||raw.share_license_status!=='CC0'||!Number.isSafeInteger(raw.id)||raw.id<1||typeof raw.accession_number!=='string'||!/^[a-z0-9._-]{1,80}$/i.test(raw.accession_number)||seen.has(raw.id))continue;
      const image=imageURL(raw.images?.web?.url),download=imageURL(raw.images?.print?.url);
      if(!image||!download)continue;
      const width=Number(raw.images.print.width),height=Number(raw.images.print.height);
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||Math.max(width,height)<1600||Math.min(width,height)<800)continue;
      seen.add(raw.id);
      items.push({id:'art-'+raw.id,source:'art',title:typeof raw.title==='string'?raw.title:'无题',
        artist:(Array.isArray(raw.creators)?raw.creators:[]).map(creator=>typeof creator?.description==='string'?creator.description:'').filter(Boolean).join(' / ')||'作者未注明',
        width,height,image,download,accessionNumber:raw.accession_number,
        pageUrl:'https://www.clevelandart.org/art/'+raw.accession_number,
        license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',categories:['art','nature'],tags:['艺术','绘画',width>=height?'横屏':'竖屏']});
    }
    return items;
  }

  function filterWallpapers(items,{source='all',orientation='all',query='',favorites=null,style='',palette='',category=''}={}){
    const keyword=String(query).trim().toLocaleLowerCase();
    return items.filter(item=>(source==='all'||item.source===source)&&
      (orientation==='all'||(orientation==='landscape'?item.width>=item.height:item.height>item.width))&&
      (!favorites||favorites.has(item.id))&&
      (!category||item.categories?.includes(category))&&
      (!style||item.tags.includes(style))&&
      (palette===''||item.source==='original'&&item.palette===Number(palette))&&
      (!keyword||[item.title,item.artist,...item.tags].join(' ').toLocaleLowerCase().includes(keyword)));
  }

  async function loadArtworks({fetcher,storage,now=new Date(),timeout=10000}={}){
    const day=dayKey(now);
    let cached=null;
    try{
      const saved=JSON.parse(storage?.getItem(cacheKey)||'null');
      if(saved?.version===2&&Array.isArray(saved.records))cached={day:saved.day,items:normalizeArtworks(saved.records)};
    }catch(e){/* Storage may be unavailable or contain an old schema. */}
    if(cached?.day===day&&cached.items.length)return {items:cached.items,state:'cached'};
    const controller=new AbortController();
    let timer;
    try{
      const url=new URL('https://openaccess-api.clevelandart.org/api/artworks/');
      url.searchParams.set('q','landscape');
      url.searchParams.set('type','Painting');
      url.searchParams.set('cc0','1');
      url.searchParams.set('has_image','1');
      url.searchParams.set('limit','48');
      url.searchParams.set('skip',String(hash(day)%4*48));
      url.searchParams.set('fields','id,accession_number,title,share_license_status,images,creators');
      const response=await Promise.race([
        fetcher(url.href,{signal:controller.signal}),
        new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('图片源请求超时'));},timeout);})
      ]);
      if(!response.ok)throw Error('图片源暂时不可用');
      const payload=await response.json();
      const items=normalizeArtworks(payload?.data);
      if(!items.length)throw Error('没有符合要求的图片');
      try{storage?.setItem(cacheKey,JSON.stringify({version:2,day,records:payload.data}));}catch(e){/* A full cache must not prevent displaying fetched content. */}
      return {items,state:'fresh'};
    }catch(e){return {items:cached?.items||[],state:cached?.items.length?'stale':'unavailable'};}
    finally{clearTimeout(timer);}
  }

  const api={dayKey,dailyWallpapers,renderSVG,normalizeArtworks,filterWallpapers,loadArtworks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.WallpaperStation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
