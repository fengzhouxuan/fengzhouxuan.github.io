const {unzipSync}=require('fflate');

function readZipImages(bytes,member){
  if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>32*1024*1024||!(member instanceof RegExp))throw Error('素材包不符合大小或文件规则限制');
  let entries=0,total=0;const seen=new Set();
  const files=unzipSync(bytes,{filter(file){
    if(++entries>250||!Number.isSafeInteger(file.originalSize)||file.originalSize<0||file.originalSize>32*1024*1024)throw Error('素材包文件数或大小超过限制');
    total+=file.originalSize;if(total>128*1024*1024)throw Error('素材包展开大小超过限制');
    if(seen.has(file.name))throw Error('素材包包含重复路径');seen.add(file.name);
    if(file.name.includes('\\')||file.name.split('/').some(part=>part==='..'||part==='.')||file.name.startsWith('/'))throw Error('素材包路径无效');
    return member.test(file.name);
  }});
  return Object.entries(files).map(([name,data])=>({member:name,data:Buffer.from(data)}));
}
module.exports={readZipImages};
