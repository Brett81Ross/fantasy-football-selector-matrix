const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  const file = path.join(process.cwd(), 'index.html');
  let html = fs.readFileSync(file, 'utf8');

  html = html
    .replaceAll('Fantasy Football Selector Matrix™', 'Fantasy Football Matrix™')
    .replaceAll('Fantasy Football Selector Matrix', 'Fantasy Football Matrix');

  const versionScript = `\n<script>\nwindow.addEventListener('DOMContentLoaded',()=>{\n  document.querySelectorAll('.brand small').forEach(el=>{el.textContent=el.textContent.replace(/v\\d+\\.\\d+\\.\\d+/, 'v1.2.1')});\n  const footer=document.querySelector('footer');\n  if(footer) footer.innerHTML=footer.innerHTML.replace(/v\\d+\\.\\d+\\.\\d+/, 'v1.2.1');\n});\n</script>\n`;
  html = html.replace('</body>', versionScript + '</body>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(html);
};
