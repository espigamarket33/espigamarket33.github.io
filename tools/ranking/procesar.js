#!/usr/bin/env node
/* Procesa los envíos del ranking semanal (lo corre GitHub Actions cada ~10 min).
   Uso: node tools/ranking/procesar.js <carpeta-de-datos>
   Variables: TG_WEBAPP_SECRET (hex, derivado del token del bot), RANKING_PRIVATE_KEY (PEM), NTFY_TOPIC
   Opcional para pruebas: RANKING_ENTRADA=<archivo .jsonl> en lugar de leer de ntfy, RANKING_AHORA=<ms> */
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./core');

const DIR = path.resolve(process.argv[2] || 'datos');
const SECRETO = (process.env.TG_WEBAPP_SECRET || '').trim();
const PRIV = (process.env.RANKING_PRIVATE_KEY || '').trim();
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const AHORA = +process.env.RANKING_AHORA || Date.now();
const TOP = 50;
if (!/^[0-9a-f]{64}$/.test(SECRETO)) throw new Error('Falta TG_WEBAPP_SECRET');
if (!PRIV.includes('PRIVATE KEY')) throw new Error('Falta RANKING_PRIVATE_KEY');

const archEstado = path.join(DIR, 'privado', 'estado.enc');
let E = { v: 1, cursor: 0, vistos: {}, semanas: {}, usuarios: {}, envios: {}, stats: {} };
if (fs.existsSync(archEstado)) E = C.descifrarEstado(fs.readFileSync(archEstado, 'utf8'), PRIV);

async function leerMensajes() {
  if (process.env.RANKING_ENTRADA) return fs.readFileSync(process.env.RANKING_ENTRADA, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(TOPIC)) throw new Error('Falta NTFY_TOPIC');
  // ntfy guarda los mensajes 12 h; se piden desde el último visto menos 15 min y se descartan repetidos por id
  const since = E.cursor ? String(Math.max(0, E.cursor - 900)) : 'all';
  const r = await fetch('https://ntfy.sh/' + TOPIC + '/json?poll=1&since=' + since, { headers: { 'User-Agent': 'espigamarket33-ranking' } });
  if (!r.ok) throw new Error('ntfy respondió ' + r.status);
  return (await r.text()).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return null } }).filter(Boolean);
}
let nuevos = 0;
const stat = k => { E.stats[k] = (E.stats[k] || 0) + 1 };

function procesar(m) {
  if (m.event !== 'message' || !m.id || !m.time) return;
  if (E.vistos[m.id]) return;
  E.vistos[m.id] = m.time; nuevos++;
  if (m.time > E.cursor) E.cursor = m.time;
  let d;
  try { d = C.descifrarEnvio(m.message, PRIV) } catch (e) { return stat('rechazo: no se pudo descifrar') }
  const v = C.verificarInitData(d && d.initData, SECRETO);
  if (!v.ok) return stat('rechazo: ' + v.motivo);
  const sesion = m.time - v.authDate;
  if (sesion > C.MAX_EDAD_INITDATA || sesion < -300) return stat('rechazo: initData vencido');
  const id = String(v.user.id);
  const u = E.usuarios[id] = Object.assign(E.usuarios[id] || {}, {
    n: C.nombrePublico(v.user), u: v.user.username ? String(v.user.username).slice(0, 40) : '',
    fn: String(v.user.first_name || '').slice(0, 64), ln: String(v.user.last_name || '').slice(0, 64),
    c: C.codigoJugador(id), ult: m.time
  });
  const dia = C.diaCDMX(m.time * 1000);
  const k = id + '|' + dia;
  E.envios[k] = (E.envios[k] || 0) + 1;
  if (E.envios[k] > C.MAX_ENVIOS_DIA) return stat('rechazo: demasiados envíos en el día');
  if (d.tipo === 'ton') {
    if (!C.tonValida(d.ton)) return stat('rechazo: dirección TON inválida');
    u.ton = d.ton; u.tonT = m.time; return stat('ok: dirección TON');
  }
  if (d.tipo !== 'puntaje') return stat('rechazo: tipo');
  const motivo = C.revisarPuntaje(d.juego, d.score, d.st, sesion);
  if (motivo) return stat('rechazo: ' + d.juego + ': ' + motivo);
  const sem = C.semanaDe(m.time * 1000);
  const S = E.semanas[sem] = E.semanas[sem] || {};
  const J = S[d.juego] = S[d.juego] || {};
  const prev = J[id];
  if (!prev || d.score > prev.s) { J[id] = { s: d.score, t: m.time }; stat('ok: puntaje') } else stat('ok: no superó su mejor');
}

function tabla(sem, juego) {
  const J = (E.semanas[sem] || {})[juego] || {};
  return Object.entries(J).sort((a, b) => b[1].s - a[1].s || a[1].t - b[1].t).slice(0, TOP)
    .map(([id, r], i) => ({ p: i + 1, n: (E.usuarios[id] || {}).n || 'Jugador', c: C.codigoJugador(id), s: r.s }));
}
function publico(sem) {
  const L = C.limitesSemana(sem), juegos = {}, jugadores = {};
  for (const j of C.JUEGOS) { juegos[j] = tabla(sem, j); jugadores[j] = Object.keys((E.semanas[sem] || {})[j] || {}).length }
  return { semana: sem, zona: C.ZONA, inicio: new Date(L.inicio).toISOString(), cierre: new Date(L.cierre).toISOString(), cerrada: AHORA > L.cierre, actualizado: new Date(AHORA).toISOString(), jugadores, juegos };
}
const escribir = (rel, txt) => { const f = path.join(DIR, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt) };

(async () => {
  const msgs = await leerMensajes();
  msgs.sort((a, b) => (a.time || 0) - (b.time || 0));
  msgs.forEach(procesar);
  // limpieza: ids vistos > 14 h, contadores > 3 días, semanas > 10
  const lim = Math.floor(AHORA / 1000) - 14 * 3600;
  for (const [k, t] of Object.entries(E.vistos)) if (t < lim) delete E.vistos[k];
  const diasOk = new Set([0, 1, 2].map(n => C.diaCDMX(AHORA - n * 86400000)));
  for (const k of Object.keys(E.envios)) if (!diasOk.has(k.split('|')[1])) delete E.envios[k];
  const sems = Object.keys(E.semanas).sort();
  while (sems.length > 10) delete E.semanas[sems.shift()];

  const actual = C.semanaDe(AHORA);
  // sin envíos nuevos solo se reescribe una vez por hora (para no llenar el historial de commits)
  const hora = new Date(AHORA).toISOString().slice(0, 13);
  if (!nuevos && E.ultimaHora === hora && E.ultimaSemana === actual && fs.existsSync(archEstado)) { console.log('Sin envíos nuevos · nada que escribir'); return }
  E.ultimaHora = hora; E.ultimaSemana = actual;
  const anterior = C.semanaDe(C.limitesSemana(actual).inicio - 1);
  escribir('publico/actual.json', JSON.stringify(publico(actual)));
  escribir('publico/anterior.json', JSON.stringify(publico(anterior)));
  for (const s of Object.keys(E.semanas)) escribir('publico/semanas/' + s + '.json', JSON.stringify(publico(s)));
  escribir('privado/estado.enc', C.cifrarEstado(E, PRIV));
  console.log('Mensajes leídos:', msgs.length, '· nuevos:', nuevos, '· semana actual:', actual);
  console.log('Contadores:', JSON.stringify(E.stats));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1) });
