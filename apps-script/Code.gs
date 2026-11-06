/**
 * 🎄 Santa Familia — serveur Google Apps Script
 *
 * Toutes les données sont dans le Google Sheet qui contient ce script.
 * Les règles de confidentialité sont appliquées ICI (côté serveur) :
 * le téléphone ne reçoit jamais plus que ce que la personne a le droit de voir.
 *
 * 🔐 Le code organisateur n'est PAS écrit ici (ce fichier est public sur GitHub).
 *    Apps Script → ⚙️ Paramètres du projet → Propriétés du script → ADMIN_CODE.
 */

const APP_NAME = 'Santa Familia';

const SCHEMA = {
  Participants: ['name', 'pinHash', 'salt', 'family', 'color'],
  Exclusions: ['a', 'b'],
  Ideas: ['id', 'forName', 'author', 'text', 'link', 'created'],
  Draw: ['giver', 'receiver'],
  Notifications: ['id', 'to', 'kind', 'title', 'body', 'created'], // to = prénom, ou * pour tout le monde
};

/* ================================================================== */
/* API JSON (appelée par l'application hébergée sur GitHub Pages)      */
/* ================================================================== */

function doGet() {
  return json_({ ok: true, result: APP_NAME + ' API en ligne 🎄' });
}

function doPost(e) {
  // Seules ces fonctions sont accessibles depuis l'extérieur.
  const API = {
    getPublicState, register, login, logout, getDashboard, addIdea, deleteIdea, markNotificationsRead,
    adminState, adminAddParticipant, adminRemoveParticipant, adminResetAccount,
    adminSetFamily, adminSetColor, adminCheckRules, adminAddExclusion, adminRemoveExclusion,
    adminSaveSettings, adminBroadcast, adminDraw, adminResetDraw,
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

/* ================================================================== */
/* Accès au Google Sheet                                               */
/* ================================================================== */

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
function prop_(k) { return props_().getProperty(k) || ''; }
function isDrawn_() { return prop_('DRAWN') === '1'; }
function clean_(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }

function settings_() {
  return {
    eventDate: prop_('EVENT_DATE'),      // AAAA-MM-JJ
    budget: prop_('BUDGET'),             // texte libre, ex. « 30 € »
  };
}

/* ================================================================== */
/* Sécurité                                                            */
/* ================================================================== */

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
  const expected = prop_('ADMIN_CODE');
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

/** Qui offre à qui : { giver: receiver } (usage interne uniquement). */
function drawMap_() {
  const m = {};
  if (isDrawn_()) read_('Draw').forEach(d => { m[d.giver] = decode_(d.receiver); });
  return m;
}

/* ================================================================== */
/* API — participants                                                  */
/* ================================================================== */

function getPublicState() {
  const s = settings_();
  const fc = familyColors_();
  return {
    participants: read_('Participants').map(p => ({
      name: p.name, claimed: !!p.pinHash, family: p.family, color: p.color || fc[p.family] || '',
    })),
    familyColors: fc,
    drawn: isDrawn_(),
    event: { date: s.eventDate, budget: s.budget },
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
  const ps = read_('Participants');
  const drawn = isDrawn_();
  const s = settings_();
  let target = null;
  if (drawn) {
    const t = drawMap_()[me];
    // Règle : les idées POUR une personne ne sont visibles que par son Secret Santa (et leur auteur).
    if (t) target = { name: t, ideas: ideas.filter(i => i.forName === t).map(pub_) };
  }
  const mine = ps.find(p => p.name === me) || {};
  return {
    me: me,
    color: mine.color || familyColors_()[mine.family] || '',
    drawn: drawn,
    participants: ps.map(p => p.name).filter(n => n !== me),
    myWishes: ideas.filter(i => i.forName === me && i.author === me).map(pub_),
    myIdeasForOthers: ideas.filter(i => i.author === me && i.forName !== me).map(pub_),
    target: target,
    event: { date: s.eventDate, budget: s.budget },
    notifications: notificationsFor_(me, ideas, s),
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
    // Prévenir le Secret Santa de cette personne (sans écrire son nom).
    const map = drawMap_();
    const santa = Object.keys(map).find(g => map[g] === forName);
    if (santa && santa !== me) {
      notify_(santa, 'idea', me === forName ? '📝 Sa liste d\'envies a changé' : '💡 Nouvelle idée pour ta personne secrète',
        me === forName ? 'Ta personne secrète a ajouté une envie à sa liste.' : 'Un participant a proposé une nouvelle idée de cadeau.');
    }
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

/* ================================================================== */
/* API — organisateur                                                  */
/* ================================================================== */

function adminState(code) {
  admin_(code);
  const ideas = read_('Ideas');
  const ps = read_('Participants');
  return {
    participants: ps.map(p => ({
      name: p.name,
      claimed: !!p.pinHash,
      family: p.family,
      color: p.color,
      wishes: ideas.filter(i => i.forName === p.name && i.author === p.name).length,
      given: ideas.filter(i => i.author === p.name && i.forName !== p.name).length,
    })),
    families: unique_(ps.map(p => p.family).filter(Boolean)),
    familyColors: familyColors_(),
    exclusions: read_('Exclusions'),
    rules: checkRules_(ps, read_('Exclusions')),
    drawn: isDrawn_(),
    weakCode: prop_('ADMIN_CODE').length < 6,
    settings: settings_(),
    messages: read_('Notifications').filter(n => n.kind === 'message')
      .sort((x, y) => Number(y.created) - Number(x.created)).slice(0, 5)
      .map(n => ({ title: n.title, body: n.body, created: Number(n.created) })),
  };
}

function unique_(arr) { return arr.filter((v, i) => arr.indexOf(v) === i).sort(); }

function adminAddParticipant(code, name, family) {
  admin_(code);
  return withLock_(() => {
    name = clean_(name);
    family = clean_(family);
    if (!name || name.length > 40) throw new Error('Nom invalide (1 à 40 caractères).');
    if (isDrawn_()) throw new Error('Annule le tirage avant de modifier les participants.');
    const ps = read_('Participants');
    if (ps.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Ce nom existe déjà.');
    ps.push({ name: name, pinHash: '', salt: '', family: family });
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
    write_('Notifications', read_('Notifications').filter(n => n.to !== name));
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

/** Les membres d'une même famille ne peuvent pas se tirer entre eux. */
function adminSetFamily(code, name, family) {
  admin_(code);
  return withLock_(() => {
    family = clean_(family);
    if (family.length > 40) throw new Error('Nom de famille trop long.');
    const ps = read_('Participants');
    const p = ps.find(x => x.name === name);
    if (!p) throw new Error('Participant inconnu.');
    p.family = family;
    write_('Participants', ps);
    return adminState(code);
  });
}

const PALETTE = ['#1f3a2e', '#3f7a5c', '#c9a45c', '#a4452f', '#7a3b5e', '#3b5b86', '#5f8fa8', '#b8743a', '#6b6f3a', '#5a5f66'];

function familyColors_() {
  try { return JSON.parse(prop_('FAMILY_COLORS') || '{}'); } catch (e) { return {}; }
}

/** Couleur d'un membre (kind = 'member') ou d'une famille (kind = 'family'). '' = couleur par défaut. */
function adminSetColor(code, kind, name, color) {
  admin_(code);
  return withLock_(() => {
    color = clean_(color).toLowerCase();
    if (color && PALETTE.indexOf(color) < 0) throw new Error('Couleur inconnue.');
    if (kind === 'family') {
      const fc = familyColors_();
      if (color) fc[name] = color; else delete fc[name];
      props_().setProperty('FAMILY_COLORS', JSON.stringify(fc));
    } else {
      const ps = read_('Participants');
      const p = ps.find(x => x.name === name);
      if (!p) throw new Error('Participant inconnu.');
      p.color = color;
      write_('Participants', ps);
    }
    return adminState(code);
  });
}

/** Le tirage est-il possible avec les règles actuelles ? Et combien de personnes chacun peut-il tirer ? */
function checkRules_(ps, exclusions) {
  if (ps.length < 3) return { possible: false, reason: 'Il faut au moins 3 participants.', choices: {} };
  const banned = banned_(ps, exclusions);
  const names = ps.map(p => p.name);
  const choices = {};
  names.forEach(g => { choices[g] = names.filter(r => r !== g && !banned.has(JSON.stringify([g, r]))).length; });
  const possible = !!computeDraw_(names, banned);
  return { possible: possible, reason: possible ? '' : 'Les familles et exclusions actuelles rendent le tirage impossible : assouplis une règle.', choices: choices };
}

function adminCheckRules(code) {
  admin_(code);
  return checkRules_(read_('Participants'), read_('Exclusions'));
}

function adminAddExclusion(code, a, b) {
  admin_(code);
  return withLock_(() => {
    a = clean_(a); b = clean_(b);
    const ps = read_('Participants');
    // Une valeur « F:Nom » désigne toute une famille.
    const valid = v => v.indexOf('F:') === 0 ? ps.some(p => p.family === v.slice(2)) : ps.some(p => p.name === v);
    if (!valid(a) || !valid(b) || a === b) throw new Error('Choisis deux personnes ou familles différentes.');
    if (a.indexOf('F:') === 0 && ps.some(p => p.name === b && p.family === a.slice(2)) ||
        b.indexOf('F:') === 0 && ps.some(p => p.name === a && p.family === b.slice(2))) {
      throw new Error('Cette personne fait déjà partie de cette famille : la règle existe déjà.');
    }
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

function adminSaveSettings(code, s) {
  admin_(code);
  s = s || {};
  const date = clean_(s.eventDate);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide.');
  const props = props_();
  props.setProperty('EVENT_DATE', date);
  props.setProperty('BUDGET', clean_(s.budget).slice(0, 30));
  return adminState(code);
}

/** Message de l'organisateur : apparaît dans la cloche de tout le monde. */
function adminBroadcast(code, title, message) {
  admin_(code);
  title = clean_(title).slice(0, 80);
  message = String(message == null ? '' : message).trim();
  if (!title) throw new Error('Ajoute un titre.');
  if (!message || message.length > 1000) throw new Error('Message vide ou trop long (1000 caractères max).');
  withLock_(() => notify_('*', 'message', '📣 ' + title, message));
  return adminState(code);
}

function adminDraw(code) {
  admin_(code);
  const st = withLock_(() => {
    if (isDrawn_()) throw new Error('Le tirage a déjà eu lieu.');
    const ps = read_('Participants');
    if (ps.length < 3) throw new Error('Il faut au moins 3 participants.');
    const waiting = ps.filter(p => !p.pinHash).map(p => p.name);
    if (waiting.length) throw new Error('Pas encore inscrit(s) : ' + waiting.join(', '));
    const result = computeDraw_(ps.map(p => p.name), banned_(ps, read_('Exclusions')));
    if (!result) throw new Error('Impossible de faire un tirage avec ces familles et exclusions. Assouplis une règle.');
    write_('Draw', result.map(r => ({ giver: r.giver, receiver: encode_(r.receiver) })));
    props_().setProperty('DRAWN', '1');
    notify_('*', 'draw', '🎁 Le tirage a eu lieu !', 'Découvre à qui tu offres un cadeau dans l\'onglet « Mon tirage ».');
    return adminState(code);
  });
  return st;
}

function adminResetDraw(code) {
  admin_(code);
  return withLock_(() => {
    write_('Draw', []);
    props_().deleteProperty('DRAWN');
    notify_('*', 'draw', '↩️ Le tirage a été annulé', 'L\'organisateur va relancer un nouveau tirage.');
    return adminState(code);
  });
}

/* ================================================================== */
/* Tirage au sort                                                      */
/* ================================================================== */

/** Paires interdites : même famille + exclusions manuelles (dans les deux sens). */
function banned_(participants, exclusions) {
  const banned = new Set();
  const add = (a, b) => { banned.add(JSON.stringify([a, b])); banned.add(JSON.stringify([b, a])); };
  // « F:Nom » = tous les membres de la famille Nom.
  const expand = v => v.indexOf('F:') === 0 ? participants.filter(p => p.family === v.slice(2)).map(p => p.name) : [v];
  exclusions.forEach(e => expand(e.a).forEach(x => expand(e.b).forEach(y => { if (x !== y) add(x, y); })));
  participants.forEach(p => participants.forEach(q => {
    if (p.name !== q.name && p.family && p.family === q.family) add(p.name, q.name);
  }));
  return banned;
}

/**
 * Recherche avec retour arrière, candidats mélangés au hasard :
 * trouve toujours une solution si elle existe, sinon renvoie null.
 */
function computeDraw_(names, banned) {
  const ok = (g, r) => g !== r && !banned.has(JSON.stringify([g, r]));
  const givers = shuffle_(names.slice());
  // On place d'abord les personnes les plus contraintes.
  givers.sort((a, b) => names.filter(r => ok(a, r)).length - names.filter(r => ok(b, r)).length);
  const used = new Set();
  const out = [];
  let steps = 0;
  function place(i) {
    if (i === givers.length) return true;
    if (++steps > 200000) return false;
    const g = givers[i];
    const cands = shuffle_(names.filter(r => !used.has(r) && ok(g, r)));
    for (let k = 0; k < cands.length; k++) {
      used.add(cands[k]); out.push({ giver: g, receiver: cands[k] });
      if (place(i + 1)) return true;
      used.delete(cands[k]); out.pop();
    }
    return false;
  }
  return place(0) ? out : null;
}

function shuffle_(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}


/* ================================================================== */
/* Notifications dans l'app (la cloche 🔔)                             */
/* ================================================================== */

/** Enregistre une notification (to = prénom, ou * pour tout le monde). À appeler sous verrou. */
function notify_(to, kind, title, body) {
  const all = read_('Notifications');
  all.push({ id: Utilities.getUuid(), to: to, kind: kind, title: title, body: body, created: Date.now() });
  write_('Notifications', all.slice(-300)); // on garde les 300 dernières
}

function markNotificationsRead(token) {
  const me = me_(token);
  props_().setProperty('R_' + me, String(Date.now()));
  return true;
}

/**
 * Ce que la cloche affiche :
 *  - « à faire » calculés en direct (liste vide, aucune idée donnée) : ils disparaissent une fois faits ;
 *  - compte à rebours avant l'échange ;
 *  - notifications enregistrées (tirage, nouvelles idées, messages de l'organisateur).
 */
function notificationsFor_(me, ideas, s) {
  const lastRead = Number(prop_('R_' + me) || 0);
  const todos = [];
  if (!ideas.some(i => i.forName === me && i.author === me)) {
    todos.push({ id: 'todo-wishes', kind: 'todo', tab: 'wishes', title: '✏️ Ta liste d\'envies est vide', body: 'Ajoute quelques idées pour aider ton Secret Santa.' });
  }
  if (!ideas.some(i => i.author === me && i.forName !== me)) {
    todos.push({ id: 'todo-others', kind: 'todo', tab: 'others', title: '✏️ Propose des idées pour les autres', body: 'Elles restent secrètes et aident beaucoup !' });
  }
  const info = [];
  const days = daysUntil_(s.eventDate);
  if (days !== null && days >= 0 && days <= 7) {
    info.push({ id: 'countdown', kind: 'info', title: days === 0 ? '🎄 C\'est aujourd\'hui !' : '📅 Plus que ' + days + ' jour' + (days > 1 ? 's' : ''),
      body: 'Échange des cadeaux' + (s.budget ? ' · budget ' + s.budget : '') + '.' });
  }
  const items = read_('Notifications')
    .filter(n => n.to === me || n.to === '*')
    .sort((x, y) => Number(y.created) - Number(x.created))
    .slice(0, 30)
    .map(n => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, created: Number(n.created), unread: Number(n.created) > lastRead }));
  return {
    todos: todos,
    info: info,
    items: items,
    unread: todos.length + items.filter(n => n.unread).length,
  };
}

function daysUntil_(dateStr) {
  if (!dateStr) return null;
  const p = dateStr.split('-').map(Number);
  const target = new Date(p[0], p[1] - 1, p[2]);
  const t = new Date(); const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((target - today) / 86400000);
}
