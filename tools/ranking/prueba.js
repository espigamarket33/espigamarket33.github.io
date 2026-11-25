#!/usr/bin/env node
/* Prueba local de punta a punta (no toca internet ni el bot real):
   genera un "bot" falso, firma initData como Telegram, cifra con el código REAL del navegador (tg/ranking.js),
   corre procesar.js y revisa la tabla. Uso: node tools/ranking/prueba.js */
'use strict';
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
const C = require('./core');
const raiz = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-'));
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const tokenFalso = '123456:FAKE-token-solo-para-pruebas';
const secreto = crypto.createHmac('sha256', 'WebAppData').update(tokenFalso).digest('hex');
const ahora = Math.floor(Date.now() / 1000);
function initData(user, authDate, secret) {
  const p = { auth_date: String(authDate), query_id: 'AAH' + user.id, user: JSON.stringify(user) };
  const dcs = Object.keys(p).sort().map(k => k + '=' + p[k]).join('\n');
  const hash = crypto.createHmac('sha256', Buffer.from(secret || secreto, 'hex')).update(dcs).digest('hex');
  return new URLSearchParams(Object.assign({}, p, { hash })).toString();
}
// carga tg/ranking.js en un navegador simulado y captura lo que mandaría a ntfy
async function envioNavegador(page, init, accion) {
  const capt = [];
  const store = {};
  const ctx = {
    console, TextEncoder, URLSearchParams, atob, btoa, Uint8Array, Promise, JSON, Math, Date, Object, Array, String, Number, Intl, setTimeout: () => 0, crypto: globalThis.crypto,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) } },
    document: { readyState: 'complete', documentElement: { getAttribute: () => page }, addEventListener() { } },
    fetch: async (url, o) => { capt.push({ url, body: o && o.body }); return { ok: true, json: async () => ({}) } },
    btoa: globalThis.btoa
  };
  ctx.window = ctx;
  ctx.TG = { enTelegram: true, webApp: { initData: init }, usuario: JSON.parse(new URLSearchParams(init).get('user')) };
  vm.createContext(ctx);
  let js = fs.readFileSync(path.join(raiz, 'tg', 'ranking.js'), 'utf8').replace(/llave:'[^']+'/, "llave:'" + pubB64 + "'");
  vm.runInContext(js, ctx);
  await accion(ctx.RANKING);
  return capt;
}
let id = 0; const msgs = [];
const add = (body, t) => msgs.push({ id: 'm' + (++id), time: t || ahora, event: 'message', topic: 'x', message: body });
(async () => {
  const ana = { id: 1001, first_name: 'Ana', last_name: 'López', username: 'ana_mx' };
  const beto = { id: 1002, first_name: 'Beto<script>' };
  const caro = { id: 1003, first_name: 'Caro' };
  const iA = initData(ana, ahora - 600), iB = initData(beto, ahora - 600), iC = initData(caro, ahora - 600);
  let c = await envioNavegador('esquiva', iA, rk => rk.enviarPuntaje('esquiva', 5000, { t: 60, cup: 40, casi: 5, zone: 2 }));
  if (!c.length || !/ntfy\.sh/.test(c[0].url)) throw new Error('el navegador no envió');
  add(c[0].body);
  // no reenvía si no supera su mejor
  // (el localStorage simulado es nuevo en cada llamada, así que esto se prueba aparte)
  c = await envioNavegador('esquiva', iB, rk => rk.enviarPuntaje('esquiva', 7000, { t: 80, cup: 50, casi: 3, zone: 3 })); add(c[0].body);
  c = await envioNavegador('esquiva', iC, rk => rk.enviarPuntaje('esquiva', 999999, { t: 30, cup: 10, casi: 0, zone: 1 })); add(c[0].body); // imposible
  c = await envioNavegador('toca', iA, rk => rk.enviarPuntaje('toca', 6000, { taps: 150 })); add(c[0].body);
  c = await envioNavegador('toca', iC, rk => rk.enviarPuntaje('toca', 9000, { taps: 100 })); add(c[0].body); // > 50/toque
  c = await envioNavegador('cuanto', iC, rk => rk.enviarPuntaje('cuanto', 4200, { ok: 8, R: 10 })); add(c[0].body);
  c = await envioNavegador('esquiva', iA, rk => rk.enviarTon('UQCjyCtuNv_4WD_oKNcpC-3shkA95PMTS8WLKI8B4I0FV0Zu')); add(c[0].body);
  // firma falsa (otro token) e initData vencido
  add(C.cifrarEnvio({ tipo: 'puntaje', juego: 'cuanto', score: 100, st: { ok: 1, R: 10 }, initData: initData(beto, ahora - 60, crypto.createHmac('sha256', 'WebAppData').update('otro').digest('hex')) }, publicKey.export({ type: 'spki', format: 'pem' })));
  add(C.cifrarEnvio({ tipo: 'puntaje', juego: 'cuanto', score: 100, st: { ok: 1, R: 10 }, initData: initData(beto, ahora - 3 * 86400) }, publicKey.export({ type: 'spki', format: 'pem' })));
  add('basura sin cifrar');
  // Ana mejora en esquiva más tarde; mensaje repetido (mismo id) se ignora
  c = await envioNavegador('esquiva', iA, rk => rk.enviarPuntaje('esquiva', 8000, { t: 90, cup: 60, casi: 4, zone: 3 })); add(c[0].body, ahora + 60);
  msgs.push(Object.assign({}, msgs[msgs.length - 1]));
  // prueba del no-reenvío con el mismo almacenamiento
  const c2 = await envioNavegador('toca', iA, async rk => { await rk.enviarPuntaje('toca', 500, { taps: 50 }); await rk.enviarPuntaje('toca', 400, { taps: 40 }); await rk.enviarPuntaje('toca', 600, { taps: 60 }) });
  if (c2.length !== 2) throw new Error('debería mandar 2 de 3 (no manda puntajes peores): ' + c2.length);

  const entrada = path.join(tmp, 'entrada.jsonl'); fs.writeFileSync(entrada, msgs.map(m => JSON.stringify(m)).join('\n'));
  const env = Object.assign({}, process.env, { TG_WEBAPP_SECRET: secreto, RANKING_PRIVATE_KEY: privPem, RANKING_ENTRADA: entrada });
  const datos = path.join(tmp, 'datos');
  console.log(cp.execFileSync('node', [path.join(__dirname, 'procesar.js'), datos], { env }).toString());
  // segunda corrida con los mismos mensajes: no debe duplicar nada
  console.log(cp.execFileSync('node', [path.join(__dirname, 'procesar.js'), datos], { env }).toString());
  const pub = JSON.parse(fs.readFileSync(path.join(datos, 'publico', 'actual.json'), 'utf8'));
  console.log(JSON.stringify(pub.juegos, null, 1));
  const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('✔', m) };
  ok(pub.juegos.esquiva.length === 2 && pub.juegos.esquiva[0].n === 'Ana L.' && pub.juegos.esquiva[0].s === 8000, 'esquiva: Ana 1.º con 8000, Caro (imposible) fuera');
  ok(pub.juegos.esquiva[1].n === 'Betoscript', 'nombre limpio (sin <>)');
  ok(pub.juegos.toca.length === 1, 'toca: puntaje imposible rechazado');
  ok(pub.juegos.cuanto.length === 1 && pub.juegos.cuanto[0].n === 'Caro', 'cuanto: firma falsa y vencido rechazados');
  ok(pub.juegos.esquiva[0].c === C.codigoJugador(1001), 'código público');
  ok(!JSON.stringify(pub).includes('ana_mx') && !JSON.stringify(pub).includes('1001'), 'la tabla pública no tiene @usuario ni id');
  fs.writeFileSync(path.join(tmp, 'k.pem'), privPem);
  console.log(cp.execFileSync('node', [path.join(__dirname, 'ganadores.js'), datos, pub.semana], { env: Object.assign({}, process.env, { RANKING_PRIVATE_KEY_FILE: path.join(tmp, 'k.pem') }) }).toString());
  // semana: domingo 23:59 CDMX vs lunes 00:00
  const L = C.limitesSemana(pub.semana);
  ok(C.semanaDe(L.cierre) === pub.semana && C.semanaDe(L.cierre + 1) !== pub.semana, 'corte domingo 23:59:59 / lunes 00:00 CDMX');
  console.log('Corte de esta semana:', new Date(L.cierre).toLocaleString('es-MX', { timeZone: C.ZONA }), '(CDMX) =', new Date(L.cierre).toISOString());
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nTODO BIEN ✅');
})().catch(e => { console.error(e); process.exit(1) });
