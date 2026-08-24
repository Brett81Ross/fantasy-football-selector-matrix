(() => {
  'use strict';
  const VERSION='1.5.1';
  function apply(){
    document.title='Fantasy Football Matrix™';
    document.querySelectorAll('.brand small,.brand-version').forEach(el=>{el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`)});
    const footer=document.querySelector('footer');if(footer)footer.innerHTML=footer.innerHTML.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);
    document.documentElement.dataset.ffmVersion=VERSION;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  setTimeout(apply,250);setTimeout(apply,1200);
})();
