function retryTime(header,now){
  const seconds=header==null?NaN:Number(header),date=Number.isFinite(seconds)?now.getTime()+seconds*1000:Date.parse(header);
  return new Date(Math.max(now.getTime()+60000,Number.isFinite(date)&&date<=8640000000000000?date:now.getTime()+3600000)).toISOString();
}
function cooldownUntil(now,...values){
  const times=values.filter(value=>typeof value==='string').map(value=>Date.parse(value)).filter(time=>Number.isFinite(time)&&time>now.getTime());
  return times.length?new Date(Math.max(...times)).toISOString():undefined;
}
function robotsDelay(value,targets){
  const groups=[];let group;
  for(const line of String(value||'').split(/\r?\n/).map(line=>line.split('#')[0].trim()).filter(Boolean)){
    const directive=line.match(/^(User-agent|Allow|Disallow|Crawl-delay|Sitemap):\s*(.*)$/i);if(!directive)throw Error('原站访问规则无法核对');
    const key=directive[1].toLowerCase(),argument=directive[2];if(key==='sitemap')continue;
    if(key==='user-agent'){
      if(!argument)throw Error('原站访问规则无法核对');
      if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group);}group.agents.push(argument.toLowerCase());
    }else{if(!group)throw Error('原站访问规则无法核对');group.rules.push({key,argument});}
  }
  const score=entry=>Math.max(...entry.agents.map(agent=>agent==='*'?0:'rabbitwallpaperstation/1.2'.startsWith(agent)?agent.length:-1));
  const specificity=Math.max(-1,...groups.map(score)),rules=groups.filter(entry=>specificity>=0&&score(entry)===specificity).flatMap(entry=>entry.rules);
  let delay=0;
  for(const rule of rules)if(rule.key==='crawl-delay'){
    const seconds=Number(rule.argument);if(!rule.argument||!Number.isFinite(seconds)||seconds<0||seconds>60)throw Error('原站请求间隔超过读取限制');delay=Math.max(delay,Math.ceil(seconds*1000));
  }
  for(const target of targets){
    const matching=rules.filter(rule=>['allow','disallow'].includes(rule.key)&&rule.argument).filter(rule=>{
      const end=rule.argument.endsWith('$'),pattern=rule.argument.slice(0,end?-1:undefined).split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
      return new RegExp('^'+pattern+(end?'$':'')).test(target);
    }).sort((a,b)=>b.argument.replace(/[*$]/g,'').length-a.argument.replace(/[*$]/g,'').length||Number(a.key==='disallow')-Number(b.key==='disallow'));
    if(matching[0]?.key==='disallow')throw Error('原站不允许读取该素材路径');
  }
  return delay;
}
module.exports={retryTime,cooldownUntil,robotsDelay};
