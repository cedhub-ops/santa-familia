// Parcours complet sur téléphone simulé : node test/ui-test.js
// Sert l'app en HTTP (comme GitHub Pages) et branche l'API sur le vrai Code.gs (doPost) simulé.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const root = path.join(__dirname, '..');
const API = 'https://script.google.com/macros/s/TEST/exec';
const ctx = { console, Buffer, Math, JSON, Date, Set, Object, String, Number, Array }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'), ctx);
ctx.PropertiesService.getScriptProperties().setProperty('ADMIN_CODE', 'sapin-2026');
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8') +
  '\nthis.G={doPost,adminAddParticipant,adminSetColor,adminSaveSettings,register,addIdea,login,getDashboard};', ctx);
const G = ctx.G, C = 'sapin-2026';
const people = [['Cédric', 'Hubert'], ['Vico', 'Hubert'], ['Jules', 'Hubert'], ['Adrien', 'Dupont'], ['Anaïs', 'Dupont'],
  ['Abel', 'Dupont'], ['Fabien', 'Lambert'], ['Juliette', 'Lambert'], ['Mamoune', '']];
people.forEach(([n, f]) => G.adminAddParticipant(C, n, f));
G.adminSetColor(C, 'family', 'Hubert', '#3f7a5c'); G.adminSetColor(C, 'family', 'Dupont', '#a4452f'); G.adminSetColor(C, 'family', 'Lambert', '#3b5b86');
G.adminSetColor(C, 'member', 'Mamoune', '#c9a45c');
const d5 = new Date(Date.now() + 12 * 86400000);
G.adminSaveSettings(C, { eventDate: d5.toISOString().slice(0, 10), budget: '30 €' });
const tk = {}; people.slice(1).forEach(([n]) => tk[n] = G.register(n, '1111').token);
G.addIdea(tk.Vico, 'Mamoune', 'Elle adore le thé vert japonais', '');
G.addIdea(tk.Adrien, 'Mamoune', 'Un cours de poterie', 'https://exemple.fr/poterie');
G.addIdea(tk.Mamoune, 'Mamoune', 'Un plaid tout doux', '');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  if (f === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`window.SECRET_SANTA_API_URL='${API}';`); }
  const fp = path.join(root, f);
  if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res);
}).listen(8765);

(async () => {
  const out = path.join(root, 'captures');
  fs.readdirSync(out).filter(f => /^\d-/.test(f)).forEach(f => fs.unlinkSync(path.join(out, f)));
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['Pixel 7'] });
  await c.route(API, async r => r.fulfill({ status: 200, contentType: 'application/json',
    body: G.doPost({ postData: { contents: r.request().postData() } }).getContent() }));
  await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const shot = (n, full) => p.screenshot({ path: path.join(out, n + '.png'), fullPage: !!full });
  await p.goto('http://localhost:8765/');
  await p.waitForSelector('#welcome:not(.hidden) .name-btn');
  await shot('1-accueil', true);

  // Lien perso : prénom déjà choisi
  await p.goto('http://localhost:8765/?p=' + encodeURIComponent('Cédric'));
  await p.waitForSelector('#authCard:not(.hidden)');
  await shot('2-lien-perso');
  await p.fill('#pin1', '4321'); await p.fill('#pin2', '4321'); await p.click('#authBtn');
  await p.waitForSelector('#app:not(.hidden)');
  await shot('3-app-cloche');
  await p.click('.bell'); await p.waitForSelector('#notifs:not(.hidden)');
  await shot('4-notifications');
  await p.click('#notifTodoList .notif >> nth=0'); await p.waitForSelector('#tab-wishes:not(.hidden)');
  await p.fill('#wishText', 'Un puzzle 1000 pièces'); await p.click('#tab-wishes button.btn.primary');
  await p.waitForSelector('#myWishes li:not(.muted)');

  // Organisateur
  await p.click('text=⋯'); await p.click('text=Se déconnecter');
  await p.waitForSelector('#welcome:not(.hidden) .name-btn');
  await p.click('text=Espace organisateur'); await p.fill('#adminCode', C); await p.click('text=Entrer');
  await p.waitForSelector('#adminPanel:not(.hidden)');
  await p.selectOption('#exA', 'Mamoune'); await p.selectOption('#exB', 'F:Lambert'); await p.click('text=Ajouter la règle');
  await p.waitForSelector('#exList >> text=Lambert');
  await p.locator('.person .avatar.click').nth(8).click();
  await p.locator('h2:has-text("Familles")').scrollIntoViewIfNeeded();
  await shot('5-familles-regles');
  await p.locator('.person').first().scrollIntoViewIfNeeded();
  await shot('6-participants');
  await p.fill('#bcSubject', 'Rendez-vous le 24'); await p.fill('#bcMessage', 'On se retrouve chez Mamoune à 19 h 🎄');
  await p.click('text=Publier dans l\'app'); await p.waitForSelector('#lastMessages .notif');
  await p.click('#drawBtn'); await p.waitForSelector('#resetDrawBtn:not(.hidden)');
  await shot('7-organisateur', true);

  // Le Secret Santa de Mamoune
  const giver = people.map(x => x[0]).find(n => n !== 'Cédric' && G.getDashboard(G.login(n, '1111').token).target.name === 'Mamoune') || 'Cédric';
  await p.click('#admin .topbar .iconbtn'); await p.waitForSelector('#welcome:not(.hidden) .name-btn');
  await p.click('.name-btn:has-text("' + giver + '")'); await p.fill('#pin1', giver === 'Cédric' ? '4321' : '1111'); await p.click('#authBtn');
  await p.waitForSelector('#drawDone:not(.hidden)');
  await p.click('.bell'); await p.waitForSelector('#notifs:not(.hidden)');
  await shot('8-cloche-apres-tirage');
  await p.click('#notifs .topbar .iconbtn'); await p.click('#revealCard'); await p.waitForSelector('#targetOthers a');
  await shot('9-revelation', true);
  // Ordinateur : espace organisateur
  const c2 = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await c2.route(API, async r => r.fulfill({ status: 200, contentType: 'application/json',
    body: G.doPost({ postData: { contents: r.request().postData() } }).getContent() }));
  await c2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const pc = await c2.newPage();
  pc.on('pageerror', e => errs.push(e.message));
  await pc.goto('http://localhost:8765/'); await pc.waitForSelector('#welcome:not(.hidden) .name-btn');
  await pc.click('text=Espace organisateur'); await pc.fill('#adminCode', C); await pc.click('text=Entrer');
  await pc.waitForSelector('#adminPanel:not(.hidden)');
  await pc.screenshot({ path: path.join(out, '10-organisateur-ordinateur.png') });
  console.log({ giver, errors: errs });
  await b.close(); srv.close();
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
