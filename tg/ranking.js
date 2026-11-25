/* Espiga Market 33 · Ranking semanal (cliente). Se carga después de tg.js en /tg/.
   Envía tu mejor puntaje de la semana (cifrado) a una cola pública; un proceso en GitHub Actions
   verifica la firma de Telegram (initData) y publica la tabla. Fuera de Telegram no envía nada. */
(function(){
'use strict';
var RK=window.RANKING={
  topic:'em33rk_nZwo4SHQptYQZ4UVIF',
  llave:'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtKiz9fjwHJbjcy2SkIUtoCq/n6GVnVYNNBTVw3nAbiLZwOINsbU26Vu97V7uHa50IFvpdkK8O2oinkPjf1jZKXGVSbEdUu+HW9xoJhyjWnyRs07dxqwZUU21lCvlCHPRp1P388/VkuniGXu/IXC8QnPDMj+6QK92L+FNztMUWVB41anXWQBSyyFQiCeKKEOSHtGYFazP0+dB9qhaIPHKIfjQkABl32j6ci7cjEJMTWI26Ps3XLwXoQSy/IKNNXsezSVF4FFiLE2sbgjUw9xjiViseZRc8x6cyY4XQQ8AIoSg8GQaySXhAn/zaWOLKC1yuyapIKPMB+SbOHFTOcO48QIDAQAB',
  datos:'https://raw.githubusercontent.com/espigamarket33/espigamarket33.github.io/ranking-data/publico/',
  config:'ranking-config.json',
  juegos:{esquiva:{n:'Esquiva y Junta',e:'🏃',board:'main'},toca:{n:'Toca y Gana · Reto 15 s',e:'🪙',board:'reto'},cuanto:{n:'¿Cuánto Cuesta?',e:'🤔',board:'main'}},
  zona:'America/Mexico_City'
};
var TG=window.TG||{},W=TG.webApp,EN_TG=!!TG.enTelegram;
var page=document.documentElement.getAttribute('data-tg-page')||'';
RK.enTelegram=EN_TG;
RK.usuario=TG.usuario||null;

/* ---------- semana (lunes 00:00 a domingo 23:59 hora CDMX) ---------- */
function partes(ms){var o={};new Intl.DateTimeFormat('en-CA',{timeZone:RK.zona,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date(ms)).forEach(function(x){o[x.type]=x.value});return o}
RK.semana=function(ms){var o=partes(ms||Date.now());var dow={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[o.weekday];return new Date(Date.UTC(+o.year,+o.month-1,+o.day-dow)).toISOString().slice(0,10)};

/* ---------- código público del jugador = SHA-256("em33:"+id), 6 caracteres ---------- */
RK.codigo=function(){
  if(!RK.usuario||!window.crypto||!crypto.subtle)return Promise.resolve('');
  return crypto.subtle.digest('SHA-256',new TextEncoder().encode('em33:'+RK.usuario.id)).then(function(b){
    return Array.prototype.map.call(new Uint8Array(b),function(x){return ('0'+x.toString(16)).slice(-2)}).join('').slice(0,6).toUpperCase()});
};

/* ---------- cifrado: AES-256-GCM + RSA-OAEP-256 ---------- */
function b64u(buf){var s='',a=new Uint8Array(buf);for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function cifrar(obj){
  var der=Uint8Array.from(atob(RK.llave),function(c){return c.charCodeAt(0)});
  var claveRaw=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
  return Promise.all([
    crypto.subtle.importKey('spki',der,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']),
    crypto.subtle.importKey('raw',claveRaw,{name:'AES-GCM'},false,['encrypt'])
  ]).then(function(k){
    return Promise.all([
      crypto.subtle.encrypt({name:'RSA-OAEP'},k[0],claveRaw),
      crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k[1],new TextEncoder().encode(JSON.stringify(obj)))
    ]);
  }).then(function(r){return 'v1.'+b64u(r[0])+'.'+b64u(iv)+'.'+b64u(r[1])});
}
function mandar(obj){
  if(!EN_TG||!W||!W.initData)return Promise.reject(new Error('fuera de Telegram'));
  if(!window.crypto||!crypto.subtle)return Promise.reject(new Error('sin cifrado'));
  obj.initData=W.initData;obj.v=1;
  return cifrar(obj).then(function(txt){
    return fetch('https://ntfy.sh/'+RK.topic,{method:'POST',body:txt,headers:{'Content-Type':'text/plain'}});
  }).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return true});
}

/* ---------- mejor puntaje enviado esta semana (para no mandar de más) ---------- */
var LS='em33_rk';
function leer(){try{return JSON.parse(localStorage.getItem(LS)||'{}')||{}}catch(e){return {}}}
function guardar(o){try{localStorage.setItem(LS,JSON.stringify(o))}catch(e){}}
RK.miMejor=function(juego){var o=leer(),s=RK.semana();return (o[s]&&o[s][juego]&&o[s][juego].s)||0};
RK.enviarPuntaje=function(juego,score,st){
  score=Math.floor(score||0);
  if(!EN_TG||!RK.juegos[juego]||score<=0)return Promise.resolve(false);
  var s=RK.semana(),o=leer();
  Object.keys(o).forEach(function(k){if(k!==s&&k!=='pend')delete o[k]});
  o[s]=o[s]||{};
  var prev=o[s][juego];
  if(prev&&prev.s>=score&&prev.ok)return Promise.resolve(false);
  o[s][juego]={s:score,ok:false,st:st};guardar(o);
  return mandar({tipo:'puntaje',juego:juego,score:score,st:st||{}}).then(function(){
    var o2=leer();if(o2[s]&&o2[s][juego]&&o2[s][juego].s===score){o2[s][juego].ok=true;guardar(o2)}return true;
  }).catch(function(){return false});
};
/* reintenta un envío que falló (por ejemplo sin internet) */
function reintentar(){
  var o=leer(),s=RK.semana();if(!o[s])return;
  Object.keys(o[s]).forEach(function(j){var r=o[s][j];if(r&&!r.ok)mandar({tipo:'puntaje',juego:j,score:r.s,st:r.st||{}}).then(function(){var o2=leer();if(o2[s]&&o2[s][j]&&o2[s][j].s===r.s){o2[s][j].ok=true;guardar(o2)}}).catch(function(){})});
}
RK.enviarTon=function(dir){
  dir=String(dir||'').trim();
  if(!/^[UEk0]Q[A-Za-z0-9_-]{46}$/.test(dir))return Promise.reject(new Error('Dirección no válida. Debe empezar con UQ o EQ y tener 48 caracteres.'));
  return mandar({tipo:'ton',ton:dir}).then(function(){try{localStorage.setItem('em33_rk_ton',dir)}catch(e){}return true});
};
RK.miTon=function(){try{return localStorage.getItem('em33_rk_ton')||''}catch(e){return ''}};
RK.cargar=function(cual){return fetch(RK.datos+(cual||'actual')+'.json?t='+Math.floor(Date.now()/60000),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})};
RK.cargarConfig=function(){return fetch(RK.config+'?t='+Math.floor(Date.now()/60000)).then(function(r){return r.json()}).catch(function(){return {}})};

/* ---------- datos de la partida para las revisiones anti-trampa ----------
   Cada juego pasa o.rk en S.result (esquiva: t,cup,casi,zone · toca: taps · cuanto: ok,R) */
var stPendiente=null;
/* ---------- enganche con el motor ---------- */
function enganchar(){
  var S=window.S,info=RK.juegos[page];if(!S||!info||S.__rk||!S.submit)return;S.__rk=1;
  var sub=S.submit;
  S.submit=function(score,board){
    var r=sub.apply(this,arguments);
    if((board||'main')===info.board&&stPendiente){try{RK.ultimoEnvio=RK.enviarPuntaje(page,score,stPendiente)}catch(e){}}
    stPendiente=null;
    return r;
  };
  if(!EN_TG||!S.result)return;
  var res=S.result;
  S.result=function(o){
    o=o||{};
    stPendiente=(o.rk&&typeof o.rk==='object')?o.rk:null;
    if((o.board||'main')===info.board)o.extra=(o.extra||'')+'<a class="btn sec tgx-rk" href="ranking.html?j='+page+'" style="display:block;margin-top:12px;width:100%;text-decoration:none">🏆 Ver ranking semanal</a>';
    return res.apply(this,arguments);
  };
}
function alCargar(){enganchar();if(EN_TG)setTimeout(reintentar,2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',alCargar);else alCargar();
})();
