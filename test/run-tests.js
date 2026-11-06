// Tests du serveur : node test/run-tests.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const ctx = { console, Buffer, Math, JSON, Date, Set, Object, String, Number, Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8') +
  '\nthis.__api = {getPublicState,register,login,logout,getDashboard,addIdea,deleteIdea,markNotificationsRead,adminState,' +
  'adminAddParticipant,adminRemoveParticipant,adminResetAccount,adminSetFamily,adminSetColor,adminCheckRules,adminAddExclusion,' +
  'adminRemoveExclusion,adminSaveSettings,adminBroadcast,adminDraw,adminResetDraw,computeDraw_,banned_,doPost,doGet};', ctx);
const A = ctx.__api;
const props = ctx.PropertiesService.getScriptProperties();
const C = 'sapin-2026';
const throws = (fn, re) => assert.throws(fn, e => re.test(e.message), 'attendu : ' + re);
const plain = o => JSON.parse(JSON.stringify(o));
let passed = 0; const ok = m => { passed++; console.log('✔ ' + m); };

// --- Compatibilité : un Sheet existant à 3 colonnes (ancienne version) ---
ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Participants').data = [
  ['name', 'pinHash', 'salt'], ['Cédric', '', ''],
];
props.setProperty('ADMIN_CODE', C);
assert.equal(A.adminState(C).participants[0].name, 'Cédric');
ok('reprise d\'un Google Sheet existant (ancienne version) sans perte');

// --- Code organisateur ---
throws(() => A.adminState('mauvais'), /incorrect/);
props.deleteProperty('ADMIN_CODE');
throws(() => A.adminState(C), /non configuré/);
props.setProperty('ADMIN_CODE', C);
ok('code organisateur dans les propriétés du script');

// --- Participants & familles ---
A.adminRemoveParticipant(C, 'Cédric');
const people = [['Alice', 'Martin'], ['Bruno', 'Martin'], ['Chloé', 'Martin'], ['David', 'Durand'], ['Emma', 'Durand'], ['Farid', ''], ['Gaëlle', '']];
people.forEach(([n, f]) => A.adminAddParticipant(C, n, f));
throws(() => A.adminAddParticipant(C, 'alice'), /existe/);
A.adminSetFamily(C, 'Gaëlle', 'Durand');
assert.equal(A.adminState(C).participants.find(p => p.name === 'Gaëlle').family, 'Durand');
A.adminSetFamily(C, 'Gaëlle', '');
let st = A.adminState(C);
assert.deepEqual(plain(st.families), ['Durand', 'Martin']);
assert.equal(st.rules.possible, true);
ok('familles : création, affectation, tirage possible');

// --- Couleurs ---
A.adminSetColor(C, 'family', 'Martin', '#3b5b86');
A.adminSetColor(C, 'member', 'Bruno', '#a4452f');
throws(() => A.adminSetColor(C, 'member', 'Bruno', 'red'), /Couleur/);
throws(() => A.adminSetColor(C, 'member', 'Bruno', '<script>'), /Couleur/);
const pub = A.getPublicState();
const col = n => pub.participants.find(p => p.name === n).color;
assert.equal(col('Alice'), '#3b5b86');
assert.equal(col('Bruno'), '#a4452f');
assert.equal(col('David'), '');
assert.equal(pub.familyColors.Martin, '#3b5b86');
A.adminSetColor(C, 'member', 'Bruno', '');
assert.equal(A.getPublicState().participants.find(p => p.name === 'Bruno').color, '#3b5b86');
ok('couleurs : par famille, par membre (prioritaire), retour à la couleur de la famille, valeurs contrôlées');

// --- Exclusions avancées ---
A.adminAddExclusion(C, 'Farid', 'F:Durand');
throws(() => A.adminAddExclusion(C, 'David', 'F:Durand'), /déjà partie/);
throws(() => A.adminAddExclusion(C, 'Farid', 'F:Inconnue'), /différentes/);
st = A.adminState(C);
assert.equal(st.rules.choices.Farid, 4); // Alice, Bruno, Chloé, Gaëlle
assert.equal(st.rules.choices.David, 4); // Alice, Bruno, Chloé, Gaëlle (pas Emma : même famille ; pas Farid : exclu)
assert.equal(st.rules.choices.Alice, 4); // David, Emma, Farid, Gaëlle
ok('exclusion personne ⇄ famille entière (et nombre de choix restants)');

A.adminAddExclusion(C, 'F:Martin', 'F:Durand');
st = A.adminState(C);
assert.equal(st.rules.possible, false);
assert.ok(/impossible/.test(st.rules.reason));
throws(() => A.adminDraw(C), /Pas encore inscrit/);
A.adminRemoveExclusion(C, 'F:Martin', 'F:Durand');
assert.equal(A.adminState(C).rules.possible, true);
ok('exclusion famille ⇄ famille : tirage impossible détecté à l\'avance, puis corrigé');

// --- Inscriptions ---
const tok = {};
people.forEach(([n]) => { tok[n] = A.register(n, '1234').token; });
throws(() => A.register('Alice', '9999'), /déjà un compte/);
assert.equal(A.getDashboard(tok.Alice).color, '#3b5b86');
ok('inscription, couleur visible par la personne connectée');

// --- Cloche : tâches à faire ---
let n = A.getDashboard(tok.Alice).notifications;
assert.deepEqual(plain(n.todos.map(t => t.id)), ['todo-wishes', 'todo-others']);
assert.equal(n.unread, 2);
A.addIdea(tok.Alice, 'Alice', 'Un puzzle', 'https://exemple.fr/puzzle');
A.addIdea(tok.Alice, 'David', 'Un bonnet', '');
n = A.getDashboard(tok.Alice).notifications;
assert.equal(n.todos.length, 0);
ok('cloche : tâches à faire qui disparaissent une fois faites');

// --- Idées privées ---
A.addIdea(tok.Bruno, 'Alice', 'Elle adore le thé', '');
A.addIdea(tok['Chloé'], 'Alice', '=SUM(1,2)', '');
throws(() => A.addIdea(tok.Bruno, 'Alice', 'x', 'javascript:alert(1)'), /http/);
assert.equal(A.getDashboard(tok.Alice).myWishes.length, 1);
assert.equal(A.getDashboard(tok.Alice).target, null);
ok('Alice ne voit pas les idées proposées pour elle');

// --- Tirage ---
const names = people.map(p => p[0]);
const fam = Object.fromEntries(people);
for (let k = 0; k < 300; k++) {
  const r = A.computeDraw_(names, A.banned_(names.map(x => ({ name: x, family: fam[x] })), [{ a: 'Farid', b: 'F:Durand' }]));
  assert.ok(r);
  r.forEach(x => {
    assert.ok(x.giver !== x.receiver);
    assert.ok(!(fam[x.giver] && fam[x.giver] === fam[x.receiver]));
    assert.ok(!(x.giver === 'Farid' && fam[x.receiver] === 'Durand') && !(x.receiver === 'Farid' && fam[x.giver] === 'Durand'));
  });
  assert.equal(new Set(r.map(x => x.receiver)).size, names.length);
}
ok('300 tirages : jamais dans la même famille, exclusions personne ⇄ famille respectées');

A.adminDraw(C);
const seen = new Set();
names.forEach(x => {
  const d = A.getDashboard(tok[x]);
  seen.add(d.target.name);
  assert.ok(d.notifications.items.some(i => i.kind === 'draw' && i.unread));
});
assert.equal(seen.size, names.length);
assert.ok(!JSON.stringify(A.adminState(C)).includes('receiver'));
ok('tirage : chacun a 1 personne, annonce dans la cloche, l\'organisateur ne voit rien');

A.markNotificationsRead(tok.David);
n = A.getDashboard(tok.David).notifications;
assert.ok(n.items.every(i => !i.unread));
ok('cloche : marquer comme lu');

// --- Nouvelle idée → seul le Secret Santa est prévenu ---
const santaOf = who => names.find(x => A.getDashboard(tok[x]).target.name === who);
const santa = santaOf('Alice');
const author = names.find(x => x !== 'Alice' && x !== santa);
names.forEach(x => A.markNotificationsRead(tok[x]));
{ const t = Date.now(); while (Date.now() < t + 3); }
A.addIdea(tok[author], 'Alice', 'Une écharpe', '');
const unreadIdea = x => A.getDashboard(tok[x]).notifications.items.filter(i => i.kind === 'idea' && i.unread);
assert.equal(unreadIdea(santa).length, 1);
assert.ok(!JSON.stringify(unreadIdea(santa)).includes('Alice'));
names.filter(x => x !== santa).forEach(x => assert.equal(unreadIdea(x).length, 0, x));
A.addIdea(tok.Alice, 'Alice', 'Des chaussettes', '');
assert.ok(unreadIdea(santa).some(i => /liste/.test(i.title)));
A.addIdea(tok[santa], 'Alice', 'Mon idée à moi', '');
assert.equal(unreadIdea(santa).length, 2);
ok('nouvelle idée : seul le Secret Santa est prévenu, sans le nom, pas pour ses propres idées');

// --- Message de l'organisateur ---
throws(() => A.adminBroadcast(C, '', 'x'), /titre/);
st = A.adminBroadcast(C, 'Rendez-vous', 'Chez Mamoune\nà 19 h');
assert.equal(st.messages[0].title, '📣 Rendez-vous');
names.forEach(x => assert.ok(A.getDashboard(tok[x]).notifications.items.some(i => i.kind === 'message' && i.unread)));
ok('message de l\'organisateur dans la cloche de tout le monde');

// --- Événement & compte à rebours ---
throws(() => A.adminSaveSettings(C, { eventDate: '24/12' }), /Date/);
const d5 = new Date(Date.now() + 5 * 86400000);
const iso = d5.getFullYear() + '-' + String(d5.getMonth() + 1).padStart(2, '0') + '-' + String(d5.getDate()).padStart(2, '0');
A.adminSaveSettings(C, { eventDate: iso, budget: '30 €' });
assert.deepEqual(plain(A.getPublicState().event), { date: iso, budget: '30 €' });
assert.ok(/Plus que 5 jours/.test(A.getDashboard(tok.Alice).notifications.info[0].title));
ok('date, budget et compte à rebours dans la cloche');

// --- Divers ---
A.adminResetAccount(C, 'Emma');
throws(() => A.getDashboard(tok.Emma), /SESSION/);
tok.Emma = A.register('Emma', '5555').token;
assert.ok(A.getDashboard(tok.Emma).target);
ok('code oublié : réinitialisation, l\'attribution est conservée');
for (let i = 0; i < 5; i++) { try { A.login('Bruno', '0000'); } catch (e) {} }
throws(() => A.login('Bruno', '1234'), /Trop d'essais/);
ok('blocage après 5 codes faux');

const post = (fn, ...args) => JSON.parse(A.doPost({ postData: { contents: JSON.stringify({ fn, args }) } }).getContent());
assert.equal(post('getPublicState').ok, true);
['notify_', 'checkRules_', 'computeDraw_', 'constructor', 'drawMap_'].forEach(f => assert.equal(post(f).ok, false, f));
assert.equal(JSON.parse(A.doPost({ postData: { contents: 'pas du json' } }).getContent()).ok, false);
ok('API JSON : fonctions internes inaccessibles depuis l\'extérieur');

A.adminResetDraw(C);
assert.equal(A.getDashboard(tok.Alice).target, null);
assert.ok(A.getDashboard(tok.Alice).notifications.items.some(i => /annulé/.test(i.title)));
ok('annulation du tirage (annoncée dans la cloche)');

console.log('\n' + passed + ' vérifications réussies');
