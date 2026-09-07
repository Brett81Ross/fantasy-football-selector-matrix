(() => {
  const APK_URL='https://github.com/Brett81Ross/cactusbyte-studios/releases/download/android-latest/Fantasy-Football-Matrix.apk';
  const APP_NAME='Fantasy Football Matrix';
  const native=()=>/CactusByteNative\/1\.0/i.test(navigator.userAgent),ios=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt',e=>e.preventDefault());
  function notice(m){let t=document.getElementById('cactusbyte-native-install-toast');if(!t){t=document.createElement('div');t.id='cactusbyte-native-install-toast';Object.assign(t.style,{position:'fixed',left:'50%',bottom:'86px',transform:'translateX(-50%)',zIndex:'2147483647',maxWidth:'min(92vw,420px)',padding:'10px 14px',borderRadius:'999px',background:'#07100c',border:'1px solid rgba(57,255,20,.55)',color:'#f4fff1',font:'700 12px/1.35 system-ui,sans-serif',boxShadow:'0 12px 32px rgba(0,0,0,.45)',textAlign:'center'});document.body.appendChild(t)}t.textContent=m;t.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.hidden=true,3200)}
  function install(){if(native())return notice(`${APP_NAME} is already running as the installed Android app.`);if(ios())return notice('Native iPhone/iPad installation will use TestFlight or the App Store — no browser shortcut.');notice(`Downloading the real ${APP_NAME} Android app…`);window.location.assign(APK_URL)}
  function mount(){const share=document.getElementById('shareModal');if(!share)return;let b=document.getElementById('shareInstallApp');if(!b){b=document.createElement('button');b.id='shareInstallApp';b.type='button';b.className='secondary';b.textContent='⬇ Install App';b.addEventListener('click',install);const nativeShare=document.getElementById('nativeShare');if(nativeShare)nativeShare.insertAdjacentElement('afterend',b);else share.querySelector('.sheet')?.appendChild(b)}else b.hidden=false}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
