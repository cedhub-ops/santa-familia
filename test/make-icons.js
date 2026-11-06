// Génère les icônes de l'app (node test/make-icons.js)
const { chromium } = require('playwright');
const path = require('path');
const svg = (scale, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
 <defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25453a"/><stop offset="1" stop-color="#16291f"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c27f"/><stop offset="1" stop-color="#b8904a"/></linearGradient>
 </defs>
 <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
 <g fill="#f6f1e7" opacity=".55"><circle cx="104" cy="120" r="4"/><circle cx="410" cy="150" r="3"/><circle cx="392" cy="360" r="4"/><circle cx="118" cy="330" r="3"/><circle cx="430" cy="252" r="2.5"/><circle cx="84" cy="230" r="2.5"/></g>
 <g transform="translate(256 270) scale(${scale}) translate(-256 -270)" fill="none" stroke="url(#gold)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">
  <path d="M256 128 L196 214 H230 L170 300 H212 L148 388 H364 L300 300 H342 L282 214 H316 Z"/>
  <path d="M256 70 l9 20 22 3 -16 15 4 22 -19 -11 -19 11 4 -22 -16 -15 22 -3 z" fill="url(#gold)" stroke-width="4"/>
 </g></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const out = path.join(__dirname, '..', 'icons');
  const jobs = [['icon-192.png',192,1,true],['icon-512.png',512,1,true],['apple-touch-icon.png',180,1,false],['icon-maskable-512.png',512,0.74,false],['../captures/icone.png',512,1,true]];
  for (const [name,size,scale,rounded] of jobs) {
    await p.setViewportSize({width:size,height:size});
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(scale,rounded).replace('<svg ','<svg width="'+size+'" height="'+size+'" ')}</body></html>`);
    await p.screenshot({path: path.join(out,name), omitBackground: true});
  }
  await b.close();
})();
