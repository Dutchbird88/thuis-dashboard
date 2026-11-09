#!/usr/bin/env node
// Testscript voor Thuis Dashboard, zonder echte Home Assistant.
//
//   node test/test.js                      controles + screenshots van alle kaarten (telefoon en computer)
//   node test/test.js --vergelijk HEAD~1   ook vergelijken met een eerdere versie (git-ref of pad naar een .js)
//   node test/test.js --alleen thuis       alleen de views waarvan de naam dit bevat
//   node test/test.js --lint               ook ESLint (via npx; alleen bij grotere codewijzigingen)
//
// Uitkomst: test/out/ (screenshots, bij verschil ook <naam>.oud.png en <naam>.verschil.png).
// Privacy: zet persoonlijke zoektermen (één per regel) in test/prive.txt. Dat bestand staat in .gitignore.
// Nodig: Node en Playwright met Chromium.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright ontbreekt: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out'), APP = 'thuis-dashboard.js';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const VERGELIJK = arg('--vergelijk'), ALLEEN = arg('--alleen'), LINT = process.argv.includes('--lint');
const KLOK = '2026-11-05T12:30:00+01:00'; // vaste tijd, zodat screenshots gelijk blijven

// naam, parameters voor mock.html, breedte, en eventueel een actie vóór de screenshot
const VIEWS = [
  ['thuis-telefoon', 'card=thuis&wt=pmd1', 390], ['thuis-computer', 'card=thuis&wt=pmd1', 1280],
  ['thuis-telefoon-muziek', 'card=thuis&hp=playing&art=1', 390], ['thuis-telefoon-alarm', 'card=thuis&alarm=water', 390],
  ['thuis-telefoon-was', 'card=thuis&was=1', 390], ['thuis-telefoon-vaat', 'card=thuis&vaat=1', 390], ['thuis-telefoon-oven', 'card=thuis&oven=koel&tok=1', 390], ['thuis-computer-oven', 'card=thuis&oven=koel&tok=1', 1280],
  ['thuis-telefoon-wol', 'card=thuis&wol=1', 390], ['thuis-computer-wol', 'card=thuis&wol=1', 1280],
  ['kamers-telefoon', 'card=kamers', 390], ['kamers-computer', 'card=kamers', 1280],
  ['nu-telefoon', 'card=nu', 390], ['nu-computer', 'card=nu', 1280],
  ['nu-telefoon-scene', 'card=nu&scn=1', 390], ['nu-telefoon-scene-nacht', 'card=nu&scn=1&sun=-20&pv=0', 390], ['nu-computer-scene', 'card=nu&scn=1', 1280], ['nu-telefoon-scene-ontbreekt', 'card=nu&scn=1&sun=-20&scnsrc=/bestaat-niet/', 390],
  ['energie-telefoon', 'card=energie', 390], ['energie-computer', 'card=energie', 1280],
  ['auto-telefoon', 'card=auto', 390], ['auto-computer', 'card=auto', 1280],
  ['venster-thermostaat', 'card=thuis', 390, (c) => c._openSheet('th')],
  ['venster-afval', 'card=thuis', 390, (c) => c._openSheet('waste')],
  ['venster-kamer', 'card=kamers', 390, (c) => c._openSheet('room', 0)],
  ['venster-homepod', 'card=kamers&hp=playing&art=1', 390, (c) => c._openSheet('hp', 'media_player.homepod')],
  ['venster-computer', 'card=thuis&wol=1', 390, (c) => c._openSheet('pc', 'button.computer_wekken')],
  ['venster-computer-historie', 'card=thuis&wol=1', 390, (c) => { c._openSheet('pc', 'button.computer_wekken'); c.shadowRoot.querySelector('#cvHb').click(); }],
  ['venster-server', 'card=thuis&wol=1', 390, (c) => c._openSheet('pc', 'button.server_wekken')],
  ['venster-beweging', 'card=kamers', 390, (c) => { c._openSheet('room', c._rooms().findIndex((r) => r.name === 'Slaapkamer')); c.shadowRoot.querySelector('.kspills .mp[data-mo]').click(); }],
  ['venster-beweging-historie', 'card=kamers', 390, (c) => { c._openSheet('room', c._rooms().findIndex((r) => r.name === 'Slaapkamer')); c.shadowRoot.querySelector('.kspills .mp[data-mo]').click(); c.shadowRoot.querySelector('#cvHb').click(); }],
  ['venster-kamer-wol', 'card=kamers&wol=1', 390, (c) => c._openSheet('room', c._rooms().findIndex((r) => r.name === 'Slaapkamer'))],
  ['venster-kamer-wol-pc', 'card=kamers&wol=1', 390, (c) => { c._openSheet('room', c._rooms().findIndex((r) => r.name === 'Slaapkamer')); c.shadowRoot.querySelector('.kspills [data-wol]').click(); }],
].filter((v) => !ALLEEN || v[0].includes(ALLEEN));

const res = []; let fout = 0;
const ok = (n, t) => res.push(`  ok    ${n}${t ? ' · ' + t : ''}`), bad = (n, t) => { fout++; res.push(`  FOUT  ${n}${t ? ' · ' + t : ''}`); }, info = (n, t) => res.push(`  --    ${n}${t ? ' · ' + t : ''}`);

// ---------- 1. controles op de code ----------
function controles() {
  const src = path.join(ROOT, APP), code = fs.readFileSync(src, 'utf8');
  const v = (code.match(/const CARD_VERSION = '(\d+)'/) || [])[1]; info('versie', v ? 'v' + v : 'onbekend');
  const syn = spawnSync(process.execPath, ['--check', src], { encoding: 'utf8' }); syn.status === 0 ? ok('syntax (node --check)') : bad('syntax', syn.stderr.split('\n').slice(0, 4).join(' '));
  if (LINT) {
    const l = spawnSync('npx', ['--yes', 'eslint@8.57.0', '--no-eslintrc', '--env', 'browser,es2022', '--parser-options=ecmaVersion:2022', '--rule', '{"no-undef":"error","no-redeclare":"error","no-dupe-keys":"error"}', src], { encoding: 'utf8', cwd: ROOT });
    if (l.status === 0) ok('lint (eslint)'); else if (/error/.test(l.stdout)) bad('lint', (l.stdout.match(/\d+ problems?/) || ['fouten'])[0]); else info('lint', 'overgeslagen: eslint niet beschikbaar');
  }
  // privacy: vaste coördinaten (zie CLAUDE.md, v262) en eigen termen uit test/prive.txt
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !/\.(png|jpe?g|gif|webp)$/i.test(f));
  const coord = [];
  for (const f of files) fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((r, i) => { if (/\b(lat|lng|lon|latitude|longitude)\b/i.test(r) && /\b(4[5-9]|5[0-5])\.\d{3,}|\b[3-7]\.\d{4,}/.test(r)) coord.push(`${f}:${i + 1}`); });
  coord.length ? bad('geen vaste coördinaten', coord.join(', ')) : ok('geen vaste coördinaten');
  const pf = path.join(__dirname, 'prive.txt');
  if (fs.existsSync(pf)) {
    const terms = fs.readFileSync(pf, 'utf8').split('\n').map((t) => t.trim()).filter((t) => t && !t.startsWith('#')), hits = [];
    for (const f of files) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase(); terms.forEach((t, i) => { if (s.includes(t.toLowerCase())) hits.push(`term ${i + 1} in ${f}`); }); }
    hits.length ? bad('persoonlijke termen', hits.join(', ')) : ok('persoonlijke termen', `${terms.length} termen, 0 gevonden`);
  } else info('persoonlijke termen', 'test/prive.txt ontbreekt: niet gecontroleerd');
}

// ---------- 2. screenshots ----------
function server() {
  return new Promise((r) => {
    const s = http.createServer((q, w) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(ROOT)) { w.writeHead(403); w.end(); return; }
      fs.readFile(f, (e, d) => { if (e) { w.writeHead(404); w.end(); return; } w.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); w.end(d); });
    }).listen(0, () => r(s));
  });
}
async function shot(b, base, [naam, qs, w, actie], src) {
  const p = await b.newPage({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: w < 600 }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.clock.install({ time: new Date(KLOK) });
  await p.goto(`${base}/test/mock.html?${qs}&src=${encodeURIComponent(src)}`); await p.clock.runFor(3000); await p.waitForTimeout(800);
  await p.evaluate(() => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; window.card.shadowRoot.appendChild(st);
    window.card.shadowRoot.querySelectorAll('svg').forEach((s) => { try { s.pauseAnimations(); s.setCurrentTime(0); } catch (e) { /* geen animatie */ } }); });
  if (actie) { try { await p.evaluate(`(${actie})(window.card)`); } catch (e) { errs.push('actie: ' + e.message.split('\n')[0]); } await p.clock.runFor(1000); await p.waitForTimeout(500); }
  await p.waitForTimeout(200); const png = await p.screenshot({ fullPage: true }); await p.close(); return { png, errs };
}
// pixels vergelijken in de browser; geeft het aantal verschillende pixels en een verschilbeeld
async function diff(b, a, c) {
  const p = await b.newPage();
  const r = await p.evaluate(async ([a, c]) => {
    const img = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
    const [A, C] = await Promise.all([img(a), img(c)]), w = Math.max(A.width, C.width), h = Math.max(A.height, C.height);
    const px = (I) => { const cv = new OffscreenCanvas(w, h), x = cv.getContext('2d'); x.drawImage(I, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = px(A), dc = px(C), cv = new OffscreenCanvas(w, h), x = cv.getContext('2d'), out = x.createImageData(w, h); let n = 0;
    for (let i = 0; i < da.length; i += 4) { const d = Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]) + Math.abs(da[i + 2] - dc[i + 2]); const g = (dc[i] + dc[i + 1] + dc[i + 2]) / 12;
      if (d > 12) { n++; out.data.set([255, 40, 90, 255], i); } else out.data.set([g, g, g, 255], i); }
    x.putImageData(out, 0, 0); const bl = await cv.convertToBlob(), buf = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
    return { n, size: A.width === C.width && A.height === C.height, png: btoa(s) };
  }, [a.toString('base64'), c.toString('base64')]);
  await p.close(); return r;
}

(async () => {
  console.log('Controles'); controles(); console.log(res.splice(0).join('\n'));
  fs.mkdirSync(OUT, { recursive: true }); fs.readdirSync(OUT).forEach((f) => /\.(png|js)$/.test(f) && fs.unlinkSync(path.join(OUT, f)));
  let ref = null;
  if (VERGELIJK) {
    ref = path.join(OUT, 'oud.js');
    if (fs.existsSync(VERGELIJK)) fs.copyFileSync(VERGELIJK, ref);
    else { try { fs.writeFileSync(ref, execFileSync('git', ['show', `${VERGELIJK}:${APP}`], { cwd: ROOT })); } catch (e) { console.error(`Kon ${VERGELIJK} niet vinden (git-ref of pad)`); process.exit(2); } }
  }
  const srv = await server(), base = `http://localhost:${srv.address().port}`, b = await chromium.launch();
  console.log(`\nViews${ref ? ` (vergeleken met ${VERGELIJK})` : ''}`);
  for (const v of VIEWS) {
    const nu = await shot(b, base, v, `/${APP}`); fs.writeFileSync(path.join(OUT, v[0] + '.png'), nu.png);
    if (nu.errs.length) { bad(v[0], 'fout in de console: ' + nu.errs[0].slice(0, 160)); continue; }
    if (!ref) { ok(v[0]); continue; }
    const oud = await shot(b, base, v, '/test/out/oud.js');
    if (oud.errs.length) { info(v[0], 'nieuw: bestaat nog niet in de oude versie'); continue; }
    if (Buffer.compare(oud.png, nu.png) === 0) { ok(v[0], 'gelijk'); continue; }
    const d = await diff(b, oud.png, nu.png);
    if (!d.n && d.size) { ok(v[0], 'gelijk'); continue; }
    fs.writeFileSync(path.join(OUT, v[0] + '.oud.png'), oud.png); fs.writeFileSync(path.join(OUT, v[0] + '.verschil.png'), Buffer.from(d.png, 'base64'));
    info(v[0], `VERSCHIL: ${d.n} pixels${d.size ? '' : ', andere hoogte'}`);
  }
  console.log(res.join('\n')); await b.close(); srv.close();
  console.log(`\n${fout ? fout + ' fout(en)' : 'Alles in orde'} · screenshots in test/out/`);
  process.exit(fout ? 1 : 0);
})();
