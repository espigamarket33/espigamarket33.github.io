#!/usr/bin/env node
/* Lista privada de ganadores (solo en la compu que tiene la llave privada).
   Uso: RANKING_PRIVATE_KEY_FILE=/ruta/llave.pem node tools/ranking/ganadores.js <carpeta-datos> [semana YYYY-MM-DD] [cuantos=3]
   Sin semana: la semana anterior (la que ya cerró). */
'use strict';
const fs = require('fs'), path = require('path'), C = require('./core');
const DIR = path.resolve(process.argv[2] || 'datos');
const PRIV = fs.readFileSync(process.env.RANKING_PRIVATE_KEY_FILE, 'utf8');
const E = C.descifrarEstado(fs.readFileSync(path.join(DIR, 'privado', 'estado.enc'), 'utf8'), PRIV);
const sem = process.argv[3] || C.semanaDe(C.limitesSemana(C.semanaDe(Date.now())).inicio - 1);
const n = +process.argv[4] || 3;
const L = C.limitesSemana(sem);
const f = ms => new Date(ms).toLocaleString('es-MX', { timeZone: C.ZONA });
console.log('Semana ' + sem + ' · del ' + f(L.inicio) + ' al ' + f(L.cierre) + ' (hora CDMX)');
for (const j of C.JUEGOS) {
  const J = (E.semanas[sem] || {})[j] || {};
  const filas = Object.entries(J).sort((a, b) => b[1].s - a[1].s || a[1].t - b[1].t).slice(0, n);
  console.log('\n== ' + j + ' (' + Object.keys(J).length + ' jugadores)');
  if (!filas.length) console.log('  (sin puntajes)');
  filas.forEach(([id, r], i) => { const u = E.usuarios[id] || {};
    console.log('  ' + (i + 1) + '. ' + (u.fn || '') + ' ' + (u.ln || '') + (u.u ? ' @' + u.u : ' (sin @usuario)') + ' · id ' + id + ' · código ' + C.codigoJugador(id) + ' · ' + r.s + ' pts · ' + f(r.t * 1000) + ' · TON: ' + (u.ton || 'NO HA DADO DIRECCIÓN')) });
}
console.log('\nContadores:', JSON.stringify(E.stats));
