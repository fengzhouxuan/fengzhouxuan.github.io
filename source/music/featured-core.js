/* MusicSquare featured playlists. Added in the fengzhouxuan fork. */
(function(root){
  const sources=['netease','qq','kuwo'];

  function safeURL(value){
    if(typeof value!=='string' || !value.trim())return null;
    try{
      const url=new URL(value.startsWith('//')?'https:'+value:value);
      if(!['http:','https:'].includes(url.protocol) || url.username || url.password)return null;
      url.protocol='https:';
      return url.href;
    }catch(e){return null;}
  }

  function normalizeTrack(source,raw){
    if(!sources.includes(source) || !raw || typeof raw!=='object')return null;
    const id=String(raw.songid ?? raw.id ?? '').trim();
    if(!/^[a-zA-Z0-9]+$/.test(id) || !String(raw.title ?? raw.name ?? '').trim())return null;
    const track={
      uid:source+'-'+id,source,songid:id,featured:true,
      title:String(raw.title ?? raw.name).trim(),artist:String(raw.artist||''),
      album:String(raw.album||''),cover:safeURL(raw.cover),
      pageUrl:safeURL(raw.pageUrl),detailsLoaded:false,audioUrl:null,lrc:null,lrcUrl:null
    };
    if(source==='qq'){
      track.songMid=id;track.qqId=id;track.qqSearchKey=track.title;
    }
    return track;
  }

  function normalizePlaylist(source,raw){
    if(!sources.includes(source) || !raw || !/^\d+$/.test(String(raw.id)))return null;
    const tracks=[];const seen=new Set();
    for(const item of Array.isArray(raw.tracks)?raw.tracks:[]){
      const track=normalizeTrack(source,item);
      if(track && !seen.has(track.uid)){seen.add(track.uid);tracks.push(track);}
    }
    return {
      id:String(raw.id),source,name:String(raw.name||'未命名歌单'),cover:safeURL(raw.cover),
      description:String(raw.description||''),creator:String(raw.creator||''),
      playCount:Math.max(0,Number(raw.playCount)||0),
      trackCount:Math.max(tracks.length,Number(raw.trackCount)||0),
      tags:[...new Set((Array.isArray(raw.tags)?raw.tags:[]).filter(x=>typeof x==='string' && x.trim()).map(x=>x.trim()))],
      pageUrl:safeURL(raw.pageUrl),updatedAt:String(raw.updatedAt||''),tracks
    };
  }

  function parseCatalog(raw){
    if(!raw || raw.version!==1 || !raw.sources || typeof raw.sources!=='object')throw Error('歌单数据格式不正确');
    const catalog={version:1,generatedAt:String(raw.generatedAt||''),sources:{}};
    for(const source of sources){
      const data=raw.sources[source]||{};
      catalog.sources[source]={
        updatedAt:String(data.updatedAt||''),error:typeof data.error==='string'?data.error:'',
        playlists:(Array.isArray(data.playlists)?data.playlists:[]).map(x=>normalizePlaylist(source,x)).filter(Boolean)
      };
    }
    return catalog;
  }

  function nextIndex(list,current,direction,mode,failed,random=Math.random){
    if(!list.length)return -1;
    const available=list.map((track,index)=>index).filter(index=>!failed.has(list[index].uid));
    if(!available.length)return -1;
    if(mode==='single' && available.includes(current))return current;
    if(mode==='shuffle'){
      const choices=available.filter(index=>index!==current);
      const pool=choices.length?choices:available;
      return pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))];
    }
    const step=direction==='prev'?-1:1;
    for(let n=1;n<=list.length;n++){
      const index=((current+step*n)%list.length+list.length)%list.length;
      if(available.includes(index))return index;
    }
    return -1;
  }

  async function requestJSON(url,fetchImpl=fetch,timeout=12000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetchImpl(url,{signal:controller.signal});
      if(!response.ok)throw Error('接口请求失败（'+response.status+'）');
      return await response.json();
    }finally{clearTimeout(timer);}
  }

  async function resolveTrack(track,fetchJSON=requestJSON){
    if(!track || !sources.includes(track.source) || !/^[a-zA-Z0-9]+$/.test(String(track.songid)))throw Error('歌曲标识不正确');
    if(track.source==='netease'){
      const base='https://api.qijieya.cn/meting/?server=netease&id='+encodeURIComponent(track.songid);
      return {audioUrl:base+'&type=url',lrcUrl:base+'&type=lrc',detailsLoaded:true};
    }
    if(track.source==='qq'){
      const url='https://tang.api.s01s.cn/music_open_api.php?type=json&msg='+encodeURIComponent(track.title)+'&mid='+encodeURIComponent(track.songid);
      const data=await fetchJSON(url);
      if(String(data?.song_mid)!==track.songid)throw Error('音源与歌单歌曲不一致');
      const audioUrl=safeURL(data.song_play_url_standard || data.song_play_url);
      if(!audioUrl)throw Error('暂时没有可用音源');
      return {audioUrl,lrc:typeof data.song_lyric==='string'?data.song_lyric:null,detailsLoaded:true};
    }
    const url='https://mobi.kuwo.cn/mobi.s?f=web&source=kwplayercar_ar_6.0.0.9_B_jiakong_vh.apk&from=PC&type=convert_url_with_sign&br=128kmp3&rid='+encodeURIComponent(track.songid);
    const data=await fetchJSON(url);
    if(data?.code!==200 || String(data?.data?.rid)!==track.songid)throw Error('音源与歌单歌曲不一致');
    const audioUrl=safeURL(data?.data?.url);
    if(!audioUrl)throw Error('暂时没有可用音源');
    return {audioUrl,detailsLoaded:true};
  }

  const api={sources,safeURL,normalizeTrack,normalizePlaylist,parseCatalog,nextIndex,requestJSON,resolveTrack};
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.MusicSquareFeatured=api;
})(typeof window==='object'?window:globalThis);
