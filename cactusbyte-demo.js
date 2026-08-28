/* CactusByte optional live-screen 60-second demo */
(()=>{
  if(document.querySelector('script[data-cactusbyte-demo="fantasy-football-matrix"]'))return;
  const script=document.createElement('script');
  script.src='https://cactusbyte-studios.vercel.app/demo-embed.js';
  script.dataset.cactusbyteDemo='fantasy-football-matrix';
  script.defer=true;
  document.body.appendChild(script);
})();
