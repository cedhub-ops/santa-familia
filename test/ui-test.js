// Sert web/ en HTTP (comme GitHub Pages) et branche l'API sur le vrai Code.gs (doPost) simulé.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const root = path.join(__dirname, '..');
const API = 'https://script.google.com/macros/s/TEST/exec';
const ctx = { console, Buffer, Math, JSON, Date, Set, Object, String }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'), ctx);
ctx.PropertiesService.getScriptProperties().setProperty('ADMIN_CODE', 'change-moi');
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8') + '\nthis.G={doPost,adminAddParticipant,register,addIdea,login,getDashboard};', ctx);
const G = ctx.G;
['Alice','Bruno','Chloé','David','Emma'].forEach(n => G.adminAddParticipant('change-moi', n));
const tk = {}; ['Bruno','Chloé','David','Emma'].forEach(n => tk[n] = G.register(n, '1111').token);
G.addIdea(tk.Bruno, 'Alice', 'Elle adore le thé vert japonais', '');
G.addIdea(tk['Chloé'], 'Alice', 'Un cours de poterie', 'https://exemple.fr/poterie');

const types = { '.html':'text/html', '.js':'text/javascript', '.webmanifest':'application/manifest+json', '.png':'image/png' };
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  const fp = path.join(root, f);
  if (f === '/config.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(`window.SECRET_SANTA_API_URL='${API}';`); }
  if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': types[path.extname(fp)] || 'application/octet-stream'}); fs.createReadStream(fp).pipe(res);
}).listen(8765);

(async () => {
  const out = path.join(root, 'captures');
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['Pixel 7'] });
  let apiCalls = 0;
  await c.route(API, async r => {
    apiCalls++;
    const body = G.doPost({ postData: { contents: r.request().postData() } }).getContent();
    await r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body });
  });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/');
  await p.waitForSelector('#welcome:not(.hidden) .name-btn');
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker.ready));
  const manifest = await p.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).display);
  await p.screenshot({ path: out + '/1-accueil.png' });
  await p.click('text=Alice'); await p.fill('#pin1', '4321'); await p.fill('#pin2', '4321'); await p.click('#authBtn');
  await p.waitForSelector('#app:not(.hidden)');
  await p.click('[data-tab=wishes]'); await p.fill('#wishText', 'Un puzzle 1000 pièces'); await p.fill('#wishLink', 'https://exemple.fr/puzzle');
  await p.click('#tab-wishes button.primary'); await p.waitForSelector('#myWishes a'); await p.screenshot({ path: out + '/3-ma-liste.png' });
  await p.click('text=Déconnexion'); await p.waitForSelector('#welcome:not(.hidden) .name-btn');
  await p.click('text=Espace organisateur'); await p.fill('#adminCode', 'change-moi'); await p.click('text=Entrer');
  await p.waitForSelector('#adminPanel:not(.hidden)');
  await p.selectOption('#exA', 'Alice'); await p.selectOption('#exB', 'Bruno'); await p.click("text=Ajouter l'exclusion");
  await p.waitForSelector('#exList >> text=Alice');
  await p.click('#drawBtn'); await p.waitForSelector('#resetDrawBtn:not(.hidden)');
  await p.screenshot({ path: out + '/4-organisateur.png', fullPage: true });
  const giver = ['Chloé','David','Emma'].find(n => G.getDashboard(G.login(n,'1111').token).target.name === 'Alice');
  await p.click('text=Fermer'); await p.waitForSelector('#welcome:not(.hidden) .name-btn');
  await p.click('.name-btn:has-text("' + giver + '")'); await p.fill('#pin1', '1111'); await p.click('#authBtn');
  await p.waitForSelector('#drawDone:not(.hidden)'); await p.screenshot({ path: out + '/5-revelation.png' });
  await p.click('#revealCard'); await p.waitForSelector('#targetOthers a');
  await p.screenshot({ path: out + '/6-idees-cible.png', fullPage: true });
  console.log({ giver, apiCalls, serviceWorker: sw, manifestDisplay: manifest, errors: errs });
  await b.close(); srv.close();
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
