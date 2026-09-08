(function(global){
  'use strict';

  const LEGAL_LINKS=Object.freeze([
    Object.freeze({label:'Terms of Use',href:'/docs/legal/TERMS_OF_USE.md'}),
    Object.freeze({label:'Privacy Policy',href:'/docs/legal/PRIVACY_POLICY.md'})
  ]);

  function makeLink(doc,item){
    const a=doc.createElement('a');
    a.href=item.href;
    a.textContent=item.label;
    a.target='_blank';
    a.rel='noopener noreferrer';
    a.setAttribute('data-ffm-legal-link',item.label);
    return a;
  }

  function mountFooter(doc){
    const footer=doc.querySelector('footer');
    if(!footer||footer.querySelector('[data-ffm-legal-footer]'))return;
    const wrap=doc.createElement('div');
    wrap.setAttribute('data-ffm-legal-footer','');
    wrap.style.marginTop='6px';
    LEGAL_LINKS.forEach((item,index)=>{
      if(index)wrap.appendChild(doc.createTextNode(' · '));
      wrap.appendChild(makeLink(doc,item));
    });
    footer.appendChild(wrap);
  }

  function mountSettings(doc){
    if(doc.querySelector('[data-ffm-legal-settings]'))return;
    const sheet=doc.querySelector('.modal.open .sheet');
    if(!sheet)return;
    const section=doc.createElement('div');
    section.setAttribute('data-ffm-legal-settings','');
    section.style.marginTop='16px';
    section.style.paddingTop='12px';
    section.style.borderTop='1px solid var(--line,#213328)';
    const title=doc.createElement('strong');
    title.textContent='Legal';
    section.appendChild(title);
    const links=doc.createElement('div');
    links.style.display='flex';
    links.style.gap='14px';
    links.style.flexWrap='wrap';
    links.style.marginTop='8px';
    LEGAL_LINKS.forEach(item=>links.appendChild(makeLink(doc,item)));
    section.appendChild(links);
    sheet.appendChild(section);
  }

  function mountLegalLinks(doc){
    if(!doc)return;
    mountFooter(doc);
    const settingsBtn=doc.getElementById('settingsBtn');
    if(settingsBtn&&!settingsBtn.dataset.ffmLegalBound){
      settingsBtn.dataset.ffmLegalBound='1';
      settingsBtn.addEventListener('click',()=>setTimeout(()=>mountSettings(doc),0));
    }
  }

  if(typeof module!=='undefined'&&module.exports){module.exports={LEGAL_LINKS,mountLegalLinks};}
  if(global&&global.document){
    if(global.document.readyState==='loading')global.document.addEventListener('DOMContentLoaded',()=>mountLegalLinks(global.document));
    else mountLegalLinks(global.document);
  }
})(typeof window!=='undefined'?window:globalThis);
