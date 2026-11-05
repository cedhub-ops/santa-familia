// node test/run-tests.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const ctx = { console, Buffer, Math, JSON, Date, Set, Object, String };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8'), ctx);
ctx.PropertiesService.getScriptProperties().setProperty('ADMIN_CODE', 'change-moi');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8') + '\nthis.__api = {getPublicState,register,login,logout,getDashboard,addIdea,deleteIdea,adminState,adminAddParticipant,adminRemoveParticipant,adminResetAccount,adminAddExclusion,adminRemoveExclusion,adminDraw,adminResetDraw,computeDraw_,doPost,doGet};', ctx);
const A = ctx.__api;
const C = 'change-moi';
const throws = (fn, re) => assert.throws(fn, e => re.test(e.message), 'attendu: ' + re);
let passed = 0; const ok = m => { passed++; console.log('✔ ' + m); };

throws(() => A.adminState('mauvais'), /incorrect/); ok('code admin refusé');

const names = ['Alice', 'Bruno', 'Chloé', 'David', 'Emma', 'Farid'];
names.forEach(n => A.adminAddParticipant(C, n));
throws(() => A.adminAddParticipant(C, 'alice'), /existe/); ok('participants ajoutés, doublon refusé');

A.adminAddExclusion(C, 'Alice', 'Bruno');
A.adminAddExclusion(C, 'Chloé', 'David');
assert.equal(A.adminState(C).exclusions.length, 2); ok('exclusions');

const tok = {};
names.slice(0, 5).forEach(n => { tok[n] = A.register(n, '1234').token; });
throws(() => A.register('Alice', '9999'), /déjà un compte/);
throws(() => A.register('Farid', '12'), /4 à 6/);
throws(() => A.adminDraw(C), /Farid/); ok('tirage bloqué tant que tout le monde n\'est pas inscrit');

tok.Farid = A.register('Farid', '000123').token;
throws(() => A.login('Farid', '123'), /incorrect/);
assert.ok(A.login('Farid', '000123').token); ok('connexion, code à zéros en tête conservé');

// Idées
A.addIdea(tok.Alice, 'Alice', 'Un puzzle', 'https://exemple.fr/puzzle');
A.addIdea(tok.Bruno, 'Alice', 'Elle adore le thé', '');
A.addIdea(tok.Chloé, 'Alice', '=SUM(1,2)', '');
throws(() => A.addIdea(tok.Bruno, 'Alice', 'x', 'javascript:alert(1)'), /http/);
throws(() => A.getDashboard('faux'), /SESSION/);
let dA = A.getDashboard(tok.Alice);
assert.equal(dA.myWishes.length, 1);
assert.equal(dA.myIdeasForOthers.length, 0);
assert.equal(dA.target, null);
ok('Alice ne voit pas les idées que les autres ont proposées pour elle');
assert.equal(A.getDashboard(tok.Bruno).myIdeasForOthers[0].text, 'Elle adore le thé');
const chloeIdea = A.getDashboard(tok.Chloé).myIdeasForOthers[0];
assert.equal(chloeIdea.text, '=SUM(1,2)'); ok('texte commençant par = gardé tel quel (pas de formule)');
throws(() => A.deleteIdea(tok.Bruno, chloeIdea.id), /propres/); ok('on ne supprime que ses idées');

// Tirage
A.adminDraw(C);
const seen = new Set();
names.forEach(n => {
  const d = A.getDashboard(tok[n]);
  assert.ok(d.target, n + ' a une cible');
  assert.notEqual(d.target.name, n);
  assert.ok(!(n === 'Alice' && d.target.name === 'Bruno') && !(n === 'Bruno' && d.target.name === 'Alice'));
  assert.ok(!(n === 'Chloé' && d.target.name === 'David') && !(n === 'David' && d.target.name === 'Chloé'));
  seen.add(d.target.name);
  if (d.target.name === 'Alice') {
    assert.equal(d.target.ideas.length, 3);
    ok(n + ' (Secret Santa d\'Alice) voit sa liste + les idées des autres');
  }
});
assert.equal(seen.size, names.length); ok('tirage valide : chacun offre et reçoit exactement 1 cadeau, exclusions respectées');
assert.ok(A.adminState(C).drawn);
assert.ok(!JSON.stringify(A.adminState(C)).includes('receiver')); ok('l\'admin ne reçoit pas les résultats');
assert.ok(ctx.SpreadsheetApp._sheets.Draw.hidden); ok('onglet du tirage masqué dans le Sheet');
throws(() => A.adminAddParticipant(C, 'Gaston'), /Annule/);

// Code oublié
A.adminResetAccount(C, 'Emma');
throws(() => A.getDashboard(tok.Emma), /SESSION/);
tok.Emma = A.register('Emma', '5555').token;
assert.ok(A.getDashboard(tok.Emma).target); ok('code oublié : réinitialisation, l\'attribution est conservée');

// Anti-force brute
for (let i = 0; i < 5; i++) { try { A.login('Bruno', '0000'); } catch (e) {} }
throws(() => A.login('Bruno', '1234'), /Trop d'essais/); ok('blocage après 5 codes faux');

// Exclusions impossibles
assert.equal(A.computeDraw_(['A', 'B', 'C'], [{ a: 'A', b: 'B' }, { a: 'A', b: 'C' }]), null); ok('tirage impossible détecté');
// Stats sur 2000 tirages
for (let i = 0; i < 2000; i++) {
  const r = A.computeDraw_(names, [{ a: 'Alice', b: 'Bruno' }]);
  r.forEach(x => assert.ok(x.giver !== x.receiver && !(x.giver === 'Alice' && x.receiver === 'Bruno') && !(x.giver === 'Bruno' && x.receiver === 'Alice')));
}
ok('2000 tirages aléatoires valides');

A.adminResetDraw(C);
assert.equal(A.getDashboard(tok.Alice).target, null); ok('annulation du tirage');

// API JSON
const post = (fn, ...args) => JSON.parse(A.doPost({ postData: { contents: JSON.stringify({ fn, args }) } }).getContent());
assert.equal(post('getPublicState').ok, true);
assert.equal(post('getPublicState').result.participants.length, 6);
assert.deepEqual(post('adminState', 'faux'), { ok: false, error: 'Code organisateur incorrect.' });
assert.equal(post('computeDraw_', ['a'], []).ok, false);
assert.equal(post('constructor').ok, false);
assert.equal(JSON.parse(A.doPost({ postData: { contents: 'pas du json' } }).getContent()).ok, false);
assert.equal(JSON.parse(A.doGet().getContent()).ok, true);
ok('API JSON : appels autorisés OK, fonctions internes inaccessibles');

console.log('\n' + passed + ' vérifications réussies');
