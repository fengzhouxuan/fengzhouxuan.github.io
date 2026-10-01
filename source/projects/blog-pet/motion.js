/* Deterministic animation timing; shared by the renderer and node tests. */
(function(root){
  'use strict';
  const clips={
    idle:{row:0,duration:5200,loop:true,frames:[0,1,2,3,4,5,6,7],weights:[17,17,17,2,2,17,17,17]},
    pet:{row:1,duration:1900,loop:false,frames:[0,1,2,3,4,5,6,7],weights:[8,11,13,13,23,12,12,8]},
    snack:{row:2,duration:2600,loop:false,frames:[0,1,2,3,4,3,4,5,6,7],weights:[5,9,10,10,12,9,12,11,11,11]},
    stretch:{row:3,duration:2400,loop:false,frames:[0,1,2,3,4,5,6,7],weights:[8,12,13,12,22,13,12,8]},
    sleep:{row:-1,duration:6000,loop:true,frames:[0],weights:[1]}
  };
  const smooth=value=>value*value*(3-2*value);

  function sample(name,elapsed){
    const clip=clips[name];if(!clip)throw Error('未知的角色动作');
    const time=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
    const done=!clip.loop && time>=clip.duration;
    const progress=clip.loop?(time%clip.duration)/clip.duration:Math.min(1,time/clip.duration);
    const total=clip.weights.reduce((a,b)=>a+b,0);
    let offset=0,index=clip.frames.length-1,local=1;
    for(let i=0;i<clip.frames.length;i++){
      const end=offset+clip.weights[i]/total;
      if(progress<end){index=i;local=(progress-offset)/(end-offset);break;}
      offset=end;
    }
    const frame=clip.frames[index];
    const next=clip.frames[clip.loop?(index+1)%clip.frames.length:Math.min(index+1,clip.frames.length-1)];
    // Quick blinks remain crisp; hand movements soften near each pose boundary.
    const mix=done || next===frame || (name==='idle' && (frame===3 || next===3))?0:smooth(Math.max(0,(local-.55)/.45));
    return {name,row:clip.row,frame,next,mix,progress,done,remaining:clip.loop?Infinity:Math.max(0,clip.duration-time)};
  }

  function createTimeline(now=0){
    let name='idle',started=now,pausedAt=null;
    function read(time){
      const value=sample(name,(pausedAt===null?time:pausedAt)-started);
      if(value.done){
        const completed=name;started+=clips[name].duration;name='idle';
        return {...sample(name,(pausedAt===null?time:pausedAt)-started),completed};
      }
      return value;
    }
    function play(next,time,restart=false){
      if(!clips[next])throw Error('未知的角色动作');
      const current=read(time);
      if(next!==name || restart){name=next;started=pausedAt===null?time:pausedAt;}
      return next===current.name && !restart?current.remaining:clips[next].loop?Infinity:clips[next].duration;
    }
    function pause(time){if(pausedAt===null)pausedAt=time;}
    function resume(time){if(pausedAt!==null){started+=Math.max(0,time-pausedAt);pausedAt=null;}}
    return {read,play,pause,resume};
  }

  function atlasRows(alpha,width,height,rows=4){
    const density=new Array(height).fill(0);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(alpha[(y*width+x)*4+3]>=48)density[y]++;
    const result=[0];
    for(let row=1;row<rows;row++){
      const expected=height*row/rows,radius=height/rows*.18;
      let best=Math.round(expected),score=Infinity;
      for(let y=Math.max(result[row-1]+1,Math.floor(expected-radius));y<Math.min(height-1,expected+radius);y++){
        const value=density[y]+Math.abs(y-expected)*.02;
        if(value<score){score=value;best=y;}
      }
      result.push(best);
    }
    result.push(height);return result;
  }

  function frameBounds(alpha,imageWidth,rect){
    let left=rect.x+rect.width,right=-1,top=rect.y+rect.height,bottom=-1;
    for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++){
      if(alpha[(y*imageWidth+x)*4+3]<48)continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
  }

  const api={clips,sample,createTimeline,atlasRows,frameBounds};
  if(typeof module==='object' && module.exports)module.exports=api;else root.BlogPetMotion=api;
})(typeof window==='object'?window:globalThis);
