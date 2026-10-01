function retryTime(header,now){
  const seconds=header==null?NaN:Number(header),date=Number.isFinite(seconds)?now.getTime()+seconds*1000:Date.parse(header);
  return new Date(Math.max(now.getTime()+60000,Number.isFinite(date)&&date<=8640000000000000?date:now.getTime()+3600000)).toISOString();
}
function cooldownUntil(now,...values){
  const times=values.filter(value=>typeof value==='string').map(value=>Date.parse(value)).filter(time=>Number.isFinite(time)&&time>now.getTime());
  return times.length?new Date(Math.max(...times)).toISOString():undefined;
}
module.exports={retryTime,cooldownUntil};
