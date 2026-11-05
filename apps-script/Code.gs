/**
 * 🎅 Secret Santa — serveur Google Apps Script
 *
 * Toutes les données sont dans le Google Sheet qui contient ce script.
 * Les règles de confidentialité sont appliquées ICI (côté serveur) :
 * le téléphone ne reçoit jamais plus que ce que la personne a le droit de voir.
 */

// 🔐 Le code organisateur n'est PAS écrit ici (ce fichier est public sur GitHub).
// Il se règle dans Apps Script : ⚙️ Paramètres du projet → Propriétés du script → ADMIN_CODE.
function adminCode_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_CODE') || '';
}

const SCHEMA = {
  Participants: ['name', 'pinHash', 'salt'],
  Exclusions: ['a', 'b'],
  Ideas: ['id', 'forName', 'author', 'text', 'link', 'created'],
  Draw: ['giver', 'receiver'],
};

/* ------------------------------------------------------------------ */
/* API JSON (appelée par l'application hébergée sur GitHub Pages)      */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, result: 'Secret Santa API en ligne 🎅' });
}

function doPost(e) {
  // Seules ces fonctions sont accessibles depuis l'extérieur.
  const API = {
    getPublicState, register, login, logout, getDashboard, addIdea, deleteIdea,
    adminState, adminAddParticipant, adminRemoveParticipant, adminResetAccount,
    adminAddExclusion, adminRemoveExclusion, adminDraw, adminResetDraw,
  };
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = Object.prototype.hasOwnProperty.call(API, req.fn) ? API[req.fn] : null;
    if (!fn) throw new Error('Action inconnue.');
    out = { ok: true, result: fn.apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    out = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Accès au Google Sheet                                               */
/* ------------------------------------------------------------------ */

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]);
    sh.setFrozenRows(1);
    if (name === 'Draw') sh.hideSheet(); // pour éviter de se spoiler en ouvrant le fichier
  }
  return sh;
}

function read_(name) {
  const cols = SCHEMA[name];
  return sheet_(name).getDataRange().getValues().slice(1)
    .filter(r => r.some(v => v !== ''))
    .map(r => {
      const o = {};
      cols.forEach((c, i) => { o[c] = r[i] == null ? '' : String(r[i]); });
      return o;
    });
}

function write_(name, rows) {
  const sh = sheet_(name);
  const cols = SCHEMA[name];
  sh.clearContents();
  // L'apostrophe force Google Sheets à garder du texte brut (pas de formule, de date, ni de nombre).
  const data = [cols].concat(rows.map(o => cols.map(c => "'" + (o[c] == null ? '' : String(o[c])))));
  sh.getRange(1, 1, data.length, cols.length).setValues(data);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function props_() { return PropertiesService.getScriptProperties(); }
function isDrawn_() { return props_().getProperty('DRAWN') === '1'; }
function clean_(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }

/* ------------------------------------------------------------------ */
/* Sécurité                                                            */
/* ------------------------------------------------------------------ */

function hash_(pin, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return 'h' + bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function checkPin_(pin) {
  if (!/^\d{4,6}$/.test(String(pin))) throw new Error('Le code doit contenir 4 à 6 chiffres.');
}

function newSession_(name) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props_().setProperty('S_' + token, name);
  return { token: token, name: name };
}

function me_(token) {
  const name = token ? props_().getProperty('S_' + token) : null;
  if (!name) throw new Error('SESSION');
  return name;
}

function admin_(code) {
  const expected = adminCode_();
  if (!expected) throw new Error('Code organisateur non configuré : ajoute la propriété ADMIN_CODE dans Apps Script.');
  if (String(code) !== expected) {
    Utilities.sleep(800);
    throw new Error('Code organisateur incorrect.');
  }
}

function encode_(name) { return Utilities.base64Encode('ss|' + name, Utilities.Charset.UTF_8); }
function decode_(s) {
  return Utilities.newBlob(Utilities.base64Decode(s, Utilities.Charset.UTF_8)).getDataAsString().slice(3);
}

function pub_(i) {
  return { id: i.id, forName: i.forName, author: i.author, text: i.text, link: i.link };
}

/* ------------------------------------------------------------------ */
/* API — participants                                                  */
/* ------------------------------------------------------------------ */

function getPublicState() {
  return {
    participants: read_('Participants').map(p => ({ name: p.name, claimed: !!p.pinHash })),
    drawn: isDrawn_(),
  };
}

function register(name, pin) {
  return withLock_(() => {
    name = clean_(name);
    pin = String(pin);
    checkPin_(pin);
    const ps = read_('Participants');
    const p = ps.find(x => x.name === name);
    if (!p) throw new Error('Participant inconnu.');
    if (p.pinHash) throw new Error('Ce nom a déjà un compte : connecte-toi avec ton code.');
    p.salt = Utilities.getUuid();
    p.pinHash = hash_(pin, p.salt);
    write_('Participants', ps);
    return newSession_(name);
  });
}

function login(name, pin) {
  name = clean_(name);
  const props = props_();
  const key = 'F_' + name;
  const fails = JSON.parse(props.getProperty(key) || '{"n":0,"t":0}');
  const locked = fails.n >= 5 && Date.now() - fails.t < 15 * 60 * 1000;
  if (locked) throw new Error('Trop d\'essais. Réessaie dans 15 minutes.');
  const p = read_('Participants').find(x => x.name === name);
  if (!p || !p.pinHash) throw new Error('Ce compte n\'existe pas encore.');
  if (hash_(String(pin), p.salt) !== p.pinHash) {
    props.setProperty(key, JSON.stringify({ n: (fails.n >= 5 ? 0 : fails.n) + 1, t: Date.now() }));
    throw new Error('Code incorrect.');
  }
  props.deleteProperty(key);
  return newSession_(name);
}

function logout(token) {
  if (token) props_().deleteProperty('S_' + token);
  return true;
}

function getDashboard(token) {
  const me = me_(token);
  const ideas = read_('Ideas');
  const drawn = isDrawn_();
  let target = null;
  if (drawn) {
    const d = read_('Draw').find(x => x.giver === me);
    if (d) {
      const t = decode_(d.receiver);
      // Règle : les idées POUR une personne ne sont visibles que par son Secret Santa (et leur auteur).
      target = { name: t, ideas: ideas.filter(i => i.forName === t).map(pub_) };
    }
  }
  return {
    me: me,
    drawn: drawn,
    participants: read_('Participants').map(p => p.name).filter(n => n !== me),
    myWishes: ideas.filter(i => i.forName === me && i.author === me).map(pub_),
    myIdeasForOthers: ideas.filter(i => i.author === me && i.forName !== me).map(pub_),
    target: target,
  };
}

function addIdea(token, forName, text, link) {
  return withLock_(() => {
    const me = me_(token);
    forName = clean_(forName);
    text = String(text == null ? '' : text).trim();
    link = String(link == null ? '' : link).trim();
    if (!read_('Participants').some(p => p.name === forName)) throw new Error('Participant inconnu.');
    if (!text) throw new Error('Écris une idée.');
    if (text.length > 300) throw new Error('Idée trop longue (300 caractères max).');
    if (link && !/^https?:\/\/\S+$/i.test(link)) throw new Error('Le lien doit commencer par http:// ou https://');
    if (link.length > 500) throw new Error('Lien trop long.');
    const ideas = read_('Ideas');
    ideas.push({ id: Utilities.getUuid(), forName: forName, author: me, text: text, link: link, created: Date.now() });
    write_('Ideas', ideas);
    return true;
  });
}

function deleteIdea(token, id) {
  return withLock_(() => {
    const me = me_(token);
    const ideas = read_('Ideas');
    const idea = ideas.find(i => i.id === id);
    if (!idea || idea.author !== me) throw new Error('Tu ne peux supprimer que tes propres idées.');
    write_('Ideas', ideas.filter(i => i.id !== id));
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* API — organisateur                                                  */
/* ------------------------------------------------------------------ */

function adminState(code) {
  admin_(code);
  return {
    participants: read_('Participants').map(p => ({ name: p.name, claimed: !!p.pinHash })),
    exclusions: read_('Exclusions'),
    drawn: isDrawn_(),
    defaultCode: adminCode_().length < 6,
  };
}

function adminAddParticipant(code, name) {
  admin_(code);
  return withLock_(() => {
    name = clean_(name);
    if (!name || name.length > 40) throw new Error('Nom invalide (1 à 40 caractères).');
    if (isDrawn_()) throw new Error('Annule le tirage avant de modifier les participants.');
    const ps = read_('Participants');
    if (ps.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Ce nom existe déjà.');
    ps.push({ name: name, pinHash: '', salt: '' });
    write_('Participants', ps);
    return adminState(code);
  });
}

function adminRemoveParticipant(code, name) {
  admin_(code);
  return withLock_(() => {
    if (isDrawn_()) throw new Error('Annule le tirage avant de modifier les participants.');
    write_('Participants', read_('Participants').filter(p => p.name !== name));
    write_('Exclusions', read_('Exclusions').filter(e => e.a !== name && e.b !== name));
    write_('Ideas', read_('Ideas').filter(i => i.forName !== name && i.author !== name));
    killSessions_(name);
    return adminState(code);
  });
}

/** Si quelqu'un a oublié son code : il pourra recréer son compte (ses idées sont conservées). */
function adminResetAccount(code, name) {
  admin_(code);
  return withLock_(() => {
    const ps = read_('Participants');
    const p = ps.find(x => x.name === name);
    if (!p) throw new Error('Participant inconnu.');
    p.pinHash = ''; p.salt = '';
    write_('Participants', ps);
    killSessions_(name);
    props_().deleteProperty('F_' + name);
    return adminState(code);
  });
}

function killSessions_(name) {
  const props = props_();
  const all = props.getProperties();
  Object.keys(all).forEach(k => { if (k.indexOf('S_') === 0 && all[k] === name) props.deleteProperty(k); });
}

function adminAddExclusion(code, a, b) {
  admin_(code);
  return withLock_(() => {
    a = clean_(a); b = clean_(b);
    const names = read_('Participants').map(p => p.name);
    if (!names.includes(a) || !names.includes(b) || a === b) throw new Error('Choisis deux participants différents.');
    const ex = read_('Exclusions');
    if (!ex.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) ex.push({ a: a, b: b });
    write_('Exclusions', ex);
    return adminState(code);
  });
}

function adminRemoveExclusion(code, a, b) {
  admin_(code);
  return withLock_(() => {
    write_('Exclusions', read_('Exclusions').filter(e => !(e.a === a && e.b === b)));
    return adminState(code);
  });
}

function adminDraw(code) {
  admin_(code);
  return withLock_(() => {
    if (isDrawn_()) throw new Error('Le tirage a déjà eu lieu.');
    const ps = read_('Participants');
    if (ps.length < 3) throw new Error('Il faut au moins 3 participants.');
    const waiting = ps.filter(p => !p.pinHash).map(p => p.name);
    if (waiting.length) throw new Error('Pas encore inscrit(s) : ' + waiting.join(', '));
    const result = computeDraw_(ps.map(p => p.name), read_('Exclusions'));
    if (!result) throw new Error('Impossible de faire un tirage avec ces exclusions. Retire-en une.');
    write_('Draw', result.map(r => ({ giver: r.giver, receiver: encode_(r.receiver) })));
    props_().setProperty('DRAWN', '1');
    return adminState(code);
  });
}

function adminResetDraw(code) {
  admin_(code);
  return withLock_(() => {
    write_('Draw', []);
    props_().deleteProperty('DRAWN');
    return adminState(code);
  });
}

/* ------------------------------------------------------------------ */
/* Tirage au sort                                                      */
/* ------------------------------------------------------------------ */

function computeDraw_(names, exclusions) {
  const banned = new Set();
  exclusions.forEach(e => {
    banned.add(JSON.stringify([e.a, e.b]));
    banned.add(JSON.stringify([e.b, e.a]));
  });
  const ok = (g, r) => g !== r && !banned.has(JSON.stringify([g, r]));
  for (let attempt = 0; attempt < 20000; attempt++) {
    const receivers = shuffle_(names.slice());
    if (names.every((g, i) => ok(g, receivers[i]))) {
      return names.map((g, i) => ({ giver: g, receiver: receivers[i] }));
    }
  }
  return null;
}

function shuffle_(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
