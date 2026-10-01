const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../source/projects/blog-pet/core.js');
const now=1790841600000;
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};

test('first visit and invalid saved data produce bounded defaults',()=>{
  assert.deepEqual(core.normalize(null,now),{version:1,fullness:65,affection:35,sleeping:false,feeds:0,outfit:'sage',autoOutfit:true,position:null,minimized:false,updatedAt:now});
  assert.equal(core.normalize({version:99,fullness:100},now).fullness,65);
  const state=core.normalize({version:1,fullness:Infinity,affection:-20,sleeping:'true',feeds:-1,updatedAt:NaN},now);
  assert.equal(state.fullness,65);assert.equal(state.affection,0);assert.equal(state.sleeping,false);assert.equal(state.feeds,0);
  assert.equal(core.normalize({version:1,fullness:200,affection:200,feeds:1.5},now).fullness,100);
  assert.equal(core.normalize({version:1,affection:200},now).affection,100);
});
test('hunger decays over elapsed time without double applying or accepting future timestamps',()=>{
  const original=core.normalize(null,now);
  const later=core.normalize(original,now+2*3600000);
  assert.equal(later.fullness,59);
  assert.equal(core.normalize(later,now+2*3600000).fullness,59);
  assert.equal(core.normalize(original,now-3600000).fullness,65);
  assert.equal(core.normalize(original,now+48*3600000).fullness,0);
});
test('petting increases affection and changes response for close companions',()=>{
  const initial=core.normalize(null,now);
  const result=core.interact(initial,'pet',now);
  assert.equal(result.state.affection,41);assert.equal(result.mood,'happy');assert.equal(initial.affection,35);
  assert.match(core.interact({...initial,affection:99},'pet',now).message,/最喜欢/);
  assert.equal(core.interact({...initial,affection:99},'pet',now).state.affection,100);
});
test('feeding counts accepted meals, saturates and rejects food when full',()=>{
  const state=core.normalize(null,now);
  const result=core.interact(state,'feed',now);
  assert.equal(result.state.fullness,87);assert.equal(result.state.feeds,1);assert.equal(result.state.affection,39);assert.equal(result.mood,'eating');
  const last=core.interact({...state,fullness:94,affection:99},'feed',now);
  assert.equal(last.state.fullness,100);assert.equal(last.state.affection,100);
  const full=core.interact(last.state,'feed',now);
  assert.equal(full.state.feeds,1);assert.equal(full.mood,'happy');assert.match(full.message,/撑/);
});
test('sleep blocks feeding and petting until explicitly woken',()=>{
  const asleep=core.interact(core.normalize(null,now),'sleep',now);
  assert.equal(asleep.state.sleeping,true);assert.equal(asleep.mood,'sleeping');
  for(const action of ['feed','pet','stretch']){
    const result=core.interact(asleep.state,action,now);
    assert.deepEqual(result.state,asleep.state);assert.equal(result.mood,'sleeping');
  }
  const awake=core.interact(asleep.state,'sleep',now);
  assert.equal(awake.state.sleeping,false);assert.equal(awake.mood,'idle');
  assert.throws(()=>core.interact(asleep.state,'unknown',now),/未知/);
});
test('stretching preserves relationship and meal counters',()=>{
  const state=core.normalize(null,now);
  const result=core.interact(state,'stretch',now);
  assert.deepEqual(result.state,state);assert.equal(result.mood,'stretching');assert.match(result.message,/放松/);
});
test('state survives reload, corrupt JSON and unsupported storage degrade gracefully',()=>{
  const storage=memory();
  const state=core.interact(core.normalize(null,now),'feed',now).state;
  assert.equal(core.save(storage,state),true);assert.deepEqual(core.load(storage,now),state);
  assert.deepEqual(core.load({getItem:()=>'{bad'},now),core.normalize(null,now));
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('full');}};
  assert.deepEqual(core.load(denied,now),core.normalize(null,now));assert.equal(core.save(denied,state),false);
  assert.deepEqual(core.load(undefined,now),core.normalize(null,now));assert.equal(core.save(undefined,state),false);
});

test('wardrobe cycles every outfit once and wraps without changing interaction state',()=>{
  const initial={...core.normalize(null,now),sleeping:true,affection:88,feeds:3,autoOutfit:false};
  let state=initial;
  const seen=new Set();
  for(let i=0;i<core.outfits.length;i++){
    state=core.nextOutfit(state,now);
    seen.add(state.outfit);
    assert.equal(state.sleeping,true);assert.equal(state.affection,88);assert.equal(state.feeds,3);assert.equal(state.autoOutfit,false);
  }
  assert.equal(seen.size,core.outfits.length);assert.deepEqual(state,initial);
  assert.equal(core.nextOutfit(undefined,now).outfit,'lavender');
});

test('old saves and unknown outfits migrate; wardrobe selection and rotation preference persist',()=>{
  for(const outfit of [undefined,null,'missing','../../unsafe']){
    const state=core.normalize({version:1,outfit},now);
    assert.equal(state.outfit,'sage');assert.equal(state.autoOutfit,true);
  }
  const storage=memory();
  const state=core.normalize({version:1,outfit:'sailor',autoOutfit:false},now);
  assert.equal(core.save(storage,state),true);
  assert.deepEqual(core.load(storage,now),state);
  assert.equal(core.interact(state,'pet',now).state.outfit,'sailor');
  assert.equal(core.interact(state,'sleep',now).state.autoOutfit,false);
});

test('positions migrate safely, clamp invalid saved ratios, and persist with minimized state',()=>{
  for(const position of [undefined,null,{},'bad',{x:NaN,y:1},{x:0,y:Infinity}]){
    assert.equal(core.normalize({version:1,position},now).position,null);
  }
  const state=core.normalize({version:1,position:{x:-4,y:5},minimized:true},now);
  assert.deepEqual(state.position,{x:0,y:1});assert.equal(state.minimized,true);
  assert.equal(core.normalize({version:1,minimized:'true'},now).minimized,false);
  const storage=memory();core.save(storage,state);assert.deepEqual(core.load(storage,now),state);
});

test('dragging clamps all edges and round-trips positions without leaving the viewport',()=>{
  const viewport={width:800,height:600},size={width:160,height:240};
  assert.deepEqual(core.clampPoint({x:-100,y:999},viewport,size),{x:12,y:348});
  assert.deepEqual(core.clampPoint({x:999,y:-100},viewport,size),{x:628,y:12});
  assert.deepEqual(core.clampPoint({x:NaN,y:Infinity},viewport,size),{x:628,y:348});
  assert.deepEqual(core.positionToPoint(null,viewport,size),{x:628,y:348});
  for(const point of [{x:12,y:12},{x:628,y:348},{x:350,y:201}]){
    const saved=core.pointToPosition(point,viewport,size);
    assert.deepEqual(core.positionToPoint(saved,viewport,size),point);
  }
  const mobile={width:390,height:844};
  const moved=core.positionToPoint({x:1,y:1},mobile,size);
  assert.ok(moved.x+size.width<=mobile.width);assert.ok(moved.y+size.height<=mobile.height);
});

test('tiny and zero-sized viewports cannot produce negative coordinates or NaN',()=>{
  for(const viewport of [{width:80,height:100},{width:0,height:0},{width:160,height:240}]){
    const size={width:160,height:240};
    assert.deepEqual(core.clampPoint({x:-10,y:500},viewport,size),{x:0,y:0});
    const saved=core.pointToPosition({x:0,y:0},viewport,size);
    assert.deepEqual(saved,{x:1,y:1});
    assert.deepEqual(core.positionToPoint(saved,viewport,size),{x:0,y:0});
  }
  assert.deepEqual(core.clampPoint({x:0,y:0},{width:170,height:250},{width:160,height:240}),{x:5,y:5});
});

test('floating panels choose available space without moving the character',()=>{
  const viewport={width:800,height:600},panel={width:224,height:130};
  const bottom={x:676,y:476,width:112,height:112};
  assert.deepEqual(core.panelPoint(bottom,panel,viewport),{x:564,y:336});
  const top={x:12,y:12,width:112,height:112};
  assert.deepEqual(core.panelPoint(top,panel,viewport),{x:12,y:134});
  assert.deepEqual(bottom,{x:676,y:476,width:112,height:112});
  const point=core.panelPoint({x:600,y:200,width:112,height:112},{width:300,height:450},viewport);
  assert.deepEqual(point,{x:290,y:31});
  const right=core.panelPoint({x:12,y:200,width:112,height:112},{width:300,height:450},viewport);
  assert.deepEqual(right,{x:134,y:31});
  assert.deepEqual(core.panelPoint(top,{width:900,height:700},viewport),{x:0,y:0});
});

test('speech gives short responses time to read and bounds long messages',()=>{
  assert.equal(core.speechDuration('嗨'),4000);
  assert.equal(core.speechDuration('柚'.repeat(30)),5200);
  assert.equal(core.speechDuration('柚'.repeat(500)),7000);
  assert.equal(core.speechDuration(null),4000);
});

test('dock remains accessible for keyboard and touch but stays quiet during reading',()=>{
  assert.equal(core.dockVisible({}),false);
  for(const reason of ['hovered','focused','pinned'])assert.equal(core.dockVisible({[reason]:true}),true);
  for(const block of ['dragging','profileOpen','minimized','compact','documentHidden']){
    assert.equal(core.dockVisible({hovered:true,focused:true,pinned:true,[block]:true}),false);
  }
});
