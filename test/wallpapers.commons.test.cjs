const {test}=require('node:test');
const assert=require('node:assert/strict');
const commons=require('../source/wallpapers/commons.js');
const core=require('../source/wallpapers/core.js');
const now=new Date('2026-10-01T12:00:00Z'),key='rabbit-wallpapers-commons-v1-anime';
function record(id=1,license='CC BY-SA 4.0'){
  return {pageid:id,title:'File:Original anime illustration.png',imageinfo:[{width:2000,height:3000,mime:'image/png',url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Anime.png?utm_source=test',thumburl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Anime.png/960px-Anime.png?utm_source=test',descriptionurl:'https://commons.wikimedia.org/wiki/File:Anime.png',extmetadata:{Artist:{value:'<a href="https://example.com">Painter &amp; friend</a>'},LicenseShortName:{value:license},LicenseUrl:{value:'http://creativecommons.org/licenses/by-sa/4.0'},Categories:{value:'Anime illustrations'},ImageDescription:{value:'Original character'}}}]};
}
function memory(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),values};}
const fetcher=async()=>({ok:true,json:async()=>({query:{pages:{1:record()}}})});

test('plain metadata is rendered as text and entities are decoded safely',()=>{
  assert.equal(commons.plainText('<b>A &amp; B</b> &#65; &#x1f431; &quot; &apos; &lt; &gt; &nbsp;'),'A & B A 🐱 " \' < >');
  assert.equal(commons.plainText(null),'');assert.equal(commons.plainText('&#0; &#99999999;'),'');
  assert.equal(commons.plainText('x'.repeat(1000)).length,500);
});
test('ingestion keeps actual dimensions, attribution, license, source, and removes tracking',()=>{
  const [item]=commons.normalizeCommons([record(),record()],'anime');
  assert.equal(item.id,'commons-1');assert.equal(item.artist,'Painter & friend');assert.equal(item.license,'CC BY-SA 4.0');
  assert.equal(item.licenseUrl,'https://creativecommons.org/licenses/by-sa/4.0/');assert.equal(item.height,3000);
  assert.equal(new URL(item.image).search,'');assert.equal(new URL(item.download).search,'');assert.deepEqual(item.categories,['anime','illustration']);
  assert.deepEqual(commons.normalizeCommons([item.commonsRecord],'anime'),[item]);
  assert.equal(core.filterWallpapers([item],{category:'anime',orientation:'portrait'}).length,1);
  assert.equal(core.filterWallpapers([item],{category:'city'}).length,0);
});
test('licenses require explicit accepted markers and matching CC license links',()=>{
  for(const license of ['CC0','Public domain','CC BY 3.0','CC BY-SA 2.0']){
    const raw=record(1,license);
    raw.imageinfo[0].extmetadata.LicenseUrl.value='https://creativecommons.org/licenses/'+(license.includes('BY-SA')?'by-sa':'by')+'/'+(license.endsWith('2.0')?'2.0':'3.0')+'/';
    assert.equal(commons.normalizeCommons([raw],'nature').length,1);
  }
  for(const license of ['Copyrighted','CC BY-NC 4.0','CC BY-ND 4.0','Free','',null])assert.equal(commons.normalizeCommons([record(1,license)],'anime').length,0);
  const raw=record();raw.imageinfo[0].extmetadata.LicenseUrl.value='https://evil.example/licenses/by-sa/4.0';assert.equal(commons.normalizeCommons([raw],'anime').length,0);
  raw.imageinfo[0].extmetadata.LicenseUrl.value='https://creativecommons.org/licenses/by-sa/4.0/';raw.imageinfo[0].extmetadata.Artist.value='';assert.equal(commons.normalizeCommons([raw],'anime').length,0);
});
test('unsafe, pending, unsupported, or small files cannot enter the gallery',()=>{
  const mutations=[raw=>raw.pageid='1',raw=>raw.pageid=-1,raw=>raw.title='other',raw=>raw.imageinfo=[],raw=>delete raw.imageinfo[0].extmetadata,raw=>raw.imageinfo[0].width=300,raw=>raw.imageinfo[0].height=NaN,raw=>raw.imageinfo[0].mime='image/svg+xml',raw=>raw.imageinfo[0].url='javascript:alert(1)',raw=>raw.imageinfo[0].url='https://upload.wikimedia.org@evil.example/wikipedia/commons/foo.jpg',raw=>raw.imageinfo[0].thumburl='https://evil.example/image.jpg',raw=>raw.imageinfo[0].descriptionurl='https://evil.example/wiki/File:X',raw=>raw.imageinfo[0].extmetadata.Restrictions={value:'Restricted'},raw=>raw.imageinfo[0].extmetadata.Categories.value='License review needed',raw=>raw.imageinfo[0].extmetadata.Categories.value='Hentai in anime and manga'];
  for(const mutate of mutations){const raw=record();mutate(raw);assert.deepEqual(commons.normalizeCommons([raw],'anime'),[]);}
  assert.deepEqual(commons.normalizeCommons(null,'anime'),[]);assert.deepEqual(commons.normalizeCommons([null],'anime'),[]);assert.deepEqual(commons.normalizeCommons([record()],'unknown'),[]);
  const uploadThumb=record();uploadThumb.imageinfo[0].thumburl='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Anime.png/800px-Anime.png';assert.equal(commons.normalizeCommons([uploadThumb],'anime').length,1);
  const noArtist=record(1,'CC0');delete noArtist.imageinfo[0].extmetadata.Artist;assert.equal(commons.normalizeCommons([noArtist],'anime')[0].artist,'作者未注明');
  const ai=record();ai.imageinfo[0].extmetadata.Categories.value='AI-generated anime illustrations';assert.ok(commons.normalizeCommons([ai],'anime')[0].tags.includes('AI 插画'));
});
test('fresh requests specify category, MIME, CORS and license metadata; daily cache avoids refetch',async()=>{
  const storage=memory();let url;
  const result=await commons.loadCommons({category:'anime',now,storage,fetcher:async value=>{url=new URL(value);return fetcher();}});
  assert.equal(result.state,'fresh');assert.equal(url.searchParams.get('origin'),'*');assert.equal(url.searchParams.get('gcmtitle'),'Category:Anime illustrations');
  assert.match(url.searchParams.get('iiprop'),/mime/);assert.match(url.searchParams.get('iiprop'),/extmetadata/);
  const cached=await commons.loadCommons({category:'anime',now,storage,fetcher:()=>{throw Error('must not request');}});assert.equal(cached.state,'cached');assert.deepEqual(cached.items,result.items);
  await assert.rejects(commons.loadCommons({category:'unknown',fetcher}),/分类不存在/);
});
test('network, invalid payload and non-OK responses retain last valid cache or bundled fallback',async()=>{
  const old=JSON.stringify({version:1,day:'2026-09-30',records:[record()]});const storage=memory({[key]:old});
  for(const fail of [async()=>{throw Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({})}),async()=>({ok:true,json:async()=>{throw Error('JSON');}})]){
    const result=await commons.loadCommons({category:'anime',now,storage,fetcher:fail});assert.equal(result.state,'stale');assert.equal(result.items.length,1);assert.equal(storage.values.get(key),old);
  }
  const fail=async()=>{throw Error('offline');};
  assert.equal((await commons.loadCommons({category:'anime',now,fetcher:fail,fallback:[record()]})).state,'stale');
  assert.equal((await commons.loadCommons({category:'anime',fetcher:fail})).state,'unavailable');
});
test('corrupt, wrong-schema, private and full storage still allow fresh data',async()=>{
  for(const storage of [undefined,memory({[key]:'bad json'}),memory({[key]:JSON.stringify({version:99,records:[record()]})}),{getItem(){throw Error('private');},setItem(){throw Error('full');}}]){
    assert.equal((await commons.loadCommons({category:'anime',now,storage,fetcher})).state,'fresh');
  }
});
test('timeout covers a hanging response body, aborts request and restores fallback',async()=>{
  let signal;
  const result=await commons.loadCommons({category:'anime',now,timeout:10,fallback:[record()],fetcher:async(url,options)=>{signal=options.signal;return {ok:true,json:()=>new Promise(()=>{})};}});
  assert.equal(result.state,'stale');assert.equal(signal.aborted,true);
});
test('bundled snapshot revalidates every license and all category feeds contain real images',()=>{
  const snapshot=require('../source/wallpapers/data/open-images.json');
  for(const key of Object.keys(commons.categories)){
    const items=commons.normalizeCommons(snapshot.records[key],key);assert.ok(items.length>0);assert.equal(items.length,snapshot.records[key].length);
    assert.ok(items.every(item=>item.license==='CC0'||item.license==='Public domain'||/^CC BY(-SA)? /.test(item.license)));
  }
});
