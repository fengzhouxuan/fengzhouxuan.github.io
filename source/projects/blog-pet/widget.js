/* Mount the same isolated companion on the blog and its demo page. */
(function(){
  'use strict';
  if(document.querySelector('blog-companion'))return;
  const base=new URL('.',document.currentScript.src);
  const host=document.createElement('blog-companion');
  const root=host.attachShadow({mode:'open'});
  document.body.appendChild(host);

  function loadScript(file,globalName){
    if(window[globalName])return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=new URL(file,base).href;
      script.onload=resolve;script.onerror=()=>reject(Error('Companion script unavailable'));
      document.head.appendChild(script);
    });
  }

  const styles=new Promise((resolve,reject)=>{
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=new URL('widget.css',base).href;
    link.onload=resolve;link.onerror=()=>reject(Error('Companion styles unavailable'));
    root.appendChild(link);
  });

  async function start(){
    try{
      const [markup]=await Promise.all([
        fetch(new URL('widget.html',base)).then(response=>{
          if(!response.ok)throw Error('Companion markup unavailable');
          return response.text();
        }),styles,loadScript('core.js','BlogPet'),loadScript('motion.js','BlogPetMotion'),
        loadScript('renderer.js','BlogPetRenderer'),loadScript('app.js','BlogCompanion')
      ]);
      const template=document.createElement('template');
      template.innerHTML=markup;
      root.appendChild(template.content.cloneNode(true));
      const syncTheme=()=>host.classList.toggle('night',document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('night'));
      syncTheme();
      const observer=new MutationObserver(syncTheme);
      observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
      observer.observe(document.body,{attributes:true,attributeFilter:['class']});
      await window.BlogCompanion.mount(root,{assetBase:base.href,controls:document,host});
    }catch(e){
      host.remove();console.warn('柚柚暂时没能加载，刷新后再试。');
    }
  }
  start();
})();
