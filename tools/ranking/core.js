/* Espiga Market 33 · Ranking semanal · lógica compartida (Node 18+)
   - Verifica initData de Telegram (HMAC con el secreto derivado del token del bot; el token NO se usa aquí)
   - Descifra los envíos (RSA-OAEP-256 + AES-256-GCM)
   - Límites anti-trampa por juego
   - Semanas en hora de Ciudad de México (lunes 00:00 a domingo 23:59:59) */
'use strict';
const crypto = require('crypto');

const ZONA = 'America/Mexico_City';
const JUEGOS = ['esquiva', 'toca', 'cuanto'];
const MAX_EDAD_INITDATA = 24 * 3600;      // segundos: initData válido hasta 24 h después de abrir la app
const MAX_ENVIOS_DIA = 150;               // por jugador y día (hora CDMX)

/* ---------- initData ---------- */
// secretoWebApp = HMAC_SHA256(key="WebAppData", msg=token)  (hex). Se calcula una vez en la compu de la usuaria.
function verificarInitData(initData, secretoHex) {
  if (typeof initData !== 'string' || initData.length > 4096) return { ok: false, motivo: 'initData inválido' };
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, motivo: 'sin hash' };
  const pares = [];
  for (const [k, v] of p) if (k !== 'hash') pares.push(k + '=' + v);
  pares.sort();
  const calc = crypto.createHmac('sha256', Buffer.from(secretoHex, 'hex')).update(pares.join('\n')).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'))) return { ok: false, motivo: 'firma incorrecta' };
  let user = null;
  try { user = JSON.parse(p.get('user') || 'null') } catch (e) { }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, motivo: 'sin usuario' };
  const authDate = parseInt(p.get('auth_date'), 10);
  if (!Number.isFinite(authDate)) return { ok: false, motivo: 'sin auth_date' };
  return { ok: true, user, authDate };
}

/* ---------- cifrado ---------- */
// Formato del envío (texto): "v1." + base64url(rsaKey) + "." + base64url(iv) + "." + base64url(ct+tag)
function descifrarEnvio(texto, privPem) {
  if (typeof texto !== 'string' || !texto.startsWith('v1.')) throw new Error('formato');
  const [, a, b, c] = texto.split('.');
  const clave = crypto.privateDecrypt({ key: privPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(a, 'base64url'));
  if (clave.length !== 32) throw new Error('clave');
  const iv = Buffer.from(b, 'base64url'), datos = Buffer.from(c, 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  d.setAuthTag(datos.subarray(datos.length - 16));
  const plano = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]).toString('utf8');
  return JSON.parse(plano);
}
// Para pruebas: cifra igual que el navegador
function cifrarEnvio(obj, pubPem) {
  const clave = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  const k = crypto.publicEncrypt({ key: pubPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, clave);
  return 'v1.' + k.toString('base64url') + '.' + iv.toString('base64url') + '.' + ct.toString('base64url');
}
// Estado privado (en la rama pública de datos va cifrado con AES-256-GCM; la clave sale de la llave privada)
function claveEstado(privPem) { return crypto.createHash('sha256').update('em33-estado|' + privPem.trim()).digest() }
function cifrarEstado(obj, privPem) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', claveEstado(privPem), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return 'e1.' + iv.toString('base64url') + '.' + ct.toString('base64url');
}
function descifrarEstado(texto, privPem) {
  const [v, b, c] = String(texto).trim().split('.');
  if (v !== 'e1') throw new Error('estado: formato');
  const datos = Buffer.from(c, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', claveEstado(privPem), Buffer.from(b, 'base64url'));
  d.setAuthTag(datos.subarray(datos.length - 16));
  return JSON.parse(Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]).toString('utf8'));
}

/* ---------- código público del jugador (el navegador calcula el mismo) ---------- */
function codigoJugador(id) { return crypto.createHash('sha256').update('em33:' + id).digest('hex').slice(0, 6).toUpperCase() }

/* ---------- semanas en hora de CDMX ---------- */
function partesCDMX(ms) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const o = {}; for (const x of f.formatToParts(new Date(ms))) o[x.type] = x.value;
  return o;
}
function offsetCDMX(ms) { // minutos de diferencia local-UTC
  const o = partesCDMX(ms);
  const comoUTC = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  return Math.round((comoUTC - Math.floor(ms / 1000) * 1000) / 60000);
}
function diaCDMX(ms) { const o = partesCDMX(ms); return o.year + '-' + o.month + '-' + o.day }
// Semana = fecha (YYYY-MM-DD) del lunes en CDMX
function semanaDe(ms) {
  const o = partesCDMX(ms);
  const dow = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[o.weekday];
  const d = new Date(Date.UTC(+o.year, +o.month - 1, +o.day - dow));
  return d.toISOString().slice(0, 10);
}
function limitesSemana(semana) { // ms UTC de inicio (lunes 00:00 CDMX) y cierre (domingo 23:59:59.999 CDMX)
  const [y, m, d] = semana.split('-').map(Number);
  const aprox = Date.UTC(y, m - 1, d, 12);
  const ini = Date.UTC(y, m - 1, d) - offsetCDMX(aprox) * 60000;
  const finAprox = Date.UTC(y, m - 1, d + 7, 12);
  const fin = Date.UTC(y, m - 1, d + 7) - offsetCDMX(finAprox) * 60000 - 1;
  return { inicio: ini, cierre: fin };
}

/* ---------- anti-trampa ---------- */
const entero = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
function revisarPuntaje(juego, score, st, segundosSesion) {
  if (!JUEGOS.includes(juego)) return 'juego desconocido';
  if (!entero(score, 1, 5000000)) return 'puntaje inválido';
  st = st || {};
  if (juego === 'esquiva') {
    const t = st.t, cup = st.cup, casi = st.casi, zone = st.zone;
    if (typeof t !== 'number' || !(t >= 1 && t <= 7200)) return 'tiempo inválido';
    if (!entero(cup, 0, 100000) || !entero(casi, 0, 100000) || !entero(zone, 0, 4)) return 'datos inválidos';
    if (cup > t * 6 + 5 || casi > t * 3 + 5) return 'demasiados cupones';
    // máx. real: 190 pts/s por distancia (x2) + 100 por cupón + 125 por "por poco" + 100 por zona
    const max = (200 * t + 100 * cup + 125 * casi + 600) * 1.1;
    if (score > max) return 'puntaje imposible';
    if (segundosSesion != null && t > segundosSesion + 120) return 'partida más larga que la sesión';
  } else if (juego === 'toca') {
    const taps = st.taps;
    if (!entero(taps, 1, 375)) return 'toques inválidos';       // 25 toques/s durante 15 s
    if (score % 10 !== 0 || score > taps * 50) return 'puntaje imposible';
    if (segundosSesion != null && segundosSesion < 10) return 'demasiado rápido';
  } else if (juego === 'cuanto') {
    const ok = st.ok, R = st.R;
    if (!entero(R, 1, 11) || !entero(ok, 0, R)) return 'datos inválidos';
    const max = ok * 975 + (ok === R && R >= 10 ? 500 : 0);
    if (score > max) return 'puntaje imposible';
    if (segundosSesion != null && segundosSesion < ok * 1) return 'demasiado rápido';
  }
  return null;
}

function nombrePublico(u) {
  const limpio = s => String(s || '').replace(/[\u0000-\u001f<>"'`&]/g, '').replace(/\s+/g, ' ').trim();
  let n = limpio(u.first_name).slice(0, 14);
  const a = limpio(u.last_name);
  if (a) n += ' ' + a[0] + '.';
  return n || 'Jugador';
}
function tonValida(a) {
  return typeof a === 'string' && (/^[UEk0][Q][A-Za-z0-9_-]{46}$/.test(a) || /^-?[01]:[0-9a-fA-F]{64}$/.test(a));
}

module.exports = { ZONA, JUEGOS, MAX_EDAD_INITDATA, MAX_ENVIOS_DIA, verificarInitData, descifrarEnvio, cifrarEnvio, cifrarEstado, descifrarEstado, codigoJugador, semanaDe, limitesSemana, diaCDMX, revisarPuntaje, nombrePublico, tonValida };
