/* Espiga Market 33 · capa de Telegram Mini App (tg.js)
   Se carga ANTES de motor.js en las páginas de /tg/. Funciona también en un navegador normal:
   si no existe window.Telegram.WebApp, todo cae a localStorage y a enlaces web normales. */
(function(){
'use strict';
var CFG=window.TG_CONFIG={
  canal:'https://t.me/espigamarket33',
  urlCompartir:'https://t.me/EspigaMarket33Bot/jugar',
  textoCompartir:'🎮 ¡Juega conmigo a los mini juegos de Espiga Market 33! Gratis y sin descargar nada.',
  marcaFondo:'#14062b'
};
var W=(window.Telegram&&window.Telegram.WebApp)||null;
/* initData vacío = abierto fuera de Telegram (el SDK igual define el objeto) */
var EN_TG=!!(W&&W.initData);
var ver=function(v){try{return !!(W&&W.isVersionAtLeast&&W.isVersionAtLeast(v))}catch(e){return false}};
var page=(document.documentElement.getAttribute('data-tg-page')||'hub');
var esJuego=page!=='hub';
var TG=window.TG={enTelegram:EN_TG,webApp:W,config:CFG};
document.documentElement.classList.toggle('in-tg',EN_TG);

/* ---------- arranque: ready, expand, colores, swipes ---------- */
if(EN_TG){
  try{W.ready()}catch(e){}
  try{W.expand()}catch(e){}
  try{if(ver('6.1')){W.setHeaderColor(CFG.marcaFondo);W.setBackgroundColor(CFG.marcaFondo)}}catch(e){}
  try{if(ver('7.10')&&W.setBottomBarColor)W.setBottomBarColor(CFG.marcaFondo)}catch(e){}
  /* Evita que deslizar hacia abajo cierre la app mientras se juega */
  try{if(ver('7.7')){if(esJuego)W.disableVerticalSwipes();else W.enableVerticalSwipes()}}catch(e){}
  /* Botón Atrás nativo: de un juego regresa al menú de juegos */
  try{if(ver('6.1')&&W.BackButton){if(esJuego){W.BackButton.show();W.BackButton.onClick(function(){TG.haptic('light');location.href='index.html'})}else W.BackButton.hide()}}catch(e){}
}

/* ---------- tema y áreas seguras como variables CSS ---------- */
function aplicarTema(){
  var r=document.documentElement.style,tp=(W&&W.themeParams)||{};
  if(tp.button_color)r.setProperty('--tgx-btn',tp.button_color);
  if(tp.button_text_color)r.setProperty('--tgx-btn-txt',tp.button_text_color);
  if(tp.link_color)r.setProperty('--tgx-link',tp.link_color);
  var sa=(W&&W.safeAreaInset)||{},ca=(W&&W.contentSafeAreaInset)||{};
  ['top','bottom','left','right'].forEach(function(k){r.setProperty('--tgx-safe-'+k,((sa[k]||0)+(ca[k]||0))+'px')});
}
aplicarTema();
if(EN_TG){['themeChanged','safeAreaChanged','contentSafeAreaChanged','viewportChanged'].forEach(function(ev){try{W.onEvent(ev,aplicarTema)}catch(e){}})}

/* ---------- vibración háptica ---------- */
TG.haptic=function(t){
  try{
    if(EN_TG&&ver('6.1')&&W.HapticFeedback){
      var H=W.HapticFeedback;
      if(t==='success'||t==='error'||t==='warning')H.notificationOccurred(t);
      else if(t==='select')H.selectionChanged();
      else H.impactOccurred(t||'light');
    }else if(navigator.vibrate&&t&&t!=='select'){navigator.vibrate(t==='heavy'||t==='error'?40:t==='success'?[15,30,15]:10)}
  }catch(e){}
};
/* Mapa de sonidos del motor -> tipo de vibración */
var HMAP={tap:'light',click:'select',tick:'select',coin:'light',combo:'medium',near:'select',whoosh:'light',
  hit:'heavy',bad:'error',good:'success',gem:'success',power:'medium',lvl:'success',record:'success',chest:'success'};
var ultimo=0;
function engancharMotor(){
  var S=window.S;if(!S||S.__tg)return;S.__tg=1;
  var sfx=S.sfx;S.sfx=function(n,p){var now=Date.now(),h=HMAP[n];
    /* evita saturar con toques muy rápidos, pero nunca se salta choques ni aciertos */
    if(h&&(h!=='light'&&h!=='select'||now-ultimo>45)){ultimo=now;TG.haptic(h)}
    if(n==='hit')setTimeout(function(){TG.haptic('error')},60);
    return sfx.apply(this,arguments)};
  /* dentro de Telegram la vibración va por HapticFeedback (ya se manda arriba) */
  if(EN_TG)S.vib=function(){};
  /* nombre del jugador para las tablas de récords */
  var u=TG.usuario;if(u&&S.profile&&!S.profile.name){S.profile.name=String(u.first_name||'').slice(0,14);try{S.save('profile',S.profile)}catch(e){}}
}

/* ---------- usuario de Telegram ---------- */
TG.usuario=(W&&W.initDataUnsafe&&W.initDataUnsafe.user)||null;
TG.nombre=TG.usuario&&TG.usuario.first_name?TG.usuario.first_name:'';

/* ---------- guardado: CloudStorage de Telegram con respaldo en localStorage ----------
   El motor guarda todo en localStorage con prefijo shv2_. Aquí se copia a la nube de Telegram
   (máx. 4096 caracteres por valor, así que los valores grandes se parten en trozos). */
var PFX='shv2_',TS='shv2__ts',CHUNK=3900;
var CS=(EN_TG&&ver('6.9')&&W.CloudStorage)?W.CloudStorage:null;
TG.nube=!!CS;
var listo=!CS,pendiente={},timer=null;
var lsSet=Storage.prototype.setItem;
function claveNube(k){return k.replace(/[^A-Za-z0-9_-]/g,'_')}
function subir(k,v){
  var c=claveNube(k),n=Math.ceil(v.length/CHUNK)||1;
  if(n===1){CS.setItem(c,v);CS.removeItem(c+'__n')}
  else{CS.setItem(c,'');CS.setItem(c+'__n',String(n));for(var i=0;i<n;i++)CS.setItem(c+'__'+i,v.slice(i*CHUNK,(i+1)*CHUNK))}
}
function vaciar(){timer=null;if(!CS||!listo)return;var ks=Object.keys(pendiente);pendiente={};
  try{ks.forEach(function(k){var v=localStorage.getItem(k);if(v!=null)subir(k,v)});CS.setItem(TS,localStorage.getItem(TS)||String(Date.now()))}catch(e){}}
if(CS){
  Storage.prototype.setItem=function(k,v){lsSet.call(this,k,v);
    if(this===window.localStorage&&typeof k==='string'&&k.indexOf(PFX)===0&&k!==TS){
      pendiente[k]=1;
      /* antes de terminar la sincronización inicial no se marca la hora, para no pisar datos más nuevos de la nube */
      if(listo){lsSet.call(this,TS,String(Date.now()));if(!timer)timer=setTimeout(vaciar,1500)}}};
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')vaciar()});
  addEventListener('pagehide',vaciar);
  /* Al abrir: si la nube tiene datos más nuevos (otro teléfono), se bajan y se recarga una vez */
  try{CS.getKeys(function(err,keys){
    if(err||!keys){terminar();return}
    var mios=keys.filter(function(k){return k.indexOf(PFX)===0&&!/__(n|\d+)$/.test(k)});
    if(!mios.length){listo=true;subirTodo();return}
    CS.getItems(keys.filter(function(k){return k.indexOf(PFX)===0}),function(e2,vals){
      if(e2||!vals){terminar();return}
      var tsN=+vals[TS]||0,tsL=+localStorage.getItem(TS)||0;
      if(tsN>tsL){
        mios.forEach(function(k){if(k===TS)return;var n=+vals[k+'__n']||0,v=vals[k];
          if(n){v='';for(var i=0;i<n;i++)v+=vals[k+'__'+i]||''}
          if(v)lsSet.call(localStorage,k,v)});
        lsSet.call(localStorage,TS,String(tsN));
        if(!sessionStorage.getItem('tg_sync')){sessionStorage.setItem('tg_sync','1');location.reload();return}
      }else if(tsL>tsN){subirTodo();return}
      terminar();
    })})}catch(e){terminar()}
}
function terminar(){listo=true;if(Object.keys(pendiente).length){lsSet.call(localStorage,TS,String(Date.now()));vaciar()}}
function subirTodo(){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(PFX)===0&&k!==TS)pendiente[k]=1}
  if(!localStorage.getItem(TS))lsSet.call(localStorage,TS,String(Date.now()));listo=true;vaciar()}

/* ---------- compartir y canal ---------- */
TG.compartir=function(texto){
  TG.haptic('medium');
  var url=CFG.urlCompartir,txt=texto||CFG.textoCompartir;
  var share='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(txt);
  if(EN_TG&&ver('6.1')){try{W.openTelegramLink(share);return}catch(e){}}
  if(navigator.share){navigator.share({title:'Espiga Market 33',text:txt,url:url}).catch(function(){});return}
  window.open(share,'_blank','noopener');
};
TG.abrirCanal=function(){TG.haptic('light');if(EN_TG){try{W.openTelegramLink(CFG.canal);return}catch(e){}}window.open(CFG.canal,'_blank','noopener')};

/* ---------- anuncios recompensados (Adsgram) ----------
   SDK: https://sad.adsgram.ai/js/sad.min.js  (docs.adsgram.ai)
   Solo se muestran si el jugador toca el botón. Nunca se lanzan solos. */
var ADSGRAM_BLOCK_ID='61619';
var adCtrl=null,adBusy=false;
function escTxt(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function adsgramListo(){return !!(window.Adsgram&&typeof window.Adsgram.init==='function')}
TG.puedeAnuncio=function(){return !!(EN_TG&&adsgramListo())};
function ctrlAds(){
  if(adCtrl)return adCtrl;
  if(!adsgramListo())return null;
  try{adCtrl=window.Adsgram.init({blockId:String(ADSGRAM_BLOCK_ID)})}catch(e){adCtrl=null}
  return adCtrl;
}
function falloAd(result,desc,state){
  var r=(result&&typeof result==='object')?result:{description:String(result||desc||'error')};
  return {done:false,error:r.error!==false,description:r.description||desc||'sin anuncio',state:r.state||state||'load',mostrado:false};
}
TG.showAd=window.showAd=function(){
  if(adBusy)return Promise.reject(falloAd(null,'anuncio en curso','load'));
  if(!EN_TG)return Promise.reject(falloAd(null,'fuera de Telegram','load'));
  var ctrl=ctrlAds();
  if(!ctrl)return Promise.reject(falloAd(null,'sdk no disponible','load'));
  adBusy=true;
  var listo=function(){adBusy=false};
  try{
    return Promise.resolve(ctrl.show()).then(function(result){
      listo();
      var r=result||{};
      if(r.done===false){
        return Promise.reject({done:false,error:!!r.error,description:r.description||'anuncio no completado',state:r.state||'destroy',mostrado:true});
      }
      return {done:true,reward:true,mostrado:true,description:r.description||'completado',state:r.state||'destroy',error:false};
    },function(result){
      listo();
      return Promise.reject(falloAd(result,'sin anuncio','load'));
    });
  }catch(e){
    listo();
    return Promise.reject(falloAd(e,e&&e.message||'error','load'));
  }
};
TG.avisoAnuncio=function(fuera){
  if(window.S&&S.toast){
    if(fuera||!EN_TG)S.toast('📺','Solo en Telegram','Abre el juego desde el bot para ver anuncios.');
    else S.toast('📺','No hay anuncio ahora','Puedes seguir jugando igual.');
  }
};
/* Modal opcional antes del resultado: el jugador elige ver el anuncio o pasar. */
TG.ofrecerContinuar=function(o){
  o=o||{};
  if(!TG.puedeAnuncio()||!window.S||!S.modal){if(o.onSkip)o.onSkip();return}
  var si=o.si||'📺 Ver anuncio para continuar · +1 vida';
  var m=S.modal(
    '<div class="big-emoji">📺</div><h2>'+escTxt(o.titulo||'¿Continuar?')+'</h2>'+
    '<p style="opacity:.85;margin:8px 0 18px">'+escTxt(o.sub||'Mira un anuncio corto para seguir jugando.')+'</p>'+
    '<button class="btn big tgx-ad" type="button" id="tgAdSi">'+escTxt(si)+'</button>'+
    '<button class="btn sec" type="button" id="tgAdNo" style="margin-top:12px;width:100%">'+escTxt(o.no||'Ver resultado')+'</button>',
    {close:false}
  );
  var bSi=m.querySelector('#tgAdSi'),bNo=m.querySelector('#tgAdNo'),cerrado=false;
  function close(){if(cerrado)return;cerrado=true;m.close()}
  bNo.onclick=function(){if(cerrado)return;try{S.sfx('click')}catch(e){}close();if(o.onSkip)o.onSkip()};
  bSi.onclick=function(){
    if(cerrado||bSi.disabled)return;
    bSi.disabled=true;if(bNo)bNo.disabled=true;
    bSi.textContent='Cargando anuncio…';
    TG.showAd().then(function(res){
      close();
      try{if(o.onReward)o.onReward(res)}catch(e){}
    }).catch(function(){
      bSi.disabled=false;if(bNo)bNo.disabled=false;
      bSi.textContent=si;
      TG.avisoAnuncio();
    });
  };
};

/* En la pantalla de resultado, si el juego pasa o.ad, se agrega un botón de recompensa (un toque, no automático). */
function engancharResultado(){
  var S=window.S;if(!S||S.__tgAd||!S.result)return;S.__tgAd=1;
  var orig=S.result;
  S.result=function(o){
    o=o||{};
    var ad=o.ad,label=ad&&ad.label;
    if(ad&&label&&TG.puedeAnuncio()){
      o.extra=(o.extra||'')+'<button class="btn big tgx-ad" type="button" id="rAd" style="margin-top:12px;width:100%">'+escTxt(label)+'</button>';
    }else ad=null;
    var r=orig.call(S,o);
    var btn=document.getElementById('rAd');
    if(btn&&ad){
      btn.addEventListener('click',function(){
        if(btn.disabled)return;
        btn.disabled=true;btn.textContent='Cargando anuncio…';
        TG.showAd().then(function(res){
          btn.remove();
          try{if(ad.onReward)ad.onReward(res)}catch(e){}
        }).catch(function(){
          btn.disabled=false;btn.textContent=label;
          TG.avisoAnuncio();
        });
      });
    }
    return r;
  };
}

/* ---------- al cargar la página ---------- */
function botonesExtra(){
  /* botón Compartir junto a cada botón del canal */
  document.querySelectorAll('.tg-btn').forEach(function(a){
    if(a.dataset.tgx)return;a.dataset.tgx=1;
    a.addEventListener('click',function(e){if(EN_TG){e.preventDefault();TG.abrirCanal()}});
    if(a.nextElementSibling&&a.nextElementSibling.classList.contains('tgx-share'))return;
    var b=document.createElement('button');b.type='button';b.className='tgx-share';
    b.innerHTML='📤 Compartir con amigos';b.addEventListener('click',function(){TG.compartir()});
    a.parentNode.insertBefore(b,a.nextSibling);
  });
}
function enlaces(){
  /* dentro de Telegram, los enlaces externos se abren con el navegador de Telegram */
  document.addEventListener('click',function(e){
    if(!EN_TG)return;var a=e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented)return;
    var h=a.href;if(!/^https?:/i.test(h)||a.origin===location.origin)return;
    e.preventDefault();
    try{if(/^https?:\/\/t\.me\//i.test(h))W.openTelegramLink(h);else W.openLink(h)}catch(err){window.open(h,'_blank')}
  });
}
function saludo(){
  var el=document.getElementById('tgHola');
  if(el)el.textContent=TG.nombre?('¡Hola, '+TG.nombre+'! 👋'):'¡Hola! 👋';
  if(esJuego&&TG.nombre&&window.S&&S.toast&&!sessionStorage.getItem('tg_hola_'+page)){
    sessionStorage.setItem('tg_hola_'+page,'1');setTimeout(function(){try{S.toast('👋','¡Hola, '+TG.nombre+'!','¡Suerte en el juego!')}catch(e){}},600)}
}
function alCargar(){engancharMotor();engancharResultado();botonesExtra();saludo()}
enlaces();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',alCargar);else alCargar();
})();
