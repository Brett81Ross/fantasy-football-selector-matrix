module.exports = async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const source = await fetch(`${proto}://${host}/index.html`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!source.ok) throw new Error(`index.html request failed (${source.status})`);

    let html = await source.text();
    html = html
      .replaceAll('Fantasy Football Selector Matrix™', 'Fantasy Football Matrix™')
      .replaceAll('Fantasy Football Selector Matrix', 'Fantasy Football Matrix');

    const versionScript = `\n<script>\nwindow.addEventListener('DOMContentLoaded',()=>{\n  document.querySelectorAll('.brand small').forEach(el=>{el.textContent=el.textContent.replace(/v\\d+\\.\\d+\\.\\d+/, 'v1.2.1')});\n  const footer=document.querySelector('footer');\n  if(footer) footer.innerHTML=footer.innerHTML.replace(/v\\d+\\.\\d+\\.\\d+/, 'v1.2.1');\n});\n</script>\n`;
    html = html.replace('</body>', versionScript + '</body>');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).send(html);
  } catch (error) {
    console.error('app shell error', error);
    res.status(500).send('Fantasy Football Matrix is temporarily unavailable.');
  }
};
