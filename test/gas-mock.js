// Simulation minimale des services Google Apps Script (Node ou navigateur), pour les tests.
(function (g) {
  const sheets = {};
  function Sheet(name) {
    this.name = name; this.data = []; this.hidden = false;
  }
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    const sh = this;
    return {
      setValues(vals) {
        vals.forEach((row, i) => {
          sh.data[r - 1 + i] = sh.data[r - 1 + i] || [];
          row.forEach((v, j) => {
            sh.data[r - 1 + i][c - 1 + j] = typeof v === 'string' && v[0] === "'" ? v.slice(1) : v;
          });
        });
      },
    };
  };
  Sheet.prototype.getDataRange = function () {
    const d = this.data;
    return { getValues: () => (d.length ? d.map(r => r.slice()) : [['']]) };
  };
  Sheet.prototype.clearContents = function () { this.data = []; };
  Sheet.prototype.setFrozenRows = function () {};
  Sheet.prototype.hideSheet = function () { this.hidden = true; };

  g.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: n => sheets[n] || null,
      insertSheet: n => (sheets[n] = new Sheet(n)),
    }),
    _sheets: sheets,
  };

  const props = {};
  g.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; },
      getProperties: () => Object.assign({}, props),
    }),
  };

  g.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  g.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; }, getContent() { return t; } }) };

  let n = 0;
  const enc = s => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))));
  const dec = s => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s))));
  function fakeDigest(str) {
    // pas un vrai SHA-256, mais déterministe et sur 32 octets signés comme Apps Script
    const out = [];
    let h = 2166136261;
    for (let k = 0; k < 32; k++) {
      for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i) ^ k, 16777619);
      out.push(((h >>> 0) % 256) - 128);
    }
    return out;
  }
  g.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (_a, s) => fakeDigest(s),
    getUuid: () => 'uuid-' + (++n) + '-' + Math.random().toString(16).slice(2),
    base64Encode: s => enc(s),
    base64Decode: s => ({ __str: dec(s) }),
    newBlob: b => ({ getDataAsString: () => b.__str }),
    sleep: () => {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
