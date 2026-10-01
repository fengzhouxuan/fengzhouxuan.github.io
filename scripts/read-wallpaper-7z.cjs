const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const oga=require('../source/wallpapers/opengameart.js');

function parse7zListing(listing,key){
  const work=oga.works[key];
  if(work?.archive!=='7z'||typeof listing!=='string'||listing.length>1024*1024)throw Error('7z 素材包目录无效');
  const parts=listing.split('\n----------\n'),method=parts[0].match(/^Method = LZMA2:(\d+)([km]?)$/m);
  const dictionary=method&&(method[2]?Number(method[1])*(method[2]==='k'?1024:1024*1024):2**Number(method[1]));
  if(parts.length!==2||!/^Type = 7z$/m.test(parts[0])||!dictionary||dictionary>64*1024*1024)throw Error('7z 素材包格式或字典大小不符合要求');
  const blocks=parts[1].trim()?parts[1].trim().split(/\n\s*\n/):[];
  if(blocks.length>250)throw Error('素材包文件数超过限制');
  const seen=new Set(),selected=[];let total=0;
  for(const block of blocks){
    const fields=Object.create(null);
    for(const line of block.split('\n')){
      const property=line.match(/^([^=\r\n]+) = (.*)$/);
      if(!property||Object.hasOwn(fields,property[1]))throw Error('7z 素材包条目格式无效');
      fields[property[1]]=property[2];
    }
    const name=fields.Path,size=Number(fields.Size);
    if(typeof name!=='string'||!name||name.length>240||!(/^[a-z0-9 _().\/-]+$/i.test(name))||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('素材包路径无效');
    if(seen.has(name.toLowerCase()))throw Error('素材包包含重复路径');seen.add(name.toLowerCase());
    if(!/^\d+$/.test(fields.Size)||!Number.isSafeInteger(size)||size>32*1024*1024)throw Error('素材包文件大小超过限制');
    total+=size;if(total>128*1024*1024)throw Error('素材包展开大小超过限制');
    if(fields.Encrypted!=='-'||Object.keys(fields).some(field=>/link|stream|device/i.test(field))||/(?:^|\s)l[rwx-]{9}(?:\s|$)/.test(fields.Attributes||''))throw Error('素材包不能包含加密文件或链接');
    if(work.member.test(name)){
      if(size<1||fields.Folder==='+'||/^D/.test(fields.Attributes||''))throw Error('图片条目不是普通文件');
      selected.push({member:name,size});
    }
  }
  return selected;
}

async function read7zImages(bytes,key,{timeout=25000}={}){
  if(oga.works[key]?.archive!=='7z'||!Buffer.isBuffer(bytes)||bytes.length>32*1024*1024||!bytes.subarray(0,6).equals(Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c])))throw Error('7z 素材包不符合格式或大小限制');
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw Error('素材包读取时限无效');
  const worker=new Worker(__filename,{workerData:{bytes,key},resourceLimits:{maxOldGenerationSizeMb:192}});
  try{
    return await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,images)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(images.map(image=>({...image,data:Buffer.from(image.data)})));};
      const timer=setTimeout(()=>finish(Error('素材包读取超时')),timeout);
      worker.once('message',message=>finish(message?.ok===true&&Array.isArray(message.images)?null:Error(message?.error||'7z 素材包解码失败'),message?.images));
      worker.once('error',()=>finish(Error('素材包解码进程失败')));
      worker.once('exit',()=>finish(Error('素材包解码进程提前结束')));
    });
  }finally{await worker.terminate();}
}

async function decode(){
  const SevenZip=require('7z-wasm'),lines=[];let output=0;
  const capture=line=>{output+=line.length;if(output>1024*1024)throw Error('素材包日志超过限制');lines.push(line);};
  // Never mount NODEFS: untrusted archive members only exist in this worker's memory.
  const seven=await SevenZip({print:capture,printErr:capture,stdin:()=>null,noInitialRun:true});
  seven.FS.writeFile('/bundle.7z',workerData.bytes);
  if(seven.callMain(['l','-slt','/bundle.7z'])!==0)throw Error('无法读取 7z 素材包目录');
  const entries=parse7zListing(lines.join('\n'),workerData.key);
  if(!entries.length)return [];
  lines.length=0;output=0;seven.FS.mkdir('/out');
  if(seven.callMain(['x','-y','-bd','-spd','-o/out','/bundle.7z',...entries.map(entry=>entry.member)])!==0)throw Error('无法展开 7z 素材包图片');
  return entries.map(({member,size})=>{
    const file='/out/'+member;
    if(!seven.FS.isFile(seven.FS.lstat(file).mode))throw Error('展开图片不是普通文件');
    const data=seven.FS.readFile(file);if(data.length!==size)throw Error('展开图片大小与目录不一致');
    return {member,data};
  });
}

if(!isMainThread)decode().then(images=>parentPort.postMessage({ok:true,images}),error=>parentPort.postMessage({ok:false,error:error instanceof Error&&error.message?error.message:'7z 素材包解码失败'}));
module.exports={parse7zListing,read7zImages};
