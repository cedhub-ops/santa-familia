const { chromium } = require('playwright');
const path = require('path');
// scale = taille du cadeau par rapport à l'icône (plus petit pour la version "maskable")
const svg = (scale, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
 <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d1453a"/><stop offset="1" stop-color="#8f2a20"/></linearGradient></defs>
 <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
 <g fill="#fff" opacity=".9"><circle cx="90" cy="96" r="7"/><circle cx="420" cy="80" r="5"/><circle cx="440" cy="400" r="6"/><circle cx="70" cy="420" r="5"/><circle cx="380" cy="190" r="4"/><circle cx="130" cy="230" r="4"/></g>
 <g transform="translate(256 276) scale(${scale}) translate(-256 -276)">
  <path d="M256 150c-30-62-112-70-112-20 0 34 60 44 112 20z" fill="#f4c542" stroke="#c9961a" stroke-width="8"/>
  <path d="M256 150c30-62 112-70 112-20 0 34-60 44-112 20z" fill="#f4c542" stroke="#c9961a" stroke-width="8"/>
  <rect x="116" y="196" width="280" height="200" rx="18" fill="#1f7a4d"/>
  <rect x="100" y="150" width="312" height="70" rx="16" fill="#27935d"/>
  <rect x="232" y="150" width="48" height="246" fill="#f4c542"/>
  <circle cx="256" cy="150" r="22" fill="#f4c542" stroke="#c9961a" stroke-width="8"/>
 </g></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const out = path.join(__dirname, '..', 'icons');
  const jobs = [['icon-192.png',192,1,true],['icon-512.png',512,1,true],['apple-touch-icon.png',180,1,false],['icon-maskable-512.png',512,0.78,false],['preview.png',512,1,true]];
  for (const [name,size,scale,rounded] of jobs) {
    await p.setViewportSize({width:size,height:size});
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(scale,rounded).replace('<svg ','<svg width="'+size+'" height="'+size+'" ')}</body></html>`);
    await p.screenshot({path: path.join(out,name), omitBackground: true});
  }
  await b.close();
})();
