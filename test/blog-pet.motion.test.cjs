const {test}=require('node:test');
const assert=require('node:assert/strict');
const motion=require('../source/projects/blog-pet/motion.js');

test('every gesture has anticipation, intermediate poses and an exact standing end',()=>{
  for(const name of ['pet','snack','stretch']){
    const clip=motion.clips[name],seen=new Set();
    assert.equal(motion.sample(name,0).frame,0);
    for(let time=0;time<clip.duration;time+=5){
      const value=motion.sample(name,time);seen.add(value.frame);
      assert.ok(value.mix>=0 && value.mix<=1);assert.equal(value.done,false);
      assert.ok(value.remaining>0);assert.equal(value.row,clip.row);
    }
    assert.deepEqual([...seen].sort(),[0,1,2,3,4,5,6,7]);
    const end=motion.sample(name,clip.duration);
    assert.equal(end.frame,7);assert.equal(end.next,7);assert.equal(end.mix,0);
    assert.equal(end.done,true);assert.equal(end.remaining,0);
  }
});
test('idle loops seamlessly and blinks remain sharp rather than ghosting two faces',()=>{
  const clip=motion.clips.idle;
  assert.equal(motion.sample('idle',clip.duration).frame,0);
  assert.deepEqual(motion.sample('idle',123),motion.sample('idle',clip.duration+123));
  for(let time=0;time<clip.duration;time+=5){
    const value=motion.sample('idle',time);
    if(value.frame===3 || value.next===3)assert.equal(value.mix,0);
  }
  assert.ok(motion.sample('idle',clip.duration-1).mix>.99);
  assert.equal(motion.sample('sleep',1e6).remaining,Infinity);
});
test('invalid elapsed times cannot corrupt frame indices and unknown clips fail clearly',()=>{
  for(const time of [-10,NaN,Infinity,undefined])assert.equal(motion.sample('pet',time).frame,0);
  assert.equal(motion.sample('pet',1e9).done,true);
  assert.throws(()=>motion.sample('missing',0),/未知/);
  assert.throws(()=>motion.createTimeline().play('missing',1),/未知/);
});
test('one-shot completion fires once and carries any overshoot into idle',()=>{
  const timeline=motion.createTimeline(100);
  assert.equal(timeline.read(100).name,'idle');
  assert.equal(timeline.play('pet',200),1900);
  const value=timeline.read(2200);
  assert.equal(value.completed,'pet');assert.equal(value.name,'idle');
  assert.equal(value.progress,100/5200);assert.equal(timeline.read(2200).completed,undefined);
});
test('repeated petting keeps its trajectory; explicit replay and other gestures reset cleanly',()=>{
  const timeline=motion.createTimeline();
  timeline.play('pet',100);
  assert.equal(timeline.play('pet',700),1300);assert.equal(timeline.read(700).progress,600/1900);
  assert.equal(timeline.play('pet',800,true),1900);assert.equal(timeline.read(800).progress,0);
  assert.equal(timeline.play('snack',900),2600);assert.equal(timeline.read(900).frame,0);
  timeline.play('sleep',1000);assert.equal(timeline.read(1e6).name,'sleep');
  timeline.play('idle',1e6);assert.equal(timeline.read(1e6).progress,0);
});
test('hidden or collapsed playback resumes at the same pose without an elapsed-time jump',()=>{
  const timeline=motion.createTimeline();timeline.play('snack',100);
  const before=timeline.read(600);
  timeline.pause(600);timeline.pause(700);
  assert.deepEqual(timeline.read(90000),before);
  timeline.resume(90000);timeline.resume(90010);
  assert.deepEqual(timeline.read(90000),before);
  assert.equal(timeline.read(92100).completed,'snack');
  timeline.pause(93000);timeline.play('stretch',94000);
  assert.equal(timeline.read(95000).progress,0);
  timeline.resume(95000);assert.equal(timeline.read(95050).progress,50/2400);
});
test('alpha gutter detection tolerates sheets whose painted rows are not exactly equal',()=>{
  const width=16,height=80,alpha=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)alpha[(y*width+x)*4+3]=255;
  for(const y of [22,39,62])for(let x=0;x<width;x++)alpha[(y*width+x)*4+3]=0;
  assert.deepEqual(motion.atlasRows(alpha,width,height),[0,22,39,62,80]);
  assert.deepEqual(motion.atlasRows(new Uint8ClampedArray(width*height*4),width,height),[0,20,40,60,80]);
  assert.deepEqual(motion.atlasRows(alpha,width,height,1),[0,80]);
});
test('frame bounds exclude transparent margins, faint noise and neighboring cells',()=>{
  const width=12,alpha=new Uint8ClampedArray(width*12*4);
  for(const [x,y,a] of [[3,2,255],[7,8,80],[0,0,47],[11,11,255]])alpha[(y*width+x)*4+3]=a;
  assert.deepEqual(motion.frameBounds(alpha,width,{x:0,y:0,width:10,height:10}),{x:3,y:2,width:5,height:7});
  assert.equal(motion.frameBounds(alpha,width,{x:0,y:9,width:10,height:3}),null);
});
