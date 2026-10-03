const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../themes/flatpaper/source/js/search-core.js');

let generate;
const previousHexo=global.hexo;
global.hexo={extend:{generator:{register(name,handler){assert.equal(name,'flatpaper_search_index');generate=handler;}}}};
try {require('../themes/flatpaper/scripts/search-index.js');}
finally {if(previousHexo===undefined)delete global.hexo;else global.hexo=previousHexo;}

const collection=(values=[])=>({sort(){return this;},toArray(){return values.slice();}});
const date={format:()=> '2026-10-03'};
function build({posts=[],pages=[],projects,menu={},limit=0,root='/'}={}){
  const helpers={
    strip_html:value=>value.replace(/<[^>]*>/g,''),
    url_for:value=>/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value)?value:root+String(value).replace(/^\//,'')
  };
  const context={theme:{config:{search:{limit},menu}},extend:{helper:{get:name=>helpers[name]}}};
  return JSON.parse(generate.call(context,{posts:collection(posts),pages:collection(pages),data:{projects}}).data);
}

test('search accepts only safe site-relative and HTTP links',()=>{
  for(const url of ['/posts/a/','/notes/?q=%E4%B8%AD','https://example.com/a','HTTP://example.com'])assert.equal(core.isSafeUrl(url),true,url);
  for(const url of [undefined,null,12,'','javascript:alert(1)','data:text/html,a','//example.com','https://','/\\example.com','/a b','/a\n','relative/path'])assert.equal(core.isSafeUrl(url),false,String(url));
});

test('blank or unsupported search input returns no results',()=>{
  for(const query of ['',null,undefined,'  \t '])assert.deepEqual(core.search([],query),[]);
  assert.deepEqual(core.search(null,'a'),[]);
  assert.deepEqual(core.search([null,{title:'a',url:'javascript:alert(1)'}],'a'),[]);
});

test('full-text search reaches content beyond the former 200-character cutoff',()=>{
  const item={title:'同步规则',url:'/notes/fixed/',type:'learning',text:'开头'.repeat(180)+' 定点运算和舍入规则 '+'结尾'.repeat(100)};
  const [hit]=core.search([item],'定点');
  assert.equal(hit.item,item);
  assert.match(hit.snippet,/定点运算/);
  assert.ok(hit.snippet.startsWith('…'));
  assert.ok(hit.snippet.endsWith('…'));
  assert.ok(hit.snippet.length<=152);
});

test('exact and partial title matches rank above body-only matches with stable ties',()=>{
  const entries=[
    {title:'其他',url:'/body/',text:'JavaScript'},
    {title:'JavaScript 运行时',url:'/prefix/',text:'学习路径'},
    {title:'认识 JavaScript',url:'/partial/',text:''},
    {title:'JavaScript',url:'/exact/',text:''},
    {title:'另一个',url:'/tie/',text:'javascript'}
  ];
  assert.deepEqual(core.search(entries,' JAVASCRIPT ').map(hit=>hit.item.url),['/exact/','/prefix/','/partial/','/body/','/tie/']);
  assert.equal(core.search(entries,'运行时')[0].snippet,'学习路径');
});

test('multiple words can match across title and text and all words are required',()=>{
  const entries=[{title:'Cocos 运行时',url:'/cocos/',text:'帧同步定点数规则'},{title:'Cocos 运行时',url:'/other/',text:'网络'}];
  assert.equal(core.search(entries,' COCOS   定点数 ')[0].item.url,'/cocos/');
  assert.deepEqual(core.search(entries,'Cocos 不存在'),[]);
});

test('type filters accept old post indexes and search treats regex characters literally',()=>{
  const entries=[{title:'[C++]',url:'/post/',text:'a.b'},{title:'[C++]',url:'/project/',type:'project',text:'a.b'}];
  assert.equal(core.search(entries,'[C++]','post')[0].item.url,'/post/');
  assert.equal(core.search(entries,'a.b','project')[0].item.url,'/project/');
  assert.deepEqual(core.search(entries,'[C++]','learning'),[]);
  assert.equal(core.search([{url:'/empty/'}],'empty').length,0);
});

test('search preserves input records and returns all matches instead of silently truncating at 12',()=>{
  const entries=Array.from({length:18},(_,i)=>({title:'匹配 '+i,url:'/item/'+i,text:''}));
  const before=JSON.stringify(entries);
  assert.equal(core.search(entries,'匹配').length,18);
  assert.equal(JSON.stringify(entries),before);
});

test('generator includes post and page full text, dates and content types',()=>{
  const text='前文'.repeat(150)+'正文末尾';
  const entries=build({posts:[{title:'普通文章',path:'posts/a/',excerpt:'摘要',content:'<p>'+text+'</p>',date}],pages:[
    {title:'定点笔记',path:'/rabbit-holes/simulation/fixed/',content:'<p>统一规则</p>'},
    {title:'项目工坊',path:'projects/',content:'可运行的项目'},
    {title:'关于',path:'about/',content:'关于本站'}
  ]});
  assert.equal(entries[0].text,text);
  assert.equal(entries[0].type,'post');
  assert.equal(entries[0].date,'2026-10-03');
  assert.deepEqual(entries.slice(1).map(item=>item.type),['learning','project','page']);
  assert.ok(entries.slice(1).every(item=>item.date===''));
});

test('generator honors post limits, draft and opt-out flags, and excludes technical readmes',()=>{
  const posts=[{title:'第一篇',path:'posts/one/',excerpt:'摘要'},{title:'第二篇',path:'posts/two/'}];
  assert.equal(build({posts,limit:1,pages:[{title:'页面',path:'about/'}]}).length,2);
  assert.deepEqual(build({posts:[{title:'草稿',path:'draft/',published:false},{title:'私有',path:'private/',search:false}],pages:[
    {title:'404',path:'404.html'},{title:'文档',path:'projects/a/README.html'},
    {title:'隐藏',path:'hidden/',search:false},{title:'草稿',path:'draft/',published:false},
    {path:'untitled/'},{title:'没有路径'}
  ]}),[]);
});

test('generator decodes entities while preserving searchable literal markup as text',()=>{
  const [item]=build({posts:[{title:'实体',path:'entities/',content:'&lt;img onerror=&quot;x&quot;&gt; &amp; &#x4e2d; &#25991; &apos;x&apos; &#0; &#x110000;'}]});
  assert.equal(item.text,'<img onerror="x"> & 中 文 \'x\' &#0; &#x110000;');
  assert.equal(core.search([item],'<img')[0].item,item);
});

test('generator indexes actual project names, descriptions and tags with safe live or source destinations',()=>{
  const groups=[{group_name:'在线工具',project_list:[
    {name:'九宫图切分器',description:'图像处理',eyebrow:'Web Tool',tags:['Canvas'],live:'/projects/slicer/'},
    {name:'桌面工具',description:'图像处理',source:'https://example.com/tool'},
    {name:'无地址'},null,{name:'危险地址',source:'javascript:alert(1)'}
  ]},null,{group_name:'空分组'}];
  const entries=build({projects:groups});
  assert.equal(entries.length,2);
  assert.equal(core.search(entries,'Canvas','project')[0].item.title,'九宫图切分器');
  assert.equal(entries[1].url,'https://example.com/tool');
  assert.ok(entries.every(item=>item.type==='project'));
  assert.equal(build({projects:groups[0]}).length,2);
});

test('generator indexes menu aliases and nested entries without duplicate pages or unsafe links',()=>{
  const entries=build({pages:[{title:'兔子洞',path:'rabbit-holes/',content:'完整正文'}],menu:{
    '兔子洞':{link:'/rabbit-holes/'},
    '音乐站':'/music/',
    '分组':{item:{视频:{href:'/video/',label:'私人放映室'},错误:{link:'//evil.example'}}},
    '更多':{item:[{name:'壁纸站',url:'/wallpapers/'},'/tools/',null]},
    '锚点':'#section','空':null
  }});
  assert.equal(entries.filter(item=>item.url==='/rabbit-holes/').length,1);
  assert.equal(entries[0].text,'完整正文');
  assert.ok(entries.some(item=>item.title==='私人放映室'&&item.type==='site'));
  assert.ok(entries.some(item=>item.url==='/wallpapers/'));
  assert.ok(entries.some(item=>item.url==='/tools/'));
  assert.equal(entries.length,5);
});

test('generator respects a non-root blog URL and handles absent optional page data',()=>{
  assert.equal(build({root:'/blog/',pages:[{title:'笔记',path:'rabbit-holes/a/'}]})[0].url,'/blog/rabbit-holes/a/');
  const context={theme:{config:{}},extend:{helper:{get:name=>name==='url_for'?value=>'/'+value:value=>value}}};
  const result=generate.call(context,{posts:collection([])});
  assert.equal(result.path,'flatpaper-search.json');
  assert.deepEqual(JSON.parse(result.data),[]);
});
